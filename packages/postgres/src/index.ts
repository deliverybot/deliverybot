import { Pool, PoolConfig } from "pg";
import { Services } from "@deliverybot/core";
import { PostgresKVStore } from "./kv";
import { PostgresLockStore, LockOptions } from "./lock";
import { PostgresMessageBus } from "./message";
import { PostgresUserStore } from "./user";
import { migrate } from "./migrate";
import { PostgresQueue, QueueOptions } from "./queue";

export { migrate, PostgresKVStore, PostgresLockStore, PostgresMessageBus };
export { PostgresUserStore, PostgresQueue };

export interface PostgresOptions extends PoolConfig {
  lock?: Partial<LockOptions>;
  queue?: Partial<QueueOptions>;
}

/**
 * Services backed by Postgres. Call `migrate(pool)` before serving traffic.
 */
export function postgresServices(opts: PostgresOptions = {}) {
  const { lock: lockOpts, queue: queueOpts, ...poolConfig } = opts;
  const pool = new Pool(poolConfig);
  const kv = new PostgresKVStore<any>(pool);
  const lock = new PostgresLockStore(pool, lockOpts);
  const msg = new PostgresMessageBus<any>(pool);
  const user = new PostgresUserStore(pool);
  const services: Services = {
    kvService: () => kv,
    lockService: () => lock,
    messageService: () => msg,
    userService: () => user,
  };
  const queue = new PostgresQueue(pool, queueOpts);
  return { pool, services, queue };
}
