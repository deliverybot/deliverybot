import { Services } from "../";
import { KVStore } from "./kv";
import { LockStore } from "./lock";
import { MessageBus } from "./message";
import { UserStore } from "./user";
import { InstallationStore } from "./installation";

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
