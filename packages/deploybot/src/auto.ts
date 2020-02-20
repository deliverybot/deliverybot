import Webhooks from "@octokit/webhooks";
import { PayloadRepository } from "@octokit/webhooks";
import { v4 as uuid } from "uuid";
import { Application, Context, LockService } from "@deliverybot/core";
import { WatchStore, EnvLockStore } from "./store";
import { Watch } from "./types";
import { logCtx } from "./util";
import { config, deploy } from "./deploy";
import { hash } from "./util";

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
  publish: (event: Webhooks.WebhookEvent<any>) => Promise<any>,
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
      const conf = await config(context.github, context.repo());
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
    const refreshed = await context.github.git.getRef(
      context.repo({ ref: ref.replace("refs/", "") }),
    );
    const currentSha = refreshed.data.object.sha;
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
    const deploys = await context.github.repos.listDeployments(
      context.repo({ sha }),
    );
    if (deploys.data.find(d => d.environment === targetVal.environment)) {
      context.log.info(
        logCtx(context, { ref }),
        "auto deploy: already deployed",
      );
      return true;
    }

    let pr = undefined;
    if (watch.prNumber) {
      const prObject = await context.github.pulls.get({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        pull_number: watch.prNumber,
      });
      pr = prObject.data;
    }

    context.log.info(logCtx(context, { ref }), "auto deploy: deploying");
    try {
      await deploy(
        context.github,
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
   * Lock watch will handle receiving a watch and deleting it if it's processed
   * successfully.
   */
  function lockWatch(context: Context, handle: () => Promise<boolean>) {
    // We need to lock by the ref + repository here. Since we want to deploy
    // by reference and not by the sha.
    const watch = context.payload as Watch;
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
        watches: watches.map(w => ({
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
      watches.map(watch =>
        publish({
          id: uuid(),
          name: "push_watch",
          payload: {
            ...watch,
            installation: context.payload.installation,
          },
          protocol: context.protocol,
          host: context.host,
          url: context.url,
        }),
      ),
    );
  }

  // Status events emit different watches to auto-deploy code.
  app.on("status", async context => {
    await emitWatches(
      context,
      context.payload.repository.id,
      context.payload.sha,
    );
  });

  // Check run events emit different watches to auto-deploy code.
  app.on("check_run", async context => {
    await emitWatches(
      context,
      context.payload.repository.id,
      context.payload.check_run.check_suite.head_sha,
    );
  });

  // Handles a synthetic push watch event. This fires whenever a change happens
  // to a specific commit where a watch exists on that commit.
  app.on("push_watch", context =>
    lockWatch(
      context,
      (): Promise<boolean> => {
        const watch = context.payload as Watch;
        return processWatch(context, watch);
      },
    ),
  );

  // Push handles creating new watches that need to appear.
  app.on("push", async context => {
    await addWatch(
      context,
      context.payload.ref,
      context.payload.ref,
      context.payload.after,
      context.payload.repository,
    );
  });

  // Auto deploy on open PR event
  app.on("pull_request.opened", async context => {
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
  app.on("pull_request.synchronize", async context => {
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
