import { Pool } from "pg";
import { User, UserStore } from "@deliverybot/core";

export class PostgresUserStore implements UserStore {
  constructor(private pool: Pool) {}

  async update(user: User): Promise<User> {
    const { rows } = await this.pool.query(
      `INSERT INTO users (id, username, email) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE
         SET username = $2, email = $3, updated_at = now()
       RETURNING created_at`,
      [user.id, user.username, user.email || ""],
    );
    return { ...user, createdAt: rows[0].created_at.toISOString() };
  }

  async delete(id: string) {
    await this.pool.query("DELETE FROM users WHERE id = $1", [id]);
  }
}
