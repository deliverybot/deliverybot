import { InMemStore } from "./store";
import { app } from "./app";

export = app(() => new InMemStore());
