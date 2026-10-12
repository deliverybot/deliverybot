import { randomUUID as uuid } from "crypto";
import {
  Application,
  Context,
  LockService,
  WebhookEvent,
} from "@deliverybot/core";
import { WatchStore, EnvLockStore, watchEvent } from "./store.js";
import { PayloadRepository, Watch } from "./types.js";
import { listChecks, logCtx } from "./util.js";
import { config, deploy, unmetChecks } from "./deploy.js";
import { errorMessage } from "./pr-deploy.js";
import { hash } from "./util.js";

/**
 * Turns one glob pattern into an anchored regular expression. `*` matches any
 * run of characters, including `/` so that `refs/heads/*` covers nested branch
 * names, `?` matches a single character and `[...]` a character class.
 */
function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      source += ".*";
    } else if (c === "?") {
      source += ".";
    } else if (c === "[" && glob.indexOf("]", i + 2) !== -1) {
      const end = glob.indexOf("]", i + 2);
      let set = glob.slice(i + 1, end).replace(/\\/g, "\\\\");
      if (set[0] === "!") set = "^" + set.slice(1);
      source += `[${set}]`;
      i = end;
    } else {
      source += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

/**
 * Reports whether a ref matches the `auto_deploy_on` setting, which is one
 * glob or a list of them. In a list, a pattern starting with `!` excludes the
 * refs it matches, so `[refs/tags/v*, "!refs/tags/v*-rc*"]` deploys every
 * version tag except release candidates.
 */
export function match(auto: string | string[] | undefined, ref: string) {
  if (!auto) return false;
  const patterns = Array.isArray(auto) ? auto : [auto];
  let matched = false;
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) {
      if (globToRegExp(pattern.slice(1)).test(ref)) return false;
    } else if (globToRegExp(pattern).test(ref)) {
      matched = true;
    }
  }
  return matched;
}

/**
 * Wires up automatic deployments for the `auto_deploy_on` configuration
 * variable  in the deploy.yml.
 */
