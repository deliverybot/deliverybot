import { auth, Compute, JWT, UserRefreshClient } from "google-auth-library";
import { SECRET_CLIENT, SecretClients } from "../config";

export interface Secret {
  name: string;
  value: string;
}

export type Secrets = Secret[];

export interface Client {
  get: (id: string) => Promise<Secrets>;
  set: (id: string, val: Secrets) => Promise<void>;
}

export class MemClient {
  private store: { [k: string]: Secrets | undefined } = {};
  async get(id: string): Promise<Secrets> {
    return this.store[id] || [];
  }
  async set(id: string, val: Secrets): Promise<void> {
    this.store[id] = val;
  }
}

export class GoogleCloudClient {
  client: Compute | JWT | UserRefreshClient | undefined;
  projectId: string | undefined;
  secretsBucket: string | undefined;

  async getClient() {
    if (!this.client) {
      this.client = await auth.getClient({
        scopes: "https://www.googleapis.com/auth/cloud-platform"
      });
    }
    this.projectId = await auth.getProjectId();
    this.secretsBucket = `${this.projectId}-secrets`;
    return {
      client: this.client,
      projectId: this.projectId,
      secretsBucket: this.secretsBucket
    };
  }

  async get(id: string): Promise<Secrets> {
    const { client, secretsBucket } = await this.getClient();
    try {
      const resp = await client.request({
        url: `https://www.googleapis.com/storage/v1/b/${secretsBucket}/o/${id}.json?alt=media`,
        method: "GET",
        responseType: "json"
      });
      return (resp.data as any).secrets;
    } catch (error) {
      return [];
    }
  }

  async set(id: string, secrets: Secrets): Promise<void> {
    const { client, secretsBucket } = await this.getClient();
    await client.request({
      url: `https://${secretsBucket}.storage.googleapis.com/${id}.json`,
      method: "PUT",
      headers: { "content-type": "application/json" },
      responseType: "json",
      body: JSON.stringify({
        secrets
      })
    });
  }
}

export const client: Client = ((): Client => {
  switch (SECRET_CLIENT) {
    case SecretClients.GCPStorage:
      return new GoogleCloudClient();
    default:
      return new MemClient();
  }
})();
