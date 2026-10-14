import { Dependencies } from "@deliverybot/core";
import { prClose } from "./pr-close.js";
import { prDeploy } from "./pr-deploy.js";
import { auto } from "./auto.js";
import { EnvLockStore, WatchStore } from "./store.js";

export function deploybot({
  robot,
  kvService,
  lockService,
  config,
}: Dependencies) {
  const lockStore = new EnvLockStore(kvService);
  const watchStore = new WatchStore(kvService);

  // Only these pull request actions start or end a deployment. The rest
  // (labels, reviews, edits) would be queued for nothing.
  const prActions = ["opened", "synchronize", "closed"];
  robot.ignore(
    (event) =>
      event.name === "pull_request" &&
      !prActions.includes((event.payload as any).action),
  );

  prClose(robot);
  const publish = robot.receive.bind(robot);
  prDeploy(robot, lockStore, watchStore, publish, config.baseUrl);
  auto(robot, lockService, watchStore, lockStore, publish, config.baseUrl);
}

export { config, deploy } from "./deploy.js";
export { EnvLockStore, WatchStore } from "./store.js";
export {
  Watch,
  Target,
  Targets,
  LockError,
  ConfigError,
  AutoMergeError,
  UnknownTargetError,
  DeployBody,
} from "./types.js";
