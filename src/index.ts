import { InMemStore } from "./store";
import { app } from "./app";
import { EventEmitter } from "events";

const events = new EventEmitter();
const lockStore = () => new InMemStore<any>();

export = app({ lockStore, events });
