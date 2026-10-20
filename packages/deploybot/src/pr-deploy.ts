import { randomUUID as uuid } from "crypto";
import {
  Application,
  Context,
  RestEndpointMethodTypes,
  WebhookEvent,
} from "@deliverybot/core";
import { EnvLockStore, WatchStore, watchEvent } from "./store.js";
import { config, deploy, unmetChecks } from "./deploy.js";
import {
  AutoMergeError,
  LockError,
  UnknownTargetError,
  Watch,
} from "./types.js";
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

// Every mention of the config file in a reply links to its reference docs.
const configDocs = "https://deliverybot.dev/docs/configuration/";
const configFile = `[\`.github/deploy.yml\`](${configDocs})`;

/**
 * The dashboard page for a repository, or undefined when this deployment of
 * Deliverybot has no BASE_URL to link to.
 */
export function dashboardUrl(
  baseUrl: string | undefined,
  repository: { full_name: string },
) {
  if (!baseUrl) return undefined;
  return `${baseUrl.replace(/\/+$/, "")}/${repository.full_name}`;
}

function formatTargets(targets: string[]) {
  return targets.length
    ? targets.map((t) => `\`${t}\``).join(", ")
    : `none, add one to ${configFile}`;
}

/**
 * Turns a deploy failure into a reply that says what went wrong and what to
 * do about it, linking to the dashboard when there is one.
 */
export function errorMessage(
  error: any,
  ref: string,
  dashboard?: string,
): string {
  if (error instanceof UnknownTargetError) {
    return (
      `There is no \`${error.target}\` target in ${configFile} on \`${ref}\`.\n\n` +
      `Available targets: ${formatTargets(error.targets)}.`
    );
  }
  if (error instanceof LockError) {
    const env = error.environment
      ? `\`${error.environment}\``
      : "This environment";
    const where = dashboard
      ? `[Deliverybot dashboard](${dashboard})`
      : "Deliverybot dashboard";
    return `${env} is locked, so nothing was deployed. Unlock it on the ${where} and comment again.`;
  }
  if (error?.status === "ConfigError") {
    return `${configFile} on \`${ref}\` is invalid: ${error.message}`;
  }
  if (error?.status === 404 && /contents/.test(error?.request?.url || "")) {
    return `${configFile} wasn't found on \`${ref}\`.`;
  }
  if (error?.status === "AutoMergeError") {
    return `${error.message}.`;
  }
  if (error?.status === 409) {
    return `GitHub refused the deployment, usually because required checks haven't passed yet: ${error.message}`;
  }
  return `Failed to trigger deployment: ${error?.message || error}`;
}

/**
 * Re-queues a deploy that `auto_merge` turned into a merge, on the merge
 * commit the branch now points at, so it goes out once that commit's checks
 * pass. `say` tells whoever asked for the deploy. Returns the new watch, which
 * the caller checks once right away, since the merge commit may have no checks
 * to wait for.
 */
export async function queueAfterMerge(
  context: Context,
  watchStore: WatchStore,
  watch: Watch,
  say: (body: string) => Promise<void>,
): Promise<Watch> {
  const branch = watch.ref.replace(/^(refs\/)?heads\//, "");
  const head = await context.octokit.rest.git.getRef(
    context.repo({ ref: `heads/${branch}` }),
  );
  const queued: Watch = { ...watch, id: uuid(), sha: head.data.object.sha };
  context.log.info(
    logCtx(context, { target: queued.target, sha: queued.sha }),
    "pr deploy: queued after auto merge",
  );
  await watchStore.addWatch(queued.repository.id, queued);
  await say(
    `\`${branch}\` was behind, so GitHub merged the default branch into it first. ` +
      `I'll deploy the merge commit to \`${queued.target}\` once its checks pass.`,
  );
  return queued;
}

/**
 * Handles /deploy commands inside a pull request. The command comment gets a
 * :eyes: straight away to show it was picked up. Only failures get a reply; a
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
  baseUrl?: string,
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
        content: "eyes",
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
   * Queues the deploy when required checks are still pending, or when
   * auto_merge merged the default branch into the branch first. Returns false
   * when the refusal can't be waited out: a check already failed, or GitHub
   * refused for another reason.
   */
  async function queue(error: any, target: string, pr: PullRequest) {
    const merged = error instanceof AutoMergeError && error.merged;
    const checks = unmetChecks(error);
    if (
      !merged &&
      (!checks || checks.failed.length || !checks.pending.length)
    ) {
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
    if (merged) {
      const queued = await queueAfterMerge(context, watchStore, watch, reply);
      await publish(watchEvent(queued, context.payload.installation));
      return true;
    }
    context.log.info(
      logCtx(context, { target, sha: watch.sha, pending: checks!.pending }),
      "pr deploy: queued until checks pass",
    );
    await watchStore.addWatch(watch.repository.id, watch);
    await reply(
      `Waiting for ${listChecks(checks!.pending)} to pass, ` +
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
    await reply(
      errorMessage(
        error,
        ref || "this branch",
        dashboardUrl(baseUrl, context.payload.repository),
      ),
    );
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
  baseUrl?: string,
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
      baseUrl,
    );
  });
}
