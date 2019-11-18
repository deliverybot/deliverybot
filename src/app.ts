import { prClose } from "./pr-close";
import { prDeploy } from "./pr-deploy";
import { auto } from "./auto";
import { Application } from "probot";
import { LockStore, WatchStore } from "./store";

export function app(
  application: Application,
  lockStore: LockStore,
  watchStore: WatchStore
) {
  prClose(application);
  prDeploy(application, lockStore);
  auto(application, lockStore, watchStore);
}
