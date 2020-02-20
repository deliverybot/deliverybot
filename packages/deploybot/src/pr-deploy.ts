import { Application, Context } from "@deliverybot/core";
import { EnvLockStore } from "./store";
import { deploy } from "./deploy";
import { logCtx, canWrite } from "./util";

/**
 * Handles /deploy commands inside a pull request.
 */
export async function handlePRDeploy(
  context: Context,
  command: string,
  prNumber: number,
  user: string,
  kv: EnvLockStore,
) {
  context.log.info(logCtx(context, { command }), "pr deploy: handling command");
  try {
    const target = command.split(" ")[1];
    const pr = await context.github.pulls.get({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      pull_number: prNumber,
    });

    const write = await canWrite(
      context.github,
      context.repo({ username: user }),
    );
    if (!write) {
      context.log.info(logCtx(context, {}), "pr deploy: no write priviledges");
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
        pr: pr.data,
      }),
    );
  } catch (error) {
    await context.github.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: prNumber,
      body: `:rotating_light: Failed to trigger deployment. :rotating_light:\n${error.message}`,
    });
  }
}

export function prDeploy(app: Application, locker: EnvLockStore) {
  app.on("issue_comment.created", async context => {
    if (context.payload.comment.body.startsWith("/deploy")) {
      await handlePRDeploy(
        context,
        context.payload.comment.body,
        context.payload.issue.number,
        context.payload.comment.user.login,
        locker,
      );
    }
  });
}
