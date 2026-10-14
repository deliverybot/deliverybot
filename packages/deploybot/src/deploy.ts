import { Logger, Octokit, RestEndpointMethodTypes } from "@deliverybot/core";
import yaml from "js-yaml";
import { validate } from "jsonschema";
import { EnvLockStore } from "./store.js";
import {
  AutoMergeError,
  ConfigError,
  LockError,
  UnknownTargetError,
  Targets,
  Target,
  DeployBody,
} from "./types.js";
import schema from "./schema.json" with { type: "json" };
import { render } from "./render.js";
import { withPreview } from "./util.js";

type ReposGetContentParams =
  RestEndpointMethodTypes["repos"]["getContent"]["parameters"];
type PullsGetResponse =
  RestEndpointMethodTypes["pulls"]["get"]["response"]["data"];

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
  const params: ReposGetContentParams = {
    owner,
    repo,
    path: `.github/deploy.yml`,
  };
  if (ref) params.ref = ref;
  const content = await github.rest.repos.getContent(params);
  if (Array.isArray(content.data)) {
    throw new ConfigError(".github/deploy.yml is a folder");
  }
  if (!("content" in content.data) || !content.data.content) {
    throw new ConfigError("content not found");
  }
  const conf =
    (yaml.load(
      Buffer.from(content.data.content, "base64").toString(),
    ) as any) || {};

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
      fields.forEach((field) => {
        tar[field] = tar[field] || dep[field];
      });
      delete conf[key].deployments;
    }
  }

  // Disallow if dynamic + auto deploy.

  const validation = validate(conf, schema, { allowUnknownAttributes: true });
  if (validation.errors.length > 0) {
    const err = validation.errors[0];
    // jsonschema always roots error paths at "instance".
    const property = err.property.replace(/^instance/, "config");
    throw new ConfigError(`${property} ${err.message}`);
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
    pr?: PullsGetResponse;
  },
) {
  const logCtx = {
    deploy: { target, ref, pr: pr ? pr.number : undefined },
    context: { repo: { owner, repo } },
  };
  const commit = await github.rest.git.getCommit({
    owner,
    repo,
    commit_sha: sha,
  });
  const repository = await github.rest.repos.get({ owner, repo });

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
    throw new UnknownTargetError(target, Object.keys(conf));
  }

  const body = {
    owner,
    repo,
    ref,
    ...getDeployBody(targetVal, params, force, task),
  };

  if (await kv.isLocked(repository.data.id, body.environment)) {
    log.info(logCtx, "deploy: halted - environment locked");
    throw new LockError(`Deployment environment locked`, body.environment);
  }

  const branch = ref.replace(/^(refs\/)?heads\//, "");
  let created: Awaited<ReturnType<typeof github.rest.repos.createDeployment>>;
  try {
    log.info({ ...logCtx, body }, "deploy: deploying");
    created = await github.rest.repos.createDeployment(body);
  } catch (error) {
    if (error.status === 409 && /conflict merging/i.test(error.message)) {
      log.info({ ...logCtx, error, body }, "deploy: auto merge conflict");
      throw new AutoMergeError(
        `Could not merge ${repository.data.default_branch} into ${branch}: resolve the conflicts and deploy again`,
        false,
      );
    }
    if (error.status === 409) {
      log.info({ ...logCtx, error, body }, "deploy: checks not ready");
    } else {
      log.error({ ...logCtx, error, body }, "deploy: unexpected failure");
    }
    throw error;
  }

  // With auto_merge GitHub may merge the default branch into the ref instead of
  // creating a deployment. The merge pushes a new commit, which is the one to
  // deploy once its checks pass. Callers that know who asked for the deploy
  // queue it with queueAfterMerge.
  // https://docs.github.com/en/rest/deployments/deployments#create-a-deployment
  if (!("id" in created.data)) {
    log.info({ ...logCtx, body }, "deploy: auto merged default branch");
    throw new AutoMergeError(
      `Merged ${repository.data.default_branch} into ${branch} instead of deploying: deploy the new commit once its checks pass`,
      true,
    );
  }
  log.info({ ...logCtx, body }, "deploy: successful");
  return created.data;
}

/**
 * Reads the required contexts GitHub listed when it refused a deployment
 * with a 409. Returns undefined when the refusal wasn't about required
 * checks, such as a merge conflict from auto_merge.
 */
export function unmetChecks(
  error: any,
): { failed: string[]; pending: string[] } | undefined {
  if (error?.status !== 409) return undefined;
  const errors: any[] = error.response?.data?.errors || [];
  const contexts: { context: string; state: string }[] = errors.flatMap(
    (e) => (e?.field === "required_contexts" && e.contexts) || [],
  );
  if (!contexts.length) return undefined;
  const failed = contexts
    .filter((c) => c.state === "failure" || c.state === "error")
    .map((c) => c.context);
  const pending = contexts
    .filter((c) => c.state !== "success" && !failed.includes(c.context))
    .map((c) => c.context);
  return { failed, pending };
}
