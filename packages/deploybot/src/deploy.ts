import {
  Logger,
  Octokit
} from "@deliverybot/core";
import yaml from "js-yaml";
import { validate } from "jsonschema";
import { EnvLockStore } from "./store";
import { ConfigError, LockError, Targets, Target, DeployBody } from "./types";
import schema from "./schema.json";
import { render } from "./render";
import { withPreview } from "./util";

export async function config(
  github: Octokit,
  {
    owner,
    repo,
    ref,
  }: {
    owner: string;
    repo: string;
    ref?: string;
  },
): Promise<Targets> {
  const params: Octokit.ReposGetContentsParams = {
    owner,
    repo,
    path: `.github/deploy.yml`,
  };
  if (ref) params.ref = ref;
  const content = await github.repos.getContents(params);
  if (Array.isArray(content.data)) {
    throw new ConfigError(".github/deploy.yml is a folder");
  }
  if (!content.data.content) {
    throw new ConfigError("content not found");
  }
  const conf =
    (yaml.safeLoad(Buffer.from(content.data.content, "base64").toString()) || {}) as Record<string, any>;

  const fields = [
    "task",
    "auto_merge",
    "payload",
    "environment",
    "description",
  ];
  for (const key in conf) {
    if (conf[key].deployments && conf[key].deployments.length > 0) {
      const dep = conf[key].deployments[0];
      const tar = conf[key];
      fields.forEach(field => {
        tar[field] = tar[field] || dep[field];
      });
      delete conf[key].deployments;
    }
  }

  // Disallow if dynamic + auto deploy.

  const validation = validate(conf, schema, {
    allowUnknownAttributes: true,
  });
  if (validation.errors.length > 0) {
    const err = validation.errors[0];
    throw new ConfigError(`${err.property} ${err.message}`);
  }
  for (const key in conf) {
    conf[key].name = key;
  }
  return conf;
}

function getDeployBody(
  target: Target,
  data: any,
  force?: boolean,
  task?: string,
): DeployBody {
  return withPreview({
    task: task || target.task || "deploy",
    transient_environment: target.transient_environment || false,
    production_environment: target.production_environment || false,
    environment: render(target.environment || "production", data),
    auto_merge: target.auto_merge || false,
    // The presence of force sets the required contexts to an empty array [].
    required_contexts: force ? [] : target.required_contexts || [],
    description: render(target.description, data),
    payload: {
      target: target.name,
      ...render(target.payload, data),
    },
  });
}

/**
 * Deploy commit handles all the necessities of creating a conformant deployment
 * including templating and more. All deploys should go through this function.
 * We need to deploy always using the ref of a branch so that finding
 * deployments later we can query using the branch ref.
 *
 * Throws ConfigError, LockError.
 */
export async function deploy(
  github: Octokit,
  log: Logger,
  kv: EnvLockStore,
  {
    owner,
    repo,
    target,
    ref,
    sha,
    force,
    task,
    pr,
  }: {
    owner: string;
    repo: string;
    target: string;
    ref: string;
    sha: string;
    force?: boolean;
    task?: string;
    pr?: Octokit.PullsGetResponse;
  },
) {
  const logCtx = {
    deploy: { target, ref, pr: pr ? pr.number : undefined },
    context: { repo: { owner, repo } },
  };
  const commit = await github.git.getCommit({ owner, repo, commit_sha: sha });
  const repository = await github.repos.get({ owner, repo });

  // Params are the payload that goes into every deployment - change these in a
  // backwards compatible way always.
  const params = {
    ref,
    target,
    owner,
    repo,
    short_sha: sha.substr(0, 7),
    commit: commit.data,
    pr: pr ? pr.number : undefined,
    pull_request: pr,
  };

  const conf = await config(github, { owner, repo, ref });
  const targetVal = conf[target];
  if (!targetVal) {
    log.info(logCtx, "deploy: halted - no target");
    throw new ConfigError(`Deployment target "${target}" does not exist`);
  }

  const body = {
    owner,
    repo,
    ref,
    ...getDeployBody(targetVal, params, force, task),
  };

  if (await kv.isLocked(repository.data.id, body.environment)) {
    log.info(logCtx, "deploy: halted - environment locked");
    throw new LockError(`Deployment environment locked`);
  }

  try {
    log.info({ ...logCtx, body }, "deploy: deploying");
    // TODO: Handle auto_merge case correctly here.
    // https://developer.github.com/v3/repos/deployments/#merged-branch-response
    const deploy = await github.repos.createDeployment(body);
    log.info({ ...logCtx, body }, "deploy: successful");
    return deploy.data;
  } catch (error) {
    if ((error as LockError).status == '409') {
      log.info({ ...logCtx, error, body }, "deploy: checks not ready");
    } else {
      log.error({ ...logCtx, error, body }, "deploy: unexpected failure");
    }
    throw error;
  }
}
