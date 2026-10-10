import { Pool } from "pg";
import { KVStore } from "@deliverybot/core";

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export class PostgresKVStore<T> implements KVStore<T> {
  constructor(private pool: Pool) {}

  async put(key: string, val: T) {
    await this.pool.query(
      `INSERT INTO kv (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [key, JSON.stringify(val)],
    );
  }

  async get(key: string): Promise<T | undefined> {
    const { rows } = await this.pool.query(
      "SELECT value FROM kv WHERE key = $1",
      [key],
    );
    return rows.length ? (rows[0].value as T) : undefined;
  }

  async del(key: string) {
    await this.pool.query("DELETE FROM kv WHERE key = $1", [key]);
  }

  /**
   * Lists the direct children of `prefix`, like a Firestore collection:
   * `list("repos/1/locks")` returns `repos/1/locks/prod` but not
   * `repos/1/locks/prod/history/1`.
   */
  async list(prefix: string): Promise<T[]> {
    const base = escapeLike(prefix.replace(/\/$/, "")) + "/";
    const { rows } = await this.pool.query(
      `SELECT value FROM kv
       WHERE key LIKE $1 AND key NOT LIKE $2
       ORDER BY key`,
      [`${base}%`, `${base}%/%`],
    );
    return rows.map((r) => r.value as T);
  }
}
