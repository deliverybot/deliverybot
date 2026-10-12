import { Dependencies } from "@deliverybot/core";
import { prClose } from "./pr-close.js";
import { prDeploy } from "./pr-deploy.js";
import { auto } from "./auto.js";
import { EnvLockStore, WatchStore } from "./store.js";

export function deploybot({ robot, kvService, lockService }: Dependencies) {
  const lockStore = new EnvLockStore(kvService);
  const watchStore = new WatchStore(kvService);
  prClose(robot);
  prDeploy(robot, lockStore);
  auto(robot, lockService, watchStore, lockStore, robot.receive.bind(robot));
}

export { config, deploy } from "./deploy.js";
export { EnvLockStore, WatchStore } from "./store.js";
export {
  Watch,
  Target,
  Targets,
  LockError,
  AccessError,
  ConfigError,
  UnknownTargetError,
  DeployBody,
} from "./types.js";
