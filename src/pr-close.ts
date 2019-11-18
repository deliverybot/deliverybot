import { Application, Context } from "probot";
import { withPreview, logCtx } from "./util";

export function prClose(app: Application) {
  /**
   * Handles triggering pr close events and marking inactive deployments.
   */
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

  app.on("pull_request.closed", async context => {
    await handlePRClose(context);
  });
}
