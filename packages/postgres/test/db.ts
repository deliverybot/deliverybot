import { postgresServices, migrate } from "../src/index.js";

export const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/deliverybot_test";

export async function setup() {
  const db = postgresServices({
    connectionString: DATABASE_URL,
    lock: { minRetries: 1, maxRetries: 1, retryDelay: 10 },
  });
  await migrate(db.pool);
  await db.pool.query(
    "TRUNCATE kv, users, repository_visits, jobs, session, installations, repositories, configured_repositories, deployments",
  );
  return db;
}
