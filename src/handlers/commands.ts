import { Application, Context, Octokit } from "probot";
import { render } from "../util";
import yaml from "js-yaml";

async function deployConfig(context: Context, command: string, ref: string) {
  const conf = await config(context.github, context.repo({ ref }));
  const name = command.split(" ")[1];
  return conf[name];
}

async function logError(context: Context, message: string) {
  context.log.error({ error: message }, "Error while handling deploy");
  await context.github.issues.createComment({
    owner: context.payload.repository.owner.login,
    repo: context.payload.repository.name,
    issue_number: context.payload.issue.number,
    body: message
  });
}

function validate(body: any) {
  if (!body.environment) throw new Error("'environment' is required.");
  if (body.payload.exec) {
    const { exec } = body.payload;
    if (typeof exec.image !== "string")
      throw new Error("'exec.image' must be a string.");
    if (typeof exec.params !== "object")
      throw new Error("'exec.params' must be an object.");
    if (exec.args && !Array.isArray(exec.args)) {
      throw new Error("'exec.args' must be an array");
    }
    if (exec.env && !Array.isArray(exec.env)) {
      throw new Error("'exec.env' must be an array");
    }
  }
}

function getDeployBody(deployment: any, data: any): any {
  return {
    transient_environment: deployment.transient_environment || false,
    production_environment: deployment.production_environment || false,
    environment: render(deployment.environment || "production", data),
    auto_merge: deployment.auto_merge || false,
    required_contexts: deployment.required_contexts,
    description: deployment.description,
    payload: {
      url: render(deployment.url, data),
      exec: render(deployment.exec, data)
    },
    headers: {
      accept: "application/vnd.github.ant-man-preview+json"
    }
  };
}

async function handleDeploy(context: Context, command: string) {
  context.log.info({ command }, "Deploy: handling command");

  const pr = await context.github.pulls.get({
    owner: context.payload.repository.owner.login,
    repo: context.payload.repository.name,
    pull_number: context.payload.issue.number
  });

  const deployment = await deployConfig(context, command, pr.data.head.ref);
  if (!deployment) {
    await logError(
      context,
      `:rotating_light: Deployment "${command}" found no target. :rotating_light:`
    );
    return;
  }

  context.log.info({
    message: "found deployment configuration",
    deployment
  });

  const params = {
    ref: pr.data.head.ref,
    sha: pr.data.head.sha,
    short_sha: pr.data.head.sha.substr(0, 7),
    number: pr.data.number,
    pr: pr.data.number
  };
  const body = {
    owner: pr.data.head.repo.owner.login,
    repo: pr.data.head.repo.name,
    ref: pr.data.head.ref,
    ...getDeployBody(deployment, params)
  };

  try {
    validate(body);
    context.log.info({ body, params }, "Deploy: creating");
    await context.github.repos.createDeployment(body);
  } catch (error) {
    context.log.error({ error }, "Deploy: creation failed");
    await logError(
      context,
      `:rotating_light: Failed to trigger deployment. :rotating_light:\n${error.message}`
    );
    return;
  }
}

async function checkAutoDeploys(context: Context, owner: string, repo: string) {
  const config = await context.config("deploy.yml");
  for (const key in config) {
    const deployment = config[key];
    await handleAutoDeploy(context, owner, repo, deployment);
  }
}

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
): Promise<any> {
  const content = await github.repos.getContents({
    owner,
    repo,
    ref,
    path: `.github/deploy.yml`
  });
  const conf =
    yaml.safeLoad(Buffer.from(content.data.content, "base64").toString()) || {};
  return conf;
}

export async function deployCommit(
  github: Octokit,
  {
    owner,
    repo,
    target,
    commit
  }: {
    owner: string;
    repo: string;
    target: string;
    commit: string;
  }
) {
  const deployment = await config(github, { owner, repo, ref: commit });
  if (!deployment[target]) {
    throw new Error(`Deployment target "${target}" does not exist`);
  }
  const params = {
    ref: commit,
    sha: commit,
    short_sha: commit.substr(0, 7)
  };
  const body = {
    owner,
    repo,
    ref: commit,
    ...getDeployBody(deployment, params)
  };
  await github.repos.createDeployment(body);
}

async function handleAutoDeploy(
  context: Context,
  owner: string,
  repo: string,
  deployment: any
) {
  const ref = deployment.auto_deploy_on;
  if (!ref) {
    return;
  }
  context.log.info({ ref }, "Auto Deploy: verifying");
  const refData = await context.github.git.getRef({
    owner,
    repo,
    ref: ref.replace("refs/", "")
  });
  const sha = refData.data.object.sha;
  const deploys = await context.github.repos.listDeployments({
    owner,
    repo,
    sha
  });
  if (deploys.data.find(d => d.environment === deployment.environment)) {
    context.log.info({ ref }, "Auto Deploy: already deployed");
    return;
  }

  const params = {
    ref,
    sha,
    short_sha: sha.substr(0, 7)
  };
  const body = {
    owner,
    repo,
    ref,
    ...getDeployBody(deployment, params)
  };
  context.log.info({ body, params }, "Auto Deploy: attempting create");
  try {
    await context.github.repos.createDeployment(body);
  } catch (apiError) {
    context.log.error({ error: apiError.message }, "Auto Deploy: failed");
  }
}

export function commands(app: Application) {
  app.on("push", async context => {
    await checkAutoDeploys(
      context,
      context.payload.repository.owner.login,
      context.payload.repository.name
    );
  });
  app.on("status", async context => {
    await checkAutoDeploys(
      context,
      context.payload.repository.owner.login,
      context.payload.repository.name
    );
  });
  app.on("check_run", async context => {
    await checkAutoDeploys(
      context,
      context.payload.repository.owner.login,
      context.payload.repository.name
    );
  });
  app.on("issue_comment.created", async context => {
    if (context.payload.comment.body.startsWith("/deploy")) {
      await handleDeploy(context, context.payload.comment.body);
    }
  });
}
