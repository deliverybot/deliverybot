import { useOwnInstallUrl } from "@deliverybot/app";
import { logger } from "@deliverybot/core";
import { app } from "./index.js";

const port = Number(process.env.PORT) || 3000;
const server = app.express.listen(port, () => {
  logger.info({ port }, "listening");
});

useOwnInstallUrl(app.probot).catch((error) => {
  logger.warn({ error }, "could not look up the GitHub App's install URL");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    logger.info({ signal }, "server stopping");
    server.close(() => process.exit(0));
  });
}
