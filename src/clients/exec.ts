import { auth, Compute, JWT, UserRefreshClient } from "google-auth-library";
import { Storage } from "@google-cloud/storage";
import { Secrets } from "./secrets";
import { v4 as uuid } from "node-uuid";
import {
  EXECUTORS,
  EXECUTOR_WHITELIST,
  EXEC_CLIENT,
  ExecClients
} from "../config";

export type State = "error" | "failure" | "pending" | "success";

export interface Build {
  id: string;
  secrets: Secrets;
  image: string;
  args: string[];
  env: string[];
}

export interface BuildResult {
  id: string;
}
export interface BuildLogs {
  id: string;
  state: string;
  logs: string;
}

export interface Client {
  exec: (build: Build) => Promise<BuildResult>;
  logs: (id: string) => Promise<BuildLogs>;
}

export class MockBuildClient {
  async exec(build: Build): Promise<BuildResult> {
    return { id: undefined } as any;
  }
  async logs(id: string): Promise<BuildLogs> {
    return { id, state: "SUCCESS", logs: `start ${id}...\nDONE\n` };
  }
}

export class GoogleCloudClient {
  client: Compute | JWT | UserRefreshClient | undefined;
  storage: Storage | undefined;
  projectId: string | undefined;
  logsBucket: string | undefined;
  secretsBucket: string | undefined;

  async getClient() {
    if (!this.client || !this.storage) {
      this.client = await auth.getClient({
        scopes: "https://www.googleapis.com/auth/cloud-platform"
      });
      this.storage = new Storage();
    }
    this.projectId = await auth.getProjectId();
    this.logsBucket = `${this.projectId}-builds`;
    this.secretsBucket = `${this.projectId}-secrets`;
    return {
      client: this.client,
      projectId: this.projectId,
      storage: this.storage,
      logsBucket: this.logsBucket,
      secretsBucket: this.secretsBucket
    };
  }

  async secretFile(secrets: Secrets): Promise<string> {
    const { storage, secretsBucket } = await this.getClient();
    const id = uuid().toString();

    const data: { [k: string]: string } = {};
    for (const secret of secrets) {
      data[secret.name] = secret.value;
    }

    await storage
      .bucket(secretsBucket)
      .file(`${id}.json`)
      .save(JSON.stringify(data), { contentType: "application/json" });

    const [signed] = await storage
      .bucket(secretsBucket)
      .file(`${id}.json`)
      .getSignedUrl({ action: "read", expires: inHours(1) });
    return signed;
  }

  /**
   * Store a reference from the GitHub deployment ID to the CloudBuild logs id.
   * @param id GitHub deployment id.
   * @param logsId CloudBuild id to find the logs later.
   */
  async refFile(id: string, logsId: string): Promise<void> {
    const { storage, logsBucket } = await this.getClient();
    await storage
      .bucket(logsBucket)
      .file(`owner-${id}.txt`)
      .save(logsId, { contentType: "text/plain" });
  }

  async exec(build: Build): Promise<BuildResult> {
    const { client, logsBucket, projectId } = await this.getClient();
    const secretFile = await this.secretFile(build.secrets);
    const image = EXECUTOR_WHITELIST ? EXECUTORS[build.image] : build.image;
    if (!image) {
      throw new Error(`Invalid image: ${build.image}`);
    }
    const resp = await client.request({
      url: `https://cloudbuild.googleapis.com/v1/projects/${projectId}/builds`,
      method: "POST",
      headers: { "content-type": "application/json" },
      responseType: "json",
      body: JSON.stringify({
        source: null,
        steps: [
          {
            name: image,
            env: build.env,
            args: build.args
          }
        ],
        options: {
          env: [`SECRETS_FILE=${secretFile}`]
        },
        logsBucket
      })
    });
    const { id } = (resp.data as any).metadata.build;
    await this.refFile(build.id, id);
    return { id };
  }

  async logs(githubId: string): Promise<BuildLogs> {
    const { storage, client, projectId, logsBucket } = await this.getClient();
    const [buf] = await storage
      .bucket(logsBucket)
      .file(`owner-${githubId}.txt`)
      .download();
    const id = buf.toString("utf-8");
    const logsObject = `log-${id}.txt`;
    const logResp = await client.request({
      url: `https://www.googleapis.com/storage/v1/b/${logsBucket}/o/${logsObject}?alt=media`,
      method: "GET",
      responseType: "json"
    });
    const logs = logResp.data as string;

    const buildResp = await client.request({
      url: `https://cloudbuild.googleapis.com/v1/projects/${projectId}/builds/${id}`,
      method: "GET",
      responseType: "json"
    });
    const state = (buildResp.data as any).status;
    return { logs, id, state };
  }
}

export const client: Client = ((): Client => {
  switch (EXEC_CLIENT) {
    case ExecClients.GCPBuild:
      return new GoogleCloudClient();
    default:
      return new MockBuildClient();
  }
})();

function inHours(h: number) {
  const d = new Date();
  d.setHours(d.getHours() + h);
  return d;
}
