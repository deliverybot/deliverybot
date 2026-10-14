import { Application, Context } from "@deliverybot/core";
import { WatchStore } from "./store.js";
import { withPreview, logCtx } from "./util.js";

export function prClose(app: Application, watchStore: WatchStore) {
  /**
   * Drops the pull request's waiting deploys: `auto_deploy_on: pr` watches
   * and deploys queued with `/deploy`. Once the pull request is closed they
   * have nothing left to deploy, and if its branch name is reused later a
   * stale watch must not deploy the new branch.
   */
  async function clearWatches(context: Context) {
    const pr = context.payload.pull_request;
    const repoId = context.payload.repository.id;
    const watches = await watchStore.listWatchBySha(repoId, pr.head.sha);
    for (const watch of watches) {
      if (watch.prNumber !== pr.number) continue;
      context.log.info(
        logCtx(context, { ref: watch.ref, target: watch.target }),
        "pr close: clear watch",
      );
      await watchStore.delWatch(repoId, watch);
    }
  }

  /**
   * Handles triggering pr close events and marking inactive deployments.
   */
  async function handlePRClose(context: Context) {
    const ref = context.payload.pull_request.head.ref;
    const deployments = await context.octokit.rest.repos.listDeployments(
      withPreview({ ...context.repo(), ref }),
    );

    context.log.info(logCtx(context, { ref }), "pr close: listed deploys");
    for (const deployment of deployments.data.reverse()) {
      if (!deployment.transient_environment) {
        context.log.info(
          logCtx(context, { ref, deployment: deployment.id }),
          "pr close: not transient",
        );
        continue;
      }

      try {
        context.log.info(
          logCtx(context, { ref, deployment: deployment.id }),
          "pr close: mark inactive",
        );
        await context.octokit.rest.repos.createDeploymentStatus(
          withPreview({
            ...context.repo(),
            deployment_id: deployment.id,
            state: "inactive",
          }),
        );
      } catch (error) {
        context.log.error(
          logCtx(context, { error, ref, deployment: deployment.id }),
          "pr close: marking inactive failed",
        );
      }
    }
  }

  app.on("pull_request.closed", async (context) => {
    await clearWatches(context);
    await handlePRClose(context);
  });
}
