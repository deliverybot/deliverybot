import { Pool } from "pg";
import { logger } from "@deliverybot/core";
import { migrate } from "./migrate.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
migrate(pool)
  .then(() => logger.info("migrations complete"))
  .catch((error) => {
    logger.error({ error }, "migrations failed");
    process.exitCode = 1;
  })
  .finally(() => pool.end());
