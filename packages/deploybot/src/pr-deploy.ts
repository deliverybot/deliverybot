import { Application, Context, WebhookEvent } from "@deliverybot/core";
import { EnvLockStore } from "./store.js";
import { config, deploy } from "./deploy.js";
import { LockError, UnknownTargetError } from "./types.js";
import { logCtx, canWrite } from "./util.js";

/**
 * Parses a `/deploy [target]` comment. Only the first line counts, so a
 * command followed by an explanation still works. Returns undefined when the
 * comment isn't a deploy command (including look-alikes such as `/deployed`).
 */
export function parseDeployCommand(
  body: string,
): { target?: string } | undefined {
  const line = body.trim().split(/\r?\n/)[0].trim();
  const match = line.match(/^\/deploy(?:\s+(\S+))?(?:\s|$)/);
  if (!match) return undefined;
  return { target: match[1] };
}

function formatTargets(targets: string[]) {
  return targets.length
    ? targets.map((t) => `\`${t}\``).join(", ")
    : "none, add one to `.github/deploy.yml`";
}

/**
 * Turns a deploy failure into a reply that says what went wrong and what to
 * do about it.
 */
export function errorMessage(error: any, ref: string): string {
  if (error instanceof UnknownTargetError) {
    return (
      `There is no \`${error.target}\` target in \`.github/deploy.yml\` on \`${ref}\`.\n\n` +
      `Available targets: ${formatTargets(error.targets)}.`
    );
  }
  if (error instanceof LockError) {
    const env = error.environment
      ? `\`${error.environment}\``
      : "This environment";
    return `${env} is locked, so nothing was deployed. Unlock it on the Deliverybot dashboard and comment again.`;
  }
  if (error?.status === "ConfigError") {
    return `\`.github/deploy.yml\` on \`${ref}\` is invalid: ${error.message}`;
  }
  if (error?.status === 404 && /contents/.test(error?.request?.url || "")) {
    return `\`.github/deploy.yml\` wasn't found on \`${ref}\`.`;
  }
  if (error?.status === 409) {
    return `GitHub refused the deployment, usually because required checks haven't passed yet: ${error.message}`;
  }
  return `Failed to trigger deployment: ${error?.message || error}`;
}

/**
 * Handles /deploy commands inside a pull request. The command comment gets a
 * :+1: straight away to show it was picked up. Only failures get a reply; a
 * successful deployment already shows up in the pull request timeline.
 */
export async function handlePRDeploy(
  context: Context,
  command: string,
  prNumber: number,
  user: string,
  kv: EnvLockStore,
) {
  context.log.info(logCtx(context, { command }), "pr deploy: handling command");
  const commentId: number | undefined = context.payload.comment?.id;
  const owner = context.payload.repository.owner.login;
  const repo = context.payload.repository.name;

  // The reaction is feedback only, so a failed one must never stop the deploy.
  async function acknowledge() {
    if (!commentId) return;
    try {
      await context.octokit.rest.reactions.createForIssueComment({
        owner,
        repo,
        comment_id: commentId,
        content: "+1",
      });
    } catch (error) {
      context.log.warn(logCtx(context, { error }), "pr deploy: react failed");
    }
  }
  async function reply(body: string) {
    await context.octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: `@${user} ${body}`,
    });
  }

  const target = parseDeployCommand(command)?.target;
  await acknowledge();
  let ref = "";
  try {
    const write = await canWrite(
      context.octokit,
      context.repo({ username: user }),
    );
    if (!write) {
      context.log.info(logCtx(context, {}), "pr deploy: no write priviledges");
      await reply("You need write access to this repository to deploy.");
      return;
    }

    const pr = await context.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });
    ref = pr.data.head.ref;

    if (!target) {
      const targets = await config(context.octokit, { owner, repo, ref });
      await reply(
        `Tell me where to deploy, for example \`/deploy ${Object.keys(targets)[0] || "staging"}\`.\n\n` +
          `Available targets: ${formatTargets(Object.keys(targets))}.`,
      );
      return;
    }

    await deploy(
      context.octokit,
      context.log,
      kv,
      context.repo({
        target,
        ref,
        sha: pr.data.head.sha,
        pr: pr.data,
      }),
    );
  } catch (error) {
    await reply(errorMessage(error, ref || "this branch"));
  }
}

function isDeployCommand(event: WebhookEvent) {
  const payload: any = event.payload;
  return (
    payload.action === "created" &&
    // Commands only make sense on pull requests, not plain issues.
    !!payload.issue?.pull_request &&
    typeof payload.comment?.body === "string" &&
    !!parseDeployCommand(payload.comment.body)
  );
}

export function prDeploy(app: Application, locker: EnvLockStore) {
  // Only `/deploy` comments need work, so don't queue every other comment
  // and edit ahead of them.
  app.ignore(
    (event) => event.name === "issue_comment" && !isDeployCommand(event),
  );

  app.on("issue_comment.created", async (context) => {
    await handlePRDeploy(
      context,
      context.payload.comment.body,
      context.payload.issue.number,
      context.payload.comment.user?.login || "",
      locker,
    );
  });
}
