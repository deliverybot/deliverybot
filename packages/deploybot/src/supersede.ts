import { Application, Context } from "@deliverybot/core";
import { logCtx } from "./util.js";

type StatusContext = Context<"deployment_status">;

const failed = ["failure", "error"];

/**
 * Keeps one deployment per environment marked as the one that runs there.
 *
 * Once a newer deployment to an environment succeeds, an older one no longer
 * describes what runs there. GitHub's own auto_inactive skips production
 * environments and adds no status, so a pull request deployed earlier keeps
 * showing its deployment, with a link to an environment URL that now serves
 * other code. An inactive status takes that link off the pull request.
 *
 * A failed deployment changed nothing, but GitHub labels an environment's
 * newest deployment that ended in success, failure or error as "Active", so
 * it would show the failed one as running. Marking the failed deployment
 * inactive moves that label back to the deployment that still runs.
 */
export function supersede(app: Application) {
  app.on("deployment_status", async (context) => {
    const { state } = context.payload.deployment_status;
    if (state === "success") await replaceOlder(context);
    if (failed.includes(state)) await keepPrevious(context);
  });
}

async function replaceOlder(context: StatusContext) {
  const { deployment } = context.payload;
  for (const older of await environmentDeployments(context)) {
    if (older.id === deployment.id) continue;
    const [state, previous] = await latestStates(context, older.id);
    // Each success marks everything before it, so past the first deployment
    // a success replaced there is nothing left to do. A failed deployment
    // set aside by keepPrevious is inactive too, but doesn't mark that point.
    if (
      state === "inactive" &&
      !failed.includes(previous) &&
      older.id < deployment.id
    ) {
      break;
    }
    if (state !== "success") continue;

    await markInactive(
      context,
      older.id,
      `Replaced by a newer deployment to ${deployment.environment}`,
      { supersededBy: deployment.id },
    );
  }
}

async function keepPrevious(context: StatusContext) {
  const { deployment } = context.payload;
  for (const other of await environmentDeployments(context)) {
    // A newer deployment already decides what is labelled active.
    if (other.id > deployment.id) return;
    if (other.id === deployment.id) continue;
    const [state, previous] = await latestStates(context, other.id);
    if (state === "success") {
      await markInactive(
        context,
        deployment.id,
        `Failed; ${deployment.environment} still runs the previous deployment`,
        { running: other.id },
      );
      return;
    }
    // Nothing runs past a deployment that was replaced or torn down, and a
    // failed deployment stays the latest one rather than leaving none.
    if (state === "inactive" && !failed.includes(previous)) return;
  }
}

async function environmentDeployments(context: StatusContext) {
  const deployments = await context.octokit.rest.repos.listDeployments({
    ...context.repo(),
    environment: context.payload.deployment.environment,
    per_page: 20,
  });
  return deployments.data;
}

/** A deployment's two newest status states, newest first. */
async function latestStates(context: StatusContext, deploymentId: number) {
  const statuses = await context.octokit.rest.repos.listDeploymentStatuses({
    ...context.repo(),
    deployment_id: deploymentId,
    per_page: 2,
  });
  return [statuses.data[0]?.state, statuses.data[1]?.state];
}

async function markInactive(
  context: StatusContext,
  deploymentId: number,
  description: string,
  extra: object,
) {
  const ctx = logCtx(context, {
    deployment: deploymentId,
    environment: context.payload.deployment.environment,
    ...extra,
  });
  try {
    context.log.info(ctx, "supersede: mark inactive");
    await context.octokit.rest.repos.createDeploymentStatus({
      ...context.repo(),
      deployment_id: deploymentId,
      state: "inactive",
      description,
    });
  } catch (error) {
    context.log.error({ ...ctx, error }, "supersede: marking inactive failed");
  }
}
