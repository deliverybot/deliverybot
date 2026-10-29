import { Pool } from "pg";
import {
  RepositoryVisit,
  User,
  UserRecord,
  UserStore,
} from "@deliverybot/core";

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

  async list(): Promise<UserRecord[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM users ORDER BY updated_at DESC, id",
    );
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      email: r.email,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    }));
  }

  async recordVisit(
    userId: string,
    repo: Omit<RepositoryVisit, "visitedAt">,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO repository_visits (user_id, repository_id, full_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, repository_id) DO UPDATE
         SET full_name = $3, visited_at = now()`,
      [userId, repo.id, repo.fullName],
    );
  }

  async recentVisits(
    userId: string,
    limit: number,
  ): Promise<RepositoryVisit[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM repository_visits WHERE user_id = $1
       ORDER BY visited_at DESC, repository_id LIMIT $2`,
      [userId, limit],
    );
    return rows.map((r) => ({
      id: Number(r.repository_id),
      fullName: r.full_name,
      visitedAt: r.visited_at.toISOString(),
    }));
  }
}
