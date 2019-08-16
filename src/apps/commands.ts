import { Application, Context, Octokit, Logger } from "probot";
import { render } from "../util";
import yaml from "js-yaml";
import { validate } from "jsonschema";
import { ReposListDeploymentsResponseItem } from "@octokit/rest";
import schema from "../schema.json";

const previewAnt = "application/vnd.github.ant-man-preview+json";
const previewFlash = "application/vnd.github.flash-preview+json";

function withPreview<T>(arg: T): T {
  (arg as any).headers = { accept: `${previewAnt},${previewFlash}` };
  return arg as T;
}

interface Deployment {
  task: string;
  payload: any;
  environment: string;
  description: string;
  auto_merge: boolean;
  required_contexts: string[];
  transient_environment: boolean;
  production_environment: boolean;
}

export interface Target {
  auto_deploy_on: string;
  deployments: Deployment[];
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
    ref: string;
  }
): Promise<Targets> {
  const content = await github.repos.getContents({
    owner,
    repo,
    ref,
    path: `.github/deploy.yml`
  });
  const conf =
    yaml.safeLoad(Buffer.from(content.data.content, "base64").toString()) || {};
  const validation = validate(conf, schema, {
    propertyName: "config",
    allowUnknownAttributes: true
  });
  if (validation.errors.length > 0) {
    const err = validation.errors[0];
    throw new Error(`${err.property} ${err.message}`);
  }
  for (const key in conf) {
    conf[key].deployments = conf[key].deployments || [];
  }
  return conf;
}

function getDeployBody(deployment: Deployment, data: any): Deployment {
  return withPreview({
    task: "deploy",
    transient_environment: deployment.transient_environment || false,
    production_environment: deployment.production_environment || false,
    environment: render(deployment.environment || "production", data),
    auto_merge: deployment.auto_merge || false,
    required_contexts: deployment.required_contexts || [],
    description: deployment.description,
    payload: render(deployment.payload, data)
  });
}

async function handlePRDeploy(context: Context, command: string) {
  context.log.info({ command }, "Deploy: handling command");
  const target = command.split(" ")[1];
  const pr = await context.github.pulls.get({
    owner: context.payload.repository.owner.login,
    repo: context.payload.repository.name,
    pull_number: context.payload.issue.number
  });

  try {
    // TODO: Ensure that the creator has deploy access to the repository.
    await deployCommit(
      context.github,
      context.log,
      context.repo({
        target,
        ref: pr.data.head.ref,
        sha: pr.data.head.sha,
        pr: pr.data.number
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
 */
export async function deployCommit(
  github: Octokit,
  log: Logger,
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
    pr?: number;
  }
) {
  const conf = await config(github, { owner, repo, ref });
  const targetVal = conf[target];
  if (!targetVal) {
    log.error({ owner, repo, target, ref, pr }, "deploying failed - no target");
    throw new Error(`Deployment target "${target}" does not exist`);
  }
  for (const deployment of targetVal.deployments) {
    const params = { ref, sha: sha, short_sha: sha.substr(0, 7), pr };
    const body = {
      owner,
      repo,
      ref,
      ...getDeployBody(deployment, params)
    };
    try {
      log.info({ body }, "deploying");
      // TODO: Handle auto_merge case correctly here.
      // https://developer.github.com/v3/repos/deployments/#merged-branch-response
      const deploy = await github.repos.createDeployment(body);
      log.info({ body, id: deploy.data.id }, "deploy successful");
      return deploy.data;
    } catch (error) {
      log.error({ error, body }, "deploying failed");
      throw error;
    }
  }
}

async function handleAutoDeploy(context: Context) {
  context.log.info("auto deploy: checking deployments");
  const config = await context.config("deploy.yml");
  for (const key in config) {
    const deployment = config[key];
    await autoDeployTarget(context, key, deployment);
  }
}

async function autoDeployTarget(
  context: Context,
  target: string,
  targetVal: Target
) {
  const autoDeploy = targetVal.auto_deploy_on;
  if (!autoDeploy) {
    return;
  }
  const ref = autoDeploy.replace("refs/", "");
  context.log.info(context.repo({ ref }), "auto deploy: verifying");
  const refData = await context.github.git.getRef(context.repo({ ref }));
  const sha = refData.data.object.sha;

  const deploys = await context.github.repos.listDeployments(
    context.repo({ sha })
  );
  const environments = targetVal.deployments.map(d => d.environment);
  if (deploys.data.find(d => environments.includes(d.environment))) {
    context.log.info(context.repo({ ref }), "auto deploy: already deployed");
    return;
  }

  context.log.info(context.repo({ ref, target }), "auto deploy: deploying");
  try {
    await deployCommit(
      context.github,
      context.log,
      context.repo({
        ref,
        sha,
        target
      })
    );
    context.log.info(context.repo({ ref, target }), "auto deploy: done");
  } catch (error) {
    context.log.error(
      context.repo({ error, ref, target }),
      "auto deploy: failed"
    );
  }
}

async function handlePRClose(context: Context) {
  const ref = context.payload.pull_request.head.ref;
  const deployments = await context.github.repos.listDeployments(
    withPreview({ ...context.repo(), ref })
  );
  context.log.info(
    context.repo({ count: deployments.data.length }),
    "pr close: listed deploys"
  );

  // List all deployments for this pull request by environment to undeploy the
  // last deployment for every environment.
  const environments: { [env: string]: ReposListDeploymentsResponseItem } = {};
  for (const deployment of deployments.data.reverse()) {
    // Only terminate transient environments.
    if (!deployment.transient_environment) {
      context.log.info(
        context.repo({ id: deployment.id }),
        "pr close: not transient"
      );
      continue;
    }
    try {
      context.log.info(
        context.repo({ id: deployment.id }),
        "pr close: removing"
      );
      await context.github.repos.createDeploymentStatus(
        withPreview({
          ...context.repo(),
          deployment_id: deployment.id,
          state: "inactive"
        })
      );
    } catch (error) {
      context.log.info(
        context.repo({ id: deployment.id, error: error.message }),
        "pr close: marking inactive failed"
      );
    }
    environments[deployment.environment] = deployment;
  }

  for (const env in environments) {
    const deployment = environments[env];
    try {
      // Undeploy for every unique environment by copying the deployment params
      // and triggering a deployment with the task "remove".
      await context.github.repos.createDeployment(
        context.repo({
          ref,
          task: "remove",
          required_contexts: [],
          payload: deployment.payload as any,
          environment: deployment.environment,
          description: deployment.description || "",
          transient_environment: deployment.transient_environment,
          production_environment: deployment.production_environment
        })
      );
    } catch (error) {
      context.log.error(
        context.repo({ id: deployment.id, error: error.message, ref }),
        "pr close: failed to undeploy"
      );
    }
  }
}

export function commands(app: Application) {
  app.on("push", async context => {
    await handleAutoDeploy(context);
  });
  app.on("status", async context => {
    await handleAutoDeploy(context);
  });
  app.on("check_run", async context => {
    await handleAutoDeploy(context);
  });
  app.on("issue_comment.created", async context => {
    if (context.payload.comment.body.startsWith("/deploy")) {
      await handlePRDeploy(context, context.payload.comment.body);
    }
  });
  app.on("pull_request.closed", async context => {
    await handlePRClose(context);
  });
}
