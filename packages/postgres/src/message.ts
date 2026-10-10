import { Pool } from "pg";
import { MessageBus } from "@deliverybot/core";

export const CHANNEL = "deliverybot_messages";

/**
 * Publishes messages with Postgres NOTIFY. Browsers don't listen yet, so
 * `subscribe` returns no token and the dashboard falls back to polling.
 */
export class PostgresMessageBus<T> implements MessageBus<T> {
  constructor(private pool: Pool) {}

  async subscribe(
    topic: string,
    user: { id: string },
  ): Promise<string | undefined> {
    return undefined;
  }

  async poll(topic: string, user: { id: string }): Promise<void> {}

  async publish(topic: string, message: T): Promise<void> {
    await this.pool.query("SELECT pg_notify($1, $2)", [
      CHANNEL,
      JSON.stringify({ topic, message }),
    ]);
  }
}
