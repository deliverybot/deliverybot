import { randomUUID as uuid } from "crypto";
import {
  Application,
  Context,
  RestEndpointMethodTypes,
  WebhookEvent,
} from "@deliverybot/core";
import { EnvLockStore, WatchStore, watchEvent } from "./store.js";
import { config, deploy, unmetChecks } from "./deploy.js";
import { LockError, UnknownTargetError, Watch } from "./types.js";
import { logCtx, canWrite, listChecks } from "./util.js";

type PullRequest = RestEndpointMethodTypes["pulls"]["get"]["response"]["data"];

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
 *
 * When GitHub refuses the deployment because required checks are still
 * running, the deploy is queued as a watch instead, and goes out once they
 * pass (see auto.ts).
 */
export async function handlePRDeploy(
  context: Context,
  command: string,
  prNumber: number,
  user: string,
  kv: EnvLockStore,
  watchStore: WatchStore,
  publish: (event: WebhookEvent) => Promise<any>,
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

  /**
   * Queues the deploy when required checks are still pending. Returns false
   * when the refusal can't be waited out: a check already failed, or GitHub
   * refused for another reason.
   */
  async function queue(error: any, target: string, pr: PullRequest) {
    const checks = unmetChecks(error);
    if (!checks || checks.failed.length || !checks.pending.length) {
      return false;
    }
    // The head branch of a fork isn't in this repository, so it can't be
    // watched for new commits.
    if (pr.head.repo && pr.head.repo.id !== context.payload.repository.id) {
      return false;
    }
    const conf = await config(context.octokit, {
      owner,
      repo,
      ref: pr.head.ref,
    });
    const watch: Watch = {
      id: uuid(),
      repository: context.payload.repository,
      target,
      targetVal: conf[target]!,
      ref: `heads/${pr.head.ref.replace(/^refs\/heads\//, "")}`,
      sha: pr.head.sha,
      prNumber,
      requestedBy: user,
    };
    context.log.info(
      logCtx(context, { target, sha: watch.sha, pending: checks.pending }),
      "pr deploy: queued until checks pass",
    );
    await watchStore.addWatch(watch.repository.id, watch);
    await reply(
      `Waiting for ${listChecks(checks.pending)} to pass, ` +
        `then I'll deploy to \`${target}\`.`,
    );
    // A check may have finished while this ran, so look once more now.
    await publish(watchEvent(watch, context.payload.installation));
    return true;
  }

  const target = parseDeployCommand(command)?.target;
  await acknowledge();
  let ref = "";
  let pr: PullRequest | undefined;
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

    pr = (
      await context.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      })
    ).data;
    ref = pr.head.ref;

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
        sha: pr.head.sha,
        pr,
      }),
    );
  } catch (error) {
    if (pr && target && (await queue(error, target, pr))) return;
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

export function prDeploy(
  app: Application,
  locker: EnvLockStore,
  watchStore: WatchStore,
  publish: (event: WebhookEvent) => Promise<any>,
) {
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
      watchStore,
      publish,
    );
  });
}
