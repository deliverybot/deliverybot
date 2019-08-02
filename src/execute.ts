import { State, client } from "./clients/exec";
import { BASE_URL } from "./config";
import { client as secretClient } from "./clients/secrets";

export enum Action {
  Deploy = "deploy",
  Remove = "remove"
}

export interface Deploy {
  action: Action;
  owner: string;
  repo: string;
  repoId: string;
  deploymentId: string;
  token: string;
  environment: string;
  url: string;
  sha: string;
  exec: {
    image: string;
    args: string[];
    env: string[];
    params: any;
  };
}

export interface DeployState {
  id?: string;
  url?: string;
  logs?: string;
  state: State;
  description?: string;
}

export const failure = (description: string): DeployState => ({
  state: "failure",
  description
});

export const success = (url: string): DeployState => ({
  state: "success",
  url,
  description: "Deploy successful!"
});

export async function run(deploy: Deploy): Promise<DeployState> {
  const secrets = await secretClient.get(deploy.repoId);
  secrets.push({ name: "GITHUB_TOKEN", value: deploy.token });
  const env: string[] = [
    `PARAMS=${JSON.stringify(deploy.exec.params)}`,
    `DEPLOYMENT=${deploy.deploymentId}`,
    `LOGS_URL=${BASE_URL}/logs/${deploy.owner}/${deploy.repo}/$BUILD_ID`,
    `OWNER=${deploy.owner}`,
    `REPO=${deploy.repo}`,
    `ENVIRONMENT=${deploy.environment}`,
    `SHA=${deploy.sha}`,
    `SHORT_SHA=${deploy.sha.substr(0, 7)}`,
    `ACTION=${deploy.action}`
  ];
  const build = {
    ownerId: deploy.repoId,
    secrets,
    env,
    image: deploy.exec.image,
    args: deploy.exec.args
  };
  const { id } = await client.exec(build);
  const logs = `${BASE_URL}/logs/${deploy.owner}/${deploy.repo}/${id}`;
  return {
    id,
    state: "pending",
    url: deploy.url,
    logs,
    description: "Deploy started"
  };
}
