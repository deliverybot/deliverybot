import { randomUUID as uuid } from "crypto";
import {
  Application,
  Context,
  LockService,
  WebhookEvent,
} from "@deliverybot/core";
import { WatchStore, EnvLockStore } from "./store.js";
import { PayloadRepository, Watch } from "./types.js";
import { logCtx } from "./util.js";
import { config, deploy } from "./deploy.js";
import { hash } from "./util.js";
import { touches } from "./paths.js";

/**
 * Lists the files a push or pull request changed, or returns null when that
 * can't be known for sure. Targets with a `path` deploy anyway in that case.
 */
type ChangedFiles = () => Promise<string[] | null>;

// GitHub stops listing commits in a push payload, and files in a pull request
// or comparison, at these limits.
const maxPushCommits = 2048;
const maxPullFiles = 3000;
const maxCompareFiles = 300;

export function match(auto: string | undefined, ref: string) {
  if (!auto) return false;
  for (let i = 0; i < auto.length; i++) {
    if (auto[i] === "*") return true;
    if (auto[i] !== ref[i]) return false;
  }
  return auto.length === ref.length;
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
    changedFiles: ChangedFiles,
    prNumber?: number,
  ) {
    try {
      let anyAdded = false;
      let files: Promise<string[] | null> | undefined;
      const conf = await config(context.octokit, context.repo());
      for (const target in conf) {
        const targetVal = conf[target]!;
        if (!match(targetVal.auto_deploy_on, matchRef)) {
          continue;
        }
        if (targetVal.path) {
          files = files || changedFiles();
          const changed = await files;
          if (changed && !touches(targetVal.path, changed)) {
            context.log.info(
              logCtx(context, { ref, sha, target, path: targetVal.path }),
              "auto deploy: path not changed",
            );
            continue;
          }
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
   * Process watch determines if given a watch it needs to be re-deployed. It
   * returns true if this watch is done and can be removed. Watches are done for
   * a variety of scenarios:
   *
   * - The watch is old and should not be processed.
   * - The watch is already deployed.
   * - There is a non-retryable configuration error.
   *
   * A watch for a target with a path moves to a newer commit on its ref when
   * the newer commits leave the path alone, since deploying the ref deploys
   * that commit. It returns the sha it moved to then.
   */
  async function processWatch(
    context: Context,
    watch: Watch,
  ): Promise<boolean | string> {
    const { sha, ref, target, targetVal } = watch;

    // Check if the current sha for this ref is equal to this watch. Since
    // multiple watches can be in progress we only want to process the latest
    // of them.
    const refreshed = await context.octokit.rest.git.getRef(
      context.repo({ ref: ref.replace("refs/", "") }),
    );
    const currentSha = refreshed.data.object.sha;
    if (
      currentSha !== sha &&
      (await unchangedSince(context, targetVal.path, sha, currentSha))
    ) {
      context.log.info(
        logCtx(context, { ref, sha, currentSha, target }),
        "auto deploy: path unchanged, moving watch",
      );
      await watchStore.addWatch(watch.repository.id, {
        ...watch,
        id: uuid(),
        sha: currentSha,
      });
      return currentSha;
    }
    if (currentSha !== sha) {
      // This is an old watch, return true.
      context.log.info(
        logCtx(context, { ref, sha, currentSha }),
        "auto deploy: old watch",
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
        case 409:
          context.log.info(
            logCtx(context, { target, ref, error }),
            "auto deploy: checks not ready",
          );
          return false;
        case "LockError":
          context.log.info(
            logCtx(context, { target, ref, error }),
            "auto deploy: environment locked",
          );
          return true; // We don't wait for "unlock" events and redeploy.
        case "ConfigError":
          context.log.info(
            logCtx(context, { target, ref, error }),
            "auto deploy: target config error",
          );
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
   * A target with a path only watches commits that change it, so a newer
   * commit on the ref that leaves the path alone doesn't make its watch old.
   */
  async function unchangedSince(
    context: Context,
    path: string | undefined,
    sha: string,
    currentSha: string,
  ) {
    if (!path) return false;
    const compare = await context.octokit.rest.repos.compareCommitsWithBasehead(
      context.repo({ basehead: `${sha}...${currentSha}` }),
    );
    const files = (compare.data.files || []).map((f) => f.filename);
    return (
      compare.data.status === "ahead" &&
      files.length < maxCompareFiles &&
      !touches(path, files)
    );
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
        publish({
          // One id per watch, so the queue keeps a single waiting event per
          // watch however many checks complete in a row.
          id: `push_watch:${watch.id}`,
          name: "push_watch",
          payload: {
            ...watch,
            installation: context.payload.installation,
          },
        } as any),
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
  app.onCustom("push_watch", async (context) => {
    const watch = context.payload as unknown as Watch;
    let movedTo: string | undefined;
    await lockWatch(context, async () => {
      const result = await processWatch(context, watch);
      if (typeof result === "string") movedTo = result;
      return result !== false;
    });
    // Outside the lock, which the moved watch takes too.
    if (movedTo) await emitWatches(context, watch.repository.id, movedTo);
  });

  // Push handles creating new watches that need to appear.
  app.on("push", async (context) => {
    await addWatch(
      context,
      context.payload.ref,
      context.payload.ref,
      context.payload.after,
      context.payload.repository,
      async () => {
        const { commits, created, forced } = context.payload;
        if (created || forced || !commits?.length) return null;
        if (commits.length >= maxPushCommits) return null;
        return commits.flatMap((c) => [
          ...(c.added || []),
          ...(c.modified || []),
          ...(c.removed || []),
        ]);
      },
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
      () => pullRequestFiles(context),
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
      () => pullRequestFiles(context),
      context.payload.number,
    );
  });
}

/** Files changed by the pull request, including the old names of renames. */
async function pullRequestFiles(
  context: Context<"pull_request">,
): Promise<string[] | null> {
  const files = await context.octokit.paginate(
    context.octokit.rest.pulls.listFiles,
    context.pullRequest({ per_page: 100 }),
  );
  if (files.length >= maxPullFiles) return null;
  return files.flatMap((f) =>
    f.previous_filename ? [f.filename, f.previous_filename] : [f.filename],
  );
}
