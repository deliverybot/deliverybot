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

  // Users (`login`) and teams (`org/team-slug`) allowed to deploy this target
  // by hand. Unset means anyone with write access.
  deployers?: string[];
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

/** Thrown when a target's `deployers` list doesn't include the user. */
export class AccessError extends Error {
  public status = "AccessError";

  constructor(
    public actor: string,
    public target: string,
    public deployers: string[],
  ) {
    super(`${actor} is not allowed to deploy to "${target}"`);
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
