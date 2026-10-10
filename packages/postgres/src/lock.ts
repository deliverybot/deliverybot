import { Pool } from "pg";
import { logger, LockError, LockStore } from "@deliverybot/core";

export interface LockOptions {
  minRetries: number;
  maxRetries: number;
  retryDelay: number;
}

const defaults: LockOptions = {
  // Retries for between 30 seconds and 2 minutes, randomly.
  minRetries: 2,
  maxRetries: 8,
  retryDelay: 1000 * 15,
};

/**
 * Distributed lock using a Postgres session advisory lock. The lock is held
 * by a dedicated connection, so it is released automatically if the process
 * dies; no lease is needed.
 */
export class PostgresLockStore implements LockStore {
  private opts: LockOptions;

  constructor(
    private pool: Pool,
    opts: Partial<LockOptions> = {},
  ) {
    this.opts = { ...defaults, ...opts };
  }

  private retries() {
    const { minRetries, maxRetries } = this.opts;
    return (
      Math.floor(Math.random() * (maxRetries - minRetries + 1)) + minRetries
    );
  }

  public async lock(key: string, handler: () => Promise<void>): Promise<void> {
    const retries = this.retries();
    for (let tries = 1; ; tries++) {
      const client = await this.pool.connect();
      let locked = false;
      try {
        const { rows } = await client.query(
          "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
          [key],
        );
        locked = rows[0].locked;
        if (locked) {
          logger.info({ key }, "locked key");
          try {
            await handler();
          } finally {
            logger.info({ key }, "unlock key");
            await client.query(
              "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
              [key],
            );
          }
          return;
        }
      } finally {
        client.release();
      }
      if (tries > retries) {
        throw new LockError(
          `Lock retry limit reached retries=${tries} key=${key}`,
        );
      }
      logger.warn({ key, tries }, "retrying lock");
      await new Promise((r) => setTimeout(r, this.opts.retryDelay));
    }
  }
}