export function auto(
  app: Application,
  lockService: LockService,
  watchStore: WatchStore,
  envLockStore: EnvLockStore,
  publish: (event: WebhookEvent) => Promise<any>,
) {
  /**
   * Add watch adds a watch on a specific ref, sha and repository.
   * The matchRef argument can be an specific ref or the keyword 'pr'.
   * On pr you'll need to pass the number to the watch.
   */
  async function addWatch(
    context: Context,
    matchRef: string,
    ref: string,
    sha: string,
    repository: PayloadRepository,
    prNumber?: number,
  ) {
    try {
      let anyAdded = false;
      const conf = await config(context.octokit, context.repo());
      for (const target in conf) {
        const targetVal = conf[target]!;
        if (!match(targetVal.auto_deploy_on, matchRef)) {
          continue;
        }
        context.log.info(
          logCtx(context, {
            ref,
            sha,
            target,
            autoDeployOn: targetVal.auto_deploy_on,
          }),
          "auto deploy: add watch",
        );
        const watch: Watch = {
          id: uuid(),
          targetVal,
          ref,
          sha,
          repository,
          target,
          prNumber,
        };
        anyAdded = true;
        await watchStore.addWatch(repository.id, watch);
      }

      // Need to trigger this immediately. This will actually process the
      // added watches.
      if (anyAdded) {
        await emitWatches(context, repository.id, sha);
      }
    } catch (error) {
      // This error block will mostly catch configuration errors and simply
      // return until the next event comes a long with new configuration.
      switch (error.status) {
        case 404:
          context.log.info(
            logCtx(context, { error }),
            "auto deploy: no config",
          );
          break;
        case "ConfigError":
          context.log.info(
            logCtx(context, { error }),
            "auto deploy: config err",
          );
          break;
        default:
          context.log.error(logCtx(context, { error }), "auto deploy: failed");
          throw error;
      }
    }
  }

  /**
   * Tells whoever queued a deploy with `/deploy` why it won't go out. Auto
   * deploy watches have nobody to tell, so they stay quiet.
   */
  async function tellRequester(context: Context, watch: Watch, body: string) {
    if (!watch.requestedBy || !watch.prNumber) return;
    await context.octokit.rest.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: watch.prNumber,
      body: `@${watch.requestedBy} ${body}`,
    });
  }

  /**
   * Process watch determines if given a watch it needs to be re-deployed. It
   * returns true if this watch is done and can be removed. Watches are done for
   * a variety of scenarios:
   *
   * - The watch is old and should not be processed.
   * - The watch is already deployed.
   * - There is a non-retryable configuration error.
   */
  async function processWatch(
    context: Context,
    watch: Watch,
  ): Promise<boolean> {
    const { sha, ref, target, targetVal } = watch;

    // Check if the current sha for this ref is equal to this watch. Since
    // multiple watches can be in progress we only want to process the latest
    // of them.
    const refreshed = await context.octokit.rest.git.getRef(
      context.repo({ ref: ref.replace("refs/", "") }),
    );
    const currentSha = refreshed.data.object.sha;
    if (currentSha !== sha) {
      // This is an old watch, return true.
      context.log.info(
        logCtx(context, { ref, sha, currentSha }),
        "auto deploy: old watch",
      );
      await tellRequester(
        context,
        watch,
        `\`${ref.replace(/^(refs\/)?heads\//, "")}\` moved on to a newer commit, so the queued deploy to \`${target}\` was cancelled.`,
      );
      return true;
    }

    context.log.info(
      logCtx(context, { ref, sha, target, watchId: watch.id }),
      "auto deploy: processing watch",
    );
    const deploys = await context.octokit.rest.repos.listDeployments(
      context.repo({ sha }),
    );
    if (deploys.data.find((d) => d.environment === targetVal.environment)) {
      context.log.info(
        logCtx(context, { ref }),
        "auto deploy: already deployed",
      );
      return true;
    }

    let pr = undefined;
    if (watch.prNumber) {
      const prObject = await context.octokit.rest.pulls.get({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        pull_number: watch.prNumber,
      });
      pr = prObject.data;
    }

    context.log.info(logCtx(context, { ref }), "auto deploy: deploying");
    try {
      await deploy(
        context.octokit,
        context.log,
        envLockStore,
        context.repo({
          ref,
          sha,
          target,
          pr,
        }),
      );
      context.log.info(logCtx(context, { ref }), "auto deploy: done");
      return true;
    } catch (error) {
      // Catch deploy errors and return if this is a normal scenario for an
      // auto deployment.
      switch (error.status) {
        case 409: {
          // A queued /deploy gives up once a required check fails. Auto
          // deploys keep waiting, since a re-run can still turn it green.
          const failed = unmetChecks(error)?.failed || [];
          if (watch.requestedBy && failed.length) {
            context.log.info(
              logCtx(context, { target, ref, failed }),
              "auto deploy: queued deploy checks failed",
            );
            await tellRequester(
              context,
              watch,
              `${listChecks(failed)} failed, so the queued deploy to \`${target}\` was cancelled.`,
            );
            return true;
          }
          context.log.info(
            logCtx(context, { target, ref, error }),
            "auto deploy: checks not ready",
          );
          return false;
        }
        case "LockError":
          context.log.info(
            logCtx(context, { target, ref, error }),
            "auto deploy: environment locked",
          );
          await tellRequester(context, watch, errorMessage(error, ref));
          return true; // We don't wait for "unlock" events and redeploy.
        case "ConfigError":
          context.log.info(
            logCtx(context, { target, ref, error }),
            "auto deploy: target config error",
          );
          await tellRequester(context, watch, errorMessage(error, ref));
          return true;
        default:
          context.log.error(
            logCtx(context, { target, ref, error }),
            "auto deploy: deploy attempt failed",
          );
          throw error;
      }
    }
  }

  /**
   * Lock watch will handle receiving a watch and deleting it if it's processed
   * successfully.
   */
  function lockWatch(context: Context, handle: () => Promise<boolean>) {
    // We need to lock by the ref + repository here. Since we want to deploy
    // by reference and not by the sha.
    const watch = context.payload as unknown as Watch;
    const key = hash([watch.ref, watch.repository.id.toString(), watch.target]);
    context.log.info(
      logCtx(context, {
        key,
        ref: watch.ref,
        repo: watch.repository.id,
        target: watch.target,
        watchId: context.payload.id,
      }),
      "auto deploy: locking",
    );
    return lockService().lock(key, async () => {
      const done = await handle();
      if (done) {
        await watchStore.delWatch(watch.repository.id, watch);
      }
    });
  }

  /**
   * Emit watches emits all watches listed by a given sha as a push_watch event
   * to trigger logic to run the automatic deployments.
   */
  async function emitWatches(context: Context, repoId: number, sha: string) {
    const watches = await watchStore.listWatchBySha(repoId, sha);
    context.log.info(
      logCtx(context, {
        repoId,
        sha,
        watches: watches.map((w) => ({
          target: w.target,
          id: w.id,
          ref: w.ref,
          sha: w.sha,
          repo: w.repository.id,
        })),
      }),
      "auto deploy: emitting watches",
    );
    await Promise.all(
      watches.map((watch) =>
        publish(watchEvent(watch, context.payload.installation)),
      ),
    );
  }

  // A watch can only deploy once its checks have passed, so a check run that
  // starts or a status that turns pending can't change anything. Busy
  // repositories send a lot of these, so drop them before they are queued.
  app.ignore((event) => {
    const payload: any = event.payload;
    return (
      (event.name === "check_run" && payload.action !== "completed") ||
      (event.name === "status" && payload.state === "pending")
    );
  });

  // Status events emit different watches to auto-deploy code.
  app.on("status", async (context) => {
    await emitWatches(
      context,
      context.payload.repository.id,
      context.payload.sha,
    );
  });

  // Check run events emit different watches to auto-deploy code.
  app.on("check_run.completed", async (context) => {
    const sha = context.payload.check_run.check_suite.head_sha;
    if (!sha) return;
    await emitWatches(context, context.payload.repository.id, sha);
  });

  // Handles a synthetic push watch event. This fires whenever a change happens
  // to a specific commit where a watch exists on that commit.
  app.onCustom("push_watch", (context) =>
    lockWatch(context, (): Promise<boolean> => {
      const watch = context.payload as unknown as Watch;
      return processWatch(context, watch);
    }),
  );

  // Push handles creating new watches that need to appear.
  app.on("push", async (context) => {
    await addWatch(
      context,
      context.payload.ref,
      context.payload.ref,
      context.payload.after,
      context.payload.repository,
    );
  });

  // Auto deploy on open PR event
  app.on("pull_request.opened", async (context) => {
    await addWatch(
      context,
      "pr",
      `heads/${context.payload.pull_request.head.ref}`,
      context.payload.pull_request.head.sha,
      context.payload.repository,
      context.payload.number,
    );
  });

  // Auto deploy on push to PR
  app.on("pull_request.synchronize", async (context) => {
    await addWatch(
      context,
      "pr",
      `heads/${context.payload.pull_request.head.ref}`,
      context.payload.pull_request.head.sha,
      context.payload.repository,
      context.payload.number,
    );
  });
}
