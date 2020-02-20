import { PayloadRepository } from "@octokit/webhooks";

export interface DeployBody {
  auto_merge: boolean;
  task: string;
  payload: any;
  environment: string;
  description: string;
  transient_environment: boolean;
  production_environment: boolean;
  required_contexts: string[];
}

export interface Target {
  name: string;
  auto_deploy_on: string;
  auto_merge: boolean;
  task: string;
  payload: any;
  environment: string;
  description: string;

  // Required contexts  are required to be matched across all deployments in the
  // target set. This is so that one deployment does not succeed before another
  // causing the set to fail.
  required_contexts: string[];

  // Environment information must be copied into all deployments.
  transient_environment: boolean;
  production_environment: boolean;
}

export type Targets = { [k: string]: Target | undefined };

export class ConfigError extends Error {
  public status = "ConfigError";
}

export class LockError extends Error {
  public status = "LockError";
}

export interface Watch {
  repository: PayloadRepository;
  id: string;
  target: string;
  targetVal: Target;
  sha: string;
  ref: string;
  prNumber?: number;
}
