import { postgresServices, migrate } from "../src";

export const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/deliverybot_test";

export async function setup() {
  const db = postgresServices({
    connectionString: DATABASE_URL,
    lock: { minRetries: 1, maxRetries: 1, retryDelay: 10 },
  });
  await migrate(db.pool);
  await db.pool.query("TRUNCATE kv, users, jobs");
  return db;
}
