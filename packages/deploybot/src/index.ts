import { Dependencies } from "@deliverybot/core";
import { prClose } from "./pr-close";
import { prDeploy } from "./pr-deploy";
import { auto } from "./auto";
import { EnvLockStore, WatchStore } from "./store";

export function deploybot({ robot, kvService, lockService }: Dependencies) {
  const lockStore = new EnvLockStore(kvService);
  const watchStore = new WatchStore(kvService);
  prClose(robot);
  prDeploy(robot, lockStore);
  auto(robot, lockService, watchStore, lockStore, robot.receive.bind(robot));
}

export { config, deploy } from "./deploy";
export { EnvLockStore, WatchStore } from "./store";
export {
  Watch,
  Target,
  Targets,
  LockError,
  ConfigError,
  DeployBody,
} from "./types";
