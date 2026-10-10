import { apps } from "@deliverybot/app";
import { load } from "@deliverybot/core";
import { db, opts, services } from "./config";

// In production webhook events go to the Postgres queue and `worker.js`
// processes them. Otherwise they are processed in this process.
const queue = db && opts.production ? db.queue : undefined;

export = load(services, apps, {
  ...opts,
  dispatcher: queue && queue.dispatcher,
});
