import { getApp } from "./app";
import { InMemStore } from "./store";
import { apps } from "./apps";

export = getApp(apps, {
  kvStore: <T>() => new InMemStore<T>()
});
