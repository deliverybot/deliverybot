import { Pool } from "pg";
import { logger } from "@deliverybot/core";

/**
 * Schema migrations, applied in order. Never edit one that has shipped;
 * append a new one instead.
 */
export const migrations: string[] = [
  `
  CREATE TABLE kv (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX kv_key_prefix ON kv (key text_pattern_ops);

  CREATE TABLE users (
    id text PRIMARY KEY,
    username text NOT NULL,
    email text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  `,
  `
  CREATE TABLE jobs (
    id bigserial PRIMARY KEY,
    name text NOT NULL,
    data jsonb NOT NULL,
    state text NOT NULL DEFAULT 'queued',
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL,
    run_at timestamptz NOT NULL DEFAULT now(),
    locked_until timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX jobs_ready ON jobs (run_at, id) WHERE state = 'queued';
  `,
];

// Arbitrary constant so concurrent processes don't migrate at the same time.
const MIGRATION_LOCK = 4820193;

export async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version integer PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`,
    );
    const { rows } = await client.query<{ version: number }>(
      "SELECT coalesce(max(version), 0) AS version FROM schema_migrations",
    );
    for (let v = rows[0].version + 1; v <= migrations.length; v++) {
      logger.info({ version: v }, "applying migration");
      await client.query("BEGIN");
      try {
        await client.query(migrations[v - 1]);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [v],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK]);
    client.release();
  }
}
