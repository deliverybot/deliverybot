import { jobs } from "@deliverybot/app";
import { load, logger } from "@deliverybot/core";
import { db, opts, services } from "./config.js";

if (!db) {
  logger.error("the worker needs DATABASE_URL");
  process.exit(1);
}

const { probot } = load(services, jobs, { ...opts, dispatcher: undefined });
db.queue.work((event) => probot.receive(event));
logger.info("worker started");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    logger.info({ signal }, "worker stopping");
    await db!.queue.stop();
    await db!.pool.end();
    process.exit(0);
  });
}
