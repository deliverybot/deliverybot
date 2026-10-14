import { WebhookPayload } from "@deliverybot/core";

/** The repository of a push or pull request event. */
export type PayloadRepository =
  | WebhookPayload<"push">["repository"]
  | WebhookPayload<"pull_request">["repository"];

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
  auto_deploy_on: string | string[];
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

/** Thrown when a deploy names a target that .github/deploy.yml doesn't define. */
export class UnknownTargetError extends ConfigError {
  constructor(
    public target: string | undefined,
    public targets: string[],
  ) {
    super(`Deployment target "${target}" does not exist`);
  }
}

export class LockError extends Error {
  public status = "LockError";

  constructor(
    message: string,
    public environment?: string,
  ) {
    super(message);
  }
}

/**
 * Thrown when `auto_merge` merged the default branch into the deployed ref
 * instead of creating a deployment, or when that merge had conflicts. In both
 * cases nothing was deployed.
 */
export class AutoMergeError extends Error {
  public status = "AutoMergeError";
}

export interface Watch {
  repository: PayloadRepository;
  id: string;
  target: string;
  targetVal: Target;
  sha: string;
  ref: string;
  prNumber?: number;
  // Set when someone queued this deploy with `/deploy` on a pull request
  // before its required checks had passed. Holds their login, so they can be
  // told if the queued deploy can't go out.
  requestedBy?: string;
}
