import { Application } from "@deliverybot/core";
import { logCtx } from "./util.js";

/**
 * Marks the deployments a successful deployment replaced as inactive.
 *
 * Once a newer deployment to an environment succeeds, an older one no longer
 * describes what runs there. GitHub's own auto_inactive skips production
 * environments and adds no status, so a pull request deployed earlier keeps
 * showing its deployment, with a link to an environment URL that now serves
 * other code. An inactive status takes that link off the pull request.
 */
export function supersede(app: Application) {
  app.on("deployment_status", async (context) => {
    const { deployment, deployment_status } = context.payload;
    if (deployment_status.state !== "success") return;

    const deployments = await context.octokit.rest.repos.listDeployments({
      ...context.repo(),
      environment: deployment.environment,
      per_page: 20,
    });

    for (const older of deployments.data) {
      if (older.id === deployment.id) continue;
      const statuses = await context.octokit.rest.repos.listDeploymentStatuses({
        ...context.repo(),
        deployment_id: older.id,
        per_page: 1,
      });
      const state = statuses.data[0]?.state;
      // Each success marks everything before it, so past the first inactive
      // deployment there is nothing left to do.
      if (state === "inactive" && older.id < deployment.id) break;
      if (state !== "success") continue;

      const ctx = logCtx(context, {
        deployment: older.id,
        environment: deployment.environment,
        supersededBy: deployment.id,
      });
      try {
        context.log.info(ctx, "supersede: mark inactive");
        await context.octokit.rest.repos.createDeploymentStatus({
          ...context.repo(),
          deployment_id: older.id,
          state: "inactive",
          description: `Replaced by a newer deployment to ${deployment.environment}`,
        });
      } catch (error) {
        context.log.error(
          { ...ctx, error },
          "supersede: marking inactive failed",
        );
      }
    }
  });
}
