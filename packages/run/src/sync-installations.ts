import { syncInstallations } from "@deliverybot/app";
import { load, logger } from "@deliverybot/core";
import { db, opts, services } from "./config.js";

// Copies the app's installations from GitHub into the database. Webhooks
// keep them current; run this once for installations made before that, or
// to repair missed webhooks.
const { probot } = load(services, [], opts);
try {
  const saved = await syncInstallations(probot, services.installationService());
  logger.info({ saved }, "installations synced");
} catch (error) {
  logger.error({ error }, "installation sync failed");
  process.exitCode = 1;
} finally {
  await db?.pool.end();
}
