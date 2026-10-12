import { Pool, PoolConfig } from "pg";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Services, logger } from "@deliverybot/core";
import { PostgresKVStore } from "./kv.js";
import { PostgresLockStore, LockOptions } from "./lock.js";
import { PostgresMessageBus } from "./message.js";
import { PostgresUserStore } from "./user.js";
import { migrate } from "./migrate.js";
import { PostgresQueue, QueueOptions } from "./queue.js";
import { PostgresInstallationStore } from "./installation.js";

export { migrate, PostgresKVStore, PostgresLockStore, PostgresMessageBus };
export { PostgresUserStore, PostgresQueue, PostgresInstallationStore };

export interface PostgresOptions extends PoolConfig {
  lock?: Partial<LockOptions>;
  queue?: Partial<QueueOptions>;
}

/**
 * Services backed by Postgres. Call `migrate(pool)` before serving traffic.
 */
export function postgresServices(opts: PostgresOptions = {}) {
  const { lock: lockOpts, queue: queueOpts, ...poolConfig } = opts;
  const pool = new Pool({
    // Without these a connection that dies without being closed (the
    // database moving to another node, say) leaves a query waiting forever,
    // and the worker stops processing events without crashing.
    keepAlive: true,
    connectionTimeoutMillis: 1000 * 10,
    query_timeout: 1000 * 60,
    ...poolConfig,
  });
  // An idle connection that drops is removed from the pool and emits this.
  // Unhandled, it would crash the process.
  pool.on("error", (error) => {
    logger.warn({ error }, "postgres: idle connection error");
  });
  const kv = new PostgresKVStore<any>(pool);
  const lock = new PostgresLockStore(pool, lockOpts);
  const msg = new PostgresMessageBus<any>(pool);
  const user = new PostgresUserStore(pool);
  const installation = new PostgresInstallationStore(pool);
  const services: Services = {
    kvService: () => kv,
    lockService: () => lock,
    messageService: () => msg,
    userService: () => user,
    installationService: () => installation,
  };
  const queue = new PostgresQueue(pool, queueOpts);
  const PgStore = connectPgSimple(session);
  // Created lazily so processes that don't serve requests don't prune.
  const sessionStore = (opts: { pruneSessionInterval?: number | false } = {}) =>
    new PgStore({ pool, tableName: "session", ...opts });
  return { pool, services, queue, sessionStore };
}
