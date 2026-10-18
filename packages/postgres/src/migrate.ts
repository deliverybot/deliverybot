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
  `
  -- Schema expected by connect-pg-simple.
  CREATE TABLE session (
    sid varchar NOT NULL PRIMARY KEY,
    sess json NOT NULL,
    expire timestamp(6) NOT NULL
  );
  CREATE INDEX session_expire ON session (expire);
  `,
  `
  CREATE TABLE installations (
    id bigint PRIMARY KEY,
    account text NOT NULL,
    account_type text NOT NULL,
    repository_selection text NOT NULL,
    suspended boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  -- Lets the queue cap how many jobs of one installation run at once.
  ALTER TABLE jobs ADD COLUMN installation_id bigint;
  CREATE INDEX jobs_running ON jobs (installation_id)
    WHERE locked_until IS NOT NULL;
  `,
  `
  -- Urgent jobs (a person waiting on a /deploy comment) run first, and an
  -- event id has at most one job waiting to run.
  ALTER TABLE jobs ADD COLUMN priority smallint NOT NULL DEFAULT 0;
  ALTER TABLE jobs ADD COLUMN event_id text;
  DROP INDEX jobs_ready;
  CREATE INDEX jobs_ready ON jobs (priority DESC, run_at, id)
    WHERE state = 'queued';
  CREATE UNIQUE INDEX jobs_waiting_event ON jobs (event_id)
    WHERE state = 'queued' AND locked_until IS NULL;
  `,
  `
  -- The last webhook event seen per repository, for the admin dashboard.
  CREATE TABLE IF NOT EXISTS repositories (
    id bigint PRIMARY KEY,
    installation_id bigint NOT NULL,
    full_name text NOT NULL,
    last_event text NOT NULL,
    last_event_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS repositories_installation
    ON repositories (installation_id);

  -- A preview build of this migration once ran as version 5, so databases
  -- it ran on skipped the real version 5. Apply it again where it's missing.
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 0;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS event_id text;
  DROP INDEX IF EXISTS jobs_ready;
  CREATE INDEX jobs_ready ON jobs (priority DESC, run_at, id)
    WHERE state = 'queued';
  CREATE UNIQUE INDEX IF NOT EXISTS jobs_waiting_event ON jobs (event_id)
    WHERE state = 'queued' AND locked_until IS NULL;
  `,
  `
  -- Kept up to date by webhooks so the admin dashboard doesn't ask GitHub.
  ALTER TABLE installations ADD COLUMN repository_count integer;
  `,
  `
  -- Repositories with a .github/deploy.yml on their default branch, kept up
  -- to date by webhooks so the dashboard doesn't check every repository.
  CREATE TABLE configured_repositories (
    id bigint PRIMARY KEY,
    installation_id bigint NOT NULL
  );
  CREATE INDEX configured_repositories_installation
    ON configured_repositories (installation_id);
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
