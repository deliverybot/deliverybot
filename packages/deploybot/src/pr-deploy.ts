import { Application, Context, WebhookEvent } from "@deliverybot/core";
import { EnvLockStore } from "./store.js";
import { deploy } from "./deploy.js";
import { logCtx, canWrite } from "./util.js";

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
    const target = command.trim().split(/\s+/)[1];
    const pr = await context.octokit.rest.pulls.get({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      pull_number: prNumber,
    });

    const write = await canWrite(
      context.octokit,
      context.repo({ username: user }),
    );
    if (!write) {
      context.log.info(logCtx(context, {}), "pr deploy: no write priviledges");
      return;
    }
    await deploy(
      context.octokit,
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
    await context.octokit.rest.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: prNumber,
      body: `:rotating_light: Failed to trigger deployment. :rotating_light:\n${error.message}`,
    });
  }
}

function isDeployCommand(event: WebhookEvent) {
  const payload: any = event.payload;
  return (
    payload.action === "created" &&
    typeof payload.comment?.body === "string" &&
    payload.comment.body.startsWith("/deploy")
  );
}

export function prDeploy(app: Application, locker: EnvLockStore) {
  // Only `/deploy` comments need work, so don't queue every other comment
  // and edit ahead of them.
  app.ignore(
    (event) => event.name === "issue_comment" && !isDeployCommand(event),
  );

  app.on("issue_comment.created", async (context) => {
    if (context.payload.comment.body.startsWith("/deploy")) {
      await handlePRDeploy(
        context,
        context.payload.comment.body,
        context.payload.issue.number,
        context.payload.comment.user?.login || "",
        locker,
      );
    }
  });
}
