import { InMemStore } from "./store";
import { app } from "./app";

const lockStore = () => new InMemStore<any>();
export = app(lockStore);
