import { Application, Context } from "probot";
import { WatchStore, LockStore, Watch } from "./store";
import { logCtx } from "./util";
import { config, deploy } from "./deploy";
import { hash } from "./util";
import { v4 as uuid } from "uuid";
import { PayloadRepository } from "@octokit/webhooks";

function match(auto: string, ref: string) {
  return auto === ref;
}

/**
 * Wires up automatic deployments for the `auto_deploy_on` configuration
 * variable  in the deploy.yml.
 */
export function auto(
  app: Application,
  lockStore: LockStore,
  watchStore: WatchStore
) {
  /**
   * Add watch adds a watch on a specific ref, sha and repository.
   */
  async function addWatch(
    context: Context,
    ref: string,
    sha: string,
    repository: PayloadRepository
  ) {
    try {
      let anyAdded = false;
      const conf = await config(context.github, context.repo());
      for (const target in conf) {
        const targetVal = conf[target]!;
        if (!match(targetVal.auto_deploy_on, ref)) {
          continue;
        }
        context.log.info(
          logCtx(context, {
            ref,
            sha,
            target,
            autoDeployOn: targetVal.auto_deploy_on
          }),
          "auto deploy: add watch"
        );
        const watch: Watch = {
          id: uuid(),
          targetVal,
          ref,
          sha,
          repository,
          target
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
            "auto deploy: no config"
          );
          break;
        case "ConfigError":
          context.log.info(
            logCtx(context, { error }),
            "auto deploy: config err"
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
    watch: Watch
  ): Promise<boolean> {
    const { sha, ref, target, targetVal } = watch;

    // Check if the current sha for this ref is equal to this watch. Since
    // multiple watches can be in progress we only want to process the latest
    // of them.
    const refreshed = await context.github.git.getRef(
      context.repo({ ref: ref.replace("refs/", "") })
    );
    const currentSha = refreshed.data.object.sha;
    if (currentSha !== sha) {
      // This is an old watch, return true.
      context.log.info(
        logCtx(context, { ref, sha, currentSha }),
        "auto deploy: old watch"
      );
      return true;
    }

    context.log.info(
      logCtx(context, { ref, sha, target, watchId: watch.id }),
      "auto deploy: processing watch"
    );
    const deploys = await context.github.repos.listDeployments(
      context.repo({ sha })
    );
    if (deploys.data.find(d => d.environment === targetVal.environment)) {
      context.log.info(
        logCtx(context, { ref }),
        "auto deploy: already deployed"
      );
      return true;
    }

    context.log.info(logCtx(context, { ref }), "auto deploy: deploying");
    try {
      await deploy(
        context.github,
        context.log,
        lockStore,
        context.repo({
          ref,
          sha,
          target
        })
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
            "auto deploy: checks not ready"
          );
          return false;
        case "LockError":
          context.log.info(
            logCtx(context, { target, ref, error }),
            "auto deploy: environment locked"
          );
          return true; // We don't wait for "unlock" events and redeploy.
        case "ConfigError":
          context.log.info(
            logCtx(context, { target, ref, error }),
            "auto deploy: target config error"
          );
          return true;
        default:
          context.log.error(
            logCtx(context, { target, ref, error }),
            "auto deploy: deploy attempt failed"
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
    const key = hash([context.payload.repository.id, context.payload.ref]);
    context.log.info(
      { key, watchId: context.payload.id },
      "auto deploy: locking"
    );
    return lockStore.lock(key, async () => {
      const watch = context.payload as Watch;
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
          id: w.id,
          ref: w.ref,
          sha: w.sha,
          repo: w.repository.id
        }))
      }),
      "auto deploy: emitting watches"
    );
    await Promise.all(
      watches.map(watch =>
        app.receive({
          id: context.id,
          name: "push_watch",
          payload: {
            ...watch,
            installation: context.payload.installation
          },
          protocol: context.protocol,
          host: context.host,
          url: context.url
        })
      )
    );
  }

  // Status events emit different watches to auto-deploy code.
  app.on("status", async context => {
    await emitWatches(
      context,
      context.payload.repository.id,
      context.payload.sha
    );
  });

  // Check run events emit different watches to auto-deploy code.
  app.on("check_run", async context => {
    await emitWatches(
      context,
      context.payload.repository.id,
      context.payload.check_run.check_suite.head_sha
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
      }
    )
  );

  // Push handles creating new watches that need to appear.
  app.on("push", async context => {
    await addWatch(
      context,
      context.payload.ref,
      context.payload.after,
      context.payload.repository
    );
  });
}
