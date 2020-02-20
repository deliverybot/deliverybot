import * as admin from "firebase-admin";
import { Services } from "@deliverybot/core";
import { FirebaseKVStore } from "./kv";
import { FirebaseLockStore } from "./lock";
import { FirebaseUsersStore } from "./user";
import { FirebaseMessageBus } from "./message";
import { FirebasePubSubStore } from "./pubsub";

export function firebase(
  firebase: admin.app.App,
): Services & { pubsubService: () => FirebasePubSubStore } {
  return {
    kvService: load(() => new FirebaseKVStore(firebase)),
    lockService: load(() => new FirebaseLockStore(firebase)),
    messageService: load(() => new FirebaseMessageBus(firebase)),
    userService: load(() => new FirebaseUsersStore(firebase)),
    pubsubService: load(() => new FirebasePubSubStore(firebase)),
  };
}

function load<T>(fn: () => T) {
  let memo: T;
  return (): T => {
    if (!memo) {
      memo = fn();
    }
    return memo;
  };
}
