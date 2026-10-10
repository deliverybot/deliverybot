import { Pool, PoolConfig } from "pg";
import { Services } from "@deliverybot/core";
import { PostgresKVStore } from "./kv";
import { PostgresLockStore, LockOptions } from "./lock";
import { PostgresMessageBus } from "./message";
import { PostgresUserStore } from "./user";
import { migrate } from "./migrate";

export { migrate, PostgresKVStore, PostgresLockStore, PostgresMessageBus };
export { PostgresUserStore };

export interface PostgresOptions extends PoolConfig {
  lock?: Partial<LockOptions>;
}

/**
 * Services backed by Postgres. Call `migrate(pool)` before serving traffic.
 */
export function postgresServices(opts: PostgresOptions = {}) {
  const { lock: lockOpts, ...poolConfig } = opts;
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
  return { pool, services };
}
