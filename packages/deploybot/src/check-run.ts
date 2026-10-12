import { Application, Context } from "@deliverybot/core";
import { config } from "./deploy.js";
import { logCtx } from "./util.js";

type CheckStatus = "queued" | "in_progress" | "completed";
type CheckConclusion = "success" | "failure";

interface Deployment {
  id: number;
  sha: string;
  environment: string;
  description?: string | null;
  payload: any;
}

interface DeploymentStatus {
  state: string;
  description?: string | null;
  log_url?: string;
  target_url?: string;
  environment_url?: string;
}

/** Maps a deployment status state to a check run status and conclusion. */
export function checkState(
  state: string,
): { status: CheckStatus; conclusion?: CheckConclusion } | undefined {
  switch (state) {
    case "queued":
    case "pending":
      return { status: "queued" };
    case "in_progress":
      return { status: "in_progress" };
    case "success":
      return { status: "completed", conclusion: "success" };
    case "failure":
    case "error":
      return { status: "completed", conclusion: "failure" };
    default:
      // "inactive" only means a newer deployment replaced this one.
      return undefined;
  }
}

export function checkName(environment: string) {
  return `Deploy: ${environment}`;
}

function payloadTarget(payload: any): string | undefined {
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return undefined;
    }
  }
  return payload && payload.target;
}

function isHttpUrl(url?: string) {
  return !!url && /^https?:\/\//.test(url);
}

/**
 * Reports deployments of targets with `check_run: true` as a check run on the
 * deployed commit, so the deploy shows up next to CI on pull requests.
 * Creating check runs needs the Checks: write permission on the app.
 */
export function checkRun(app: Application) {
  /** Only deployments Deliverybot created for an opted-in target qualify. */
  async function enabled(context: Context, deployment: Deployment) {
    const target = payloadTarget(deployment.payload);
    if (!target) return false;
    try {
      const conf = await config(context.octokit, {
        ...context.repo(),
        ref: deployment.sha,
      });
      return !!conf[target]?.check_run;
    } catch (error) {
      context.log.info(
        logCtx(context, { error, deployment: deployment.id }),
        "check run: no config",
      );
      return false;
    }
  }

  async function findCheckRun(context: Context, deployment: Deployment) {
    const runs = await context.octokit.rest.checks.listForRef({
      ...context.repo(),
      ref: deployment.sha,
      check_name: checkName(deployment.environment),
      filter: "all",
    });
    return runs.data.check_runs.find(
      (run) => run.external_id === String(deployment.id),
    );
  }

  async function report(
    context: Context,
    deployment: Deployment,
    status?: DeploymentStatus,
  ) {
    const state = checkState(status ? status.state : "queued");
    if (!state) return;
    if (!(await enabled(context, deployment))) return;

    const environment = deployment.environment;
    const description =
      (status && status.description) || deployment.description || "";
    const title =
      state.conclusion === "success"
        ? `Deployed to ${environment}`
        : state.conclusion === "failure"
          ? `Deploying to ${environment} failed`
          : `Deploying to ${environment}`;
    const summary = [
      description,
      status && status.environment_url
        ? `Environment: ${status.environment_url}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const detailsUrl = status && (status.log_url || status.target_url);

    const body: any = {
      ...context.repo(),
      name: checkName(environment),
      external_id: String(deployment.id),
      status: state.status,
      output: { title, summary: summary || title },
    };
    if (state.conclusion) body.conclusion = state.conclusion;
    if (isHttpUrl(detailsUrl)) body.details_url = detailsUrl;

    const logContext = logCtx(context, {
      deployment: deployment.id,
      state: status && status.state,
    });
    try {
      const existing = await findCheckRun(context, deployment);
      if (!existing) {
        await context.octokit.rest.checks.create({
          ...body,
          head_sha: deployment.sha,
        });
      } else if (!status || existing.status === "completed") {
        // Events can arrive out of order: never move a finished check run back,
        // and let the deployment event only create the check run.
        context.log.info(logContext, "check run: already reported");
        return;
      } else {
        await context.octokit.rest.checks.update({
          ...body,
          check_run_id: existing.id,
        });
      }
      context.log.info(logContext, "check run: reported");
    } catch (error) {
      if (error.status === 403) {
        // Retrying won't help until the app is granted Checks: write.
        context.log.warn(
          { ...logContext, error },
          "check run: forbidden, the app needs the Checks write permission",
        );
        return;
      }
      throw error;
    }
  }

  app.on("deployment.created", async (context) => {
    await report(context, context.payload.deployment as Deployment);
  });

  app.on("deployment_status.created", async (context) => {
    await report(
      context,
      context.payload.deployment as Deployment,
      context.payload.deployment_status as DeploymentStatus,
    );
  });
}
