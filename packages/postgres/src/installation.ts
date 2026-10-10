import { Pool } from "pg";
import { Installation, InstallationStore } from "@deliverybot/core";

export class PostgresInstallationStore implements InstallationStore {
  constructor(private pool: Pool) {}

  async upsert(i: Installation): Promise<void> {
    await this.pool.query(
      `INSERT INTO installations
         (id, account, account_type, repository_selection, suspended)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         account = $2, account_type = $3, repository_selection = $4,
         suspended = $5, updated_at = now()`,
      [i.id, i.account, i.accountType, i.repositorySelection, i.suspended],
    );
  }

  async get(id: number): Promise<Installation | undefined> {
    const { rows } = await this.pool.query(
      "SELECT * FROM installations WHERE id = $1",
      [id],
    );
    if (!rows.length) return undefined;
    const r = rows[0];
    return {
      id: Number(r.id),
      account: r.account,
      accountType: r.account_type,
      repositorySelection: r.repository_selection,
      suspended: r.suspended,
    };
  }

  async delete(id: number): Promise<void> {
    await this.pool.query("DELETE FROM installations WHERE id = $1", [id]);
  }
}
