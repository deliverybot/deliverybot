import { Services } from "../index.js";
import { KVStore } from "./kv.js";
import { LockStore } from "./lock.js";
import { MessageBus } from "./message.js";
import { UserStore } from "./user.js";
import { InstallationStore } from "./installation.js";

export function local(): Services {
  const kv = new KVStore();
  const lock = new LockStore();
  const msg = new MessageBus();
  const user = new UserStore();
  const installation = new InstallationStore();
  return {
    kvService: () => kv,
    lockService: () => lock,
    messageService: () => msg,
    userService: () => user,
    installationService: () => installation,
  };
}
