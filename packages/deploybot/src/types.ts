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

/** A value a person fills in when deploying a target from the dashboard. */
export interface Input {
  description?: string;
  type?: "string" | "boolean" | "number" | "choice";
  required?: boolean;
  default?: string | number | boolean;
  options?: Array<string | number>;
}

export interface Target {
  name: string;
  auto_deploy_on: string;
  auto_merge: boolean;
  task: string;
  payload: any;
  environment: string;
  description: string;

  // Inputs are filled in when deploying and added to the payload as `inputs`.
  inputs?: { [name: string]: Input };

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

export interface Watch {
  repository: PayloadRepository;
  id: string;
  target: string;
  targetVal: Target;
  sha: string;
  ref: string;
  prNumber?: number;
}
