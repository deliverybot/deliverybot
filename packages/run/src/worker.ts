import http from "http";
import { backfillConfigs, jobs } from "@deliverybot/app";
import { load, logger } from "@deliverybot/core";
import { db, opts, services } from "./config.js";

if (!db) {
  logger.error("the worker needs DATABASE_URL");
  process.exit(1);
}

const { probot } = load(services, jobs, { ...opts, dispatcher: undefined });
db.queue.work((event) => probot.receive(event));
logger.info("worker started");

// Fills in configured repositories for installations that haven't had them
// checked, alongside the queue rather than ahead of it.
backfillConfigs(probot, services.installationService())
  .then((count) => logger.info({ count }, "config backfill done"))
  .catch((error) => logger.error({ error }, "config backfill failed"));

// Liveness check: fails once the queue loop is stuck, so Kubernetes
// restarts the worker instead of leaving it up but doing nothing.
const healthPort = Number(process.env.HEALTH_PORT) || 8080;
const health = http
  .createServer((req, res) => {
    const ok = req.url === "/healthz" && db!.queue.healthy();
    res.writeHead(ok ? 200 : 503, { "content-type": "text/plain" });
    res.end(ok ? "ok" : "unhealthy");
  })
  .listen(healthPort);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    logger.info({ signal }, "worker stopping");
    health.close();
    await db!.queue.stop();
    await db!.pool.end();
    process.exit(0);
  });
}
