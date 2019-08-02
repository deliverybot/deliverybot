import { Application, Context } from "probot";
import { DeployState, run, Action, Deploy } from "../execute";
import { WebhookPayloadDeploymentDeployment } from "@octokit/webhooks";

const preview = "application/vnd.github.ant-man-preview+json";

function withPreview<T>(arg: T): T {
  (arg as any).headers = { accept: preview };
  return arg as T;
}

function getDeploy(
  action: Action,
  token: string,
  repo: {
    repoId: string;
    owner: string;
    repo: string;
  },
  deployment: WebhookPayloadDeploymentDeployment
): Deploy {
  const payload = deployment.payload as any;
  return {
    ...repo,
    action,
    token,
    deploymentId: `${deployment.id}`,
    environment: deployment.environment,
    sha: deployment.sha,
    url: payload.url,
    exec: payload.exec
  };
}

class Handler {
  app: Application;
  context: Context;
  repo: { owner: string; repo: string; repoId: string };

  constructor(app: Application, context: Context) {
    this.app = app;
    this.context = context;
    this.repo = {
      repoId: `${this.context.payload.repository.id}`,
      owner: this.context.payload.repository.owner.login,
      repo: this.context.payload.repository.name
    };
  }

  async deploy(
    action: Action,
    deployment: WebhookPayloadDeploymentDeployment
  ): Promise<DeployState | null> {
    if (!(deployment.payload as any).exec) {
      this.context.log.info({ deployment }, "Deploy: not deploying, no exec");
      return null;
    }
    const token = await this.app.app.getInstallationAccessToken({
      installationId: this.context.payload.installation.id
    });
    this.context.log.info({ deployment }, "Deploy: executing run");
    return run(getDeploy(action, token, this.repo, deployment));
  }

  async setStatus(
    state: "error" | "failure" | "pending" | "success",
    url?: string,
    description?: string
  ) {
    this.context.log.info({ state, url, description }, "Deploy: set status")
    await this.context.github.repos.createDeploymentStatus(
      withPreview({
        ...this.repo,
        deployment_id: this.context.payload.deployment.id,
        target_url: url,
        state,
        description
      })
    );
    await this.context.github.repos.createStatus({
      ...this.repo,
      sha: this.context.payload.deployment.sha,
      description,
      state,
      log_url: url,
      context: `deploy/${this.context.payload.deployment.environment}`
    } as any);
  }

  async handleDeploy() {
    try {
      const deployment = this.context.payload.deployment;
      this.context.log.info({ deployment }, "Deploy: handling");
      const result = await this.deploy(Action.Deploy, deployment);
      if (!result) {
        return;
      }
      this.context.log.info({ result }, "Deploy: started");
      await this.setStatus(result.state, result.logs, result.description);
    } catch (err) {
      console.error(err);
      this.context.log.error({ error: err.message }, "Deploy: error");
      await this.setStatus("failure");
    }
  }

  async handlePRClose(): Promise<void> {
    const ref = this.context.payload.pull_request.head.ref;
    const deployments = await this.context.github.repos.listDeployments(
      withPreview({
        ...this.repo,
        ref
      })
    );
    for (const deployment of deployments.data) {
      // Only terminate transient environments.
      if (!deployment.transient_environment) {
        continue;
      }
      if (!deployment.payload || !(deployment.payload as any).exec) {
        continue;
      }
      this.context.log.info({ deployment }, "Deploy: removing");
      // Store all transient environments in a set.
      await this.context.github.repos.createDeploymentStatus(
        withPreview({
          ...this.repo,
          deployment_id: deployment.id,
          state: "inactive"
        })
      );
      // Delete the deployment.
      try {
        await this.deploy(Action.Remove, deployment as any);
      } catch (error) {
        this.context.log.error(
          { error: error.message },
          "Deploy: removal failed"
        );
      }
    }
  }
}

export function deploy(app: Application) {
  app.on("deployment", async context => {
    const handler = new Handler(app, context);
    await handler.handleDeploy();
  });
  app.on("pull_request.closed", async context => {
    const handler = new Handler(app, context);
    await handler.handlePRClose();
  });
}
