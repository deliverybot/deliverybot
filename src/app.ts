import { Application, Context, Octokit, Logger } from "probot";
import { render } from "./render";
import yaml from "js-yaml";
import { validate } from "jsonschema";
import { PullsGetResponse, ReposGetContentsParams } from "@octokit/rest";
import schema from "./schema.json";
import { LockStore } from "./store";

const previewAnt = "application/vnd.github.ant-man-preview+json";
const previewFlash = "application/vnd.github.flash-preview+json";

function withPreview<T>(arg: T): T {
  (arg as any).headers = { accept: `${previewAnt},${previewFlash}` };
  return arg as T;
}

function logCtx(context: Context, params: any) {
  return {
    context: {
      installation: context.payload.installation,
      repo: context.payload.repository ? context.repo() : undefined
    },
    ...params
  };
}

interface DeployBody {
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

class ConfigError extends Error {
  public status = "ConfigError";
}

class LockError extends Error {
  public status = "LockError";
}

export type Targets = { [k: string]: Target | undefined };

export async function config(
  github: Octokit,
  {
    owner,
    repo,
    ref
  }: {
    owner: string;
    repo: string;
    ref?: string;
  }
): Promise<Targets> {
  const params: ReposGetContentsParams = {
    owner,
    repo,
    path: `.github/deploy.yml`
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
    yaml.safeLoad(Buffer.from(content.data.content, "base64").toString()) || {};

  const fields = [
    "task",
    "auto_merge",
    "payload",
    "environment",
    "description"
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

  const validation = validate(conf, schema, {
    propertyName: "config",
    allowUnknownAttributes: true
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

export async function canWrite(
  gh: Octokit,
  { owner, repo, username }: { owner: string; repo: string; username: string }
): Promise<boolean> {
  const perms = await gh.repos.getCollaboratorPermissionLevel({
    owner,
    repo,
    username
  });
  return ["admin", "write"].includes(perms.data.permission);
}

function getDeployBody(target: Target, data: any): DeployBody {
  return withPreview({
    task: target.task || "deploy",
    transient_environment: target.transient_environment || false,
    production_environment: target.production_environment || false,
    environment: render(target.environment || "production", data),
    auto_merge: target.auto_merge || false,
    required_contexts: target.required_contexts || [],
    description: render(target.description, data),
    payload: {
      target: target.name,
      ...render(target.payload, data)
    }
  });
}

async function handlePRDeploy(
  context: Context,
  command: string,
  kv: LockStore
) {
  context.log.info(logCtx(context, { command }), "pr deploy: handling command");
  try {
    const target = command.split(" ")[1];
    const pr = await context.github.pulls.get({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      pull_number: context.payload.issue.number
    });

    const write = await canWrite(
      context.github,
      context.repo({ username: context.payload.comment.user.login })
    );
    if (!write) {
      context.log.info(logCtx(context, {}), "pr deploy: no write priviledges");
      return;
    }

    await deployCommit(
      context.github,
      context.log,
      kv,
      context.repo({
        target,
        ref: pr.data.head.ref,
        sha: pr.data.head.sha,
        pr: pr.data
      })
    );
  } catch (error) {
    await context.github.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: context.payload.issue.number,
      body: `:rotating_light: Failed to trigger deployment. :rotating_light:\n${error.message}`
    });
  }
}

/**
 * Deploy commit handles all the necessities of creating a conformant deployment
 * including templating and more. All deploys should go through this function.
 * We need to deploy always using the ref of a branch so that finding
 * deployments later we can query using the branch ref.
 *
 * Throws ConfigError, LockError.
 */
export async function deployCommit(
  github: Octokit,
  log: Logger,
  kv: LockStore,
  {
    owner,
    repo,
    target,
    ref,
    sha,
    pr
  }: {
    owner: string;
    repo: string;
    target: string;
    ref: string;
    sha: string;
    pr?: PullsGetResponse;
  }
) {
  const logCtx = {
    deploy: { target, ref, pr },
    context: { repo: { owner, repo } }
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
    pull_request: pr
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
    ...getDeployBody(targetVal, params)
  };

  if (await kv.isLockedEnv(repository.data.id, body.environment)) {
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
    if (error.status === 409) {
      log.info({ ...logCtx, error, body }, "deploy: checks not ready");
    } else {
      log.error({ ...logCtx, error, body }, "deploy: unexpected failure");
    }
    throw error;
  }
}

async function handleAutoDeploy(context: Context, kv: LockStore) {
  context.log.info("auto deploy: checking deployments");
  try {
    const conf = await config(context.github, context.repo());
    for (const key in conf) {
      const deployment = conf[key]!;
      await autoDeployTarget(context, key, deployment, kv);
    }
  } catch (error) {
    // This error block will mostly catch configuration errors, autoDeployTarget
    // will only throw if the error is not recoverable.
    switch (error.status) {
      case 404:
        context.log.info(logCtx(context, { error }), "auto deploy: no config");
        break;
      case "ConfigError":
        context.log.info(logCtx(context, { error }), "auto deploy: config err");
        break;
      default:
        context.log.error(logCtx(context, { error }), "auto deploy: failed");
        throw error;
    }
  }
}

async function autoDeployTarget(
  context: Context,
  target: string,
  targetVal: Target,
  kv: LockStore
) {
  const autoDeploy = targetVal.auto_deploy_on;
  if (!autoDeploy) {
    return;
  }
  const ref = autoDeploy.replace("refs/", "");
  context.log.info(logCtx(context, { ref }), "auto deploy: verifying");
  const refData = await context.github.git.getRef(context.repo({ ref }));
  const sha = refData.data.object.sha;

  const deploys = await context.github.repos.listDeployments(
    context.repo({ sha })
  );
  if (deploys.data.find(d => d.environment === targetVal.environment)) {
    context.log.info(logCtx(context, { ref }), "auto deploy: already deployed");
    return;
  }

  context.log.info(logCtx(context, { ref }), "auto deploy: deploying");
  try {
    await deployCommit(
      context.github,
      context.log,
      kv,
      context.repo({
        ref,
        sha,
        target
      })
    );
    context.log.info(logCtx(context, { ref }), "auto deploy: done");
  } catch (error) {
    // Catch deploy errors and return if this is a normal scenario for an auto
    // deployment.
    switch (error.status) {
      case 409:
        context.log.info(
          logCtx(context, { target, ref, error }),
          "auto deploy: checks not ready"
        );
        return;
      case "LockError":
        context.log.info(
          logCtx(context, { target, ref, error }),
          "auto deploy: environment locked"
        );
        return;
      case "ConfigError":
        context.log.info(
          logCtx(context, { target, ref, error }),
          "auto deploy: target config error"
        );
        return;
      default:
        context.log.error(
          logCtx(context, { target, ref, error }),
          "auto deploy: deploy attempt failed"
        );
        throw error;
    }
  }
}

async function handlePRClose(context: Context) {
  const ref = context.payload.pull_request.head.ref;
  const deployments = await context.github.repos.listDeployments(
    withPreview({ ...context.repo(), ref })
  );

  context.log.info(logCtx(context, { ref }), "pr close: listed deploys");
  for (const deployment of deployments.data.reverse()) {
    if (!deployment.transient_environment) {
      context.log.info(
        logCtx(context, { ref, deployment: deployment.id }),
        "pr close: not transient"
      );
      continue;
    }

    try {
      context.log.info(
        logCtx(context, { ref, deployment: deployment.id }),
        "pr close: mark inactive"
      );
      await context.github.repos.createDeploymentStatus(
        withPreview({
          ...context.repo(),
          deployment_id: deployment.id,
          state: "inactive"
        })
      );
    } catch (error) {
      context.log.error(
        logCtx(context, { error, ref, deployment: deployment.id }),
        "pr close: marking inactive failed"
      );
    }
  }
}

export const app = (lockStore: () => LockStore) => (app: Application) => {
  const locker = lockStore();

  const doAutoDeploy = (context: Context) => {
    return locker.lock(`${context.payload.repository.id}-autodeploy`, () => {
      return handleAutoDeploy(context, locker);
    });
  };

  app.on("push", async context => {
    await doAutoDeploy(context);
  });
  app.on("status", async context => {
    await doAutoDeploy(context);
  });
  app.on("check_run", async context => {
    await doAutoDeploy(context);
  });
  app.on("issue_comment.created", async context => {
    if (context.payload.comment.body.startsWith("/deploy")) {
      await handlePRDeploy(context, context.payload.comment.body, locker);
    }
  });
  app.on("pull_request.closed", async context => {
    await handlePRClose(context);
  });
};
