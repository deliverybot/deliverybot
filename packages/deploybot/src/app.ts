import { prClose } from "./pr-close";
import { prDeploy } from "./pr-deploy";
import { auto } from "./auto";
import { Application } from "probot";
import { LockStore, WatchStore } from "./store";
import Webhooks from "@octokit/webhooks";

/**
 * Instantiates all the components of the app with it's dependencies.
 */
export function app(
  application: Application,
  lockStore: LockStore,
  watchStore: WatchStore,
  publish: (event: Webhooks.WebhookEvent<any>) => Promise<any>
) {
  prClose(application);
  prDeploy(application, lockStore);
  auto(application, lockStore, watchStore, publish);
}
