import { Application, Context } from "probot";
import { LockStore } from "./store";
import { deploy } from "./deploy";
import { logCtx, canWrite } from "./util";

export function prDeploy(app: Application, locker: LockStore) {
  /**
   * Handles /deploy commands inside a pull request.
   */
  async function handlePRDeploy(
    context: Context,
    command: string,
    kv: LockStore
  ) {
    context.log.info(
      logCtx(context, { command }),
      "pr deploy: handling command"
    );
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
        context.log.info(
          logCtx(context, {}),
          "pr deploy: no write priviledges"
        );
        return;
      }

      await deploy(
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

  app.on("issue_comment.created", async context => {
    if (context.payload.comment.body.startsWith("/deploy")) {
      await handlePRDeploy(context, context.payload.comment.body, locker);
    }
  });
}
