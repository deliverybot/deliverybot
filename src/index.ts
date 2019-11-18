import { InMemStore } from "./store";
import { Application } from "probot";
import { app } from "./app";

export = (application: Application) => {
  const store = new InMemStore();
  app(application, store, store);
};
