import { Pool } from "pg";
import {
  ConfiguredRepository,
  Deployment,
  Installation,
  InstallationRecord,
  InstallationStore,
  RepositoryActivity,
} from "@deliverybot/core";

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
    const {
      createdAt,
      updatedAt,
      repositoryCount,
      lastActivityAt,
      configsSyncedAt,
      configuredCount,
      ...installation
    } = toInstallation(rows[0]);
    return installation;
  }

  async delete(id: number): Promise<void> {
    await this.pool.query("DELETE FROM installations WHERE id = $1", [id]);
    await this.pool.query(
      "DELETE FROM repositories WHERE installation_id = $1",
      [id],
    );
    await this.pool.query(
      "DELETE FROM configured_repositories WHERE installation_id = $1",
      [id],
    );
    await this.pool.query(
      "DELETE FROM deployments WHERE installation_id = $1",
      [id],
    );
  }

  async list(): Promise<InstallationRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT i.*, a.last_activity_at, c.configured_count
       FROM installations i
       LEFT JOIN (
         SELECT installation_id, max(last_event_at) AS last_activity_at
         FROM repositories GROUP BY installation_id
       ) a ON a.installation_id = i.id
       LEFT JOIN (
         SELECT installation_id, count(*) AS configured_count
         FROM configured_repositories GROUP BY installation_id
       ) c ON c.installation_id = i.id
       ORDER BY a.last_activity_at DESC NULLS LAST, i.created_at DESC, i.id DESC`,
    );
    return rows.map(toInstallation);
  }

  async setRepositoryCount(id: number, count: number): Promise<void> {
    await this.pool.query(
      "UPDATE installations SET repository_count = $2 WHERE id = $1",
      [id, count],
    );
  }

  async markConfigsSynced(id: number): Promise<void> {
    await this.pool.query(
      "UPDATE installations SET configs_synced_at = now() WHERE id = $1",
      [id],
    );
  }

  async recordActivity(a: Omit<RepositoryActivity, "lastEventAt">) {
    await this.pool.query(
      `INSERT INTO repositories (id, installation_id, full_name, last_event)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         installation_id = $2, full_name = $3, last_event = $4,
         last_event_at = now()`,
      [a.id, a.installationId, a.fullName, a.lastEvent],
    );
  }

  async listActivity(installationId: number): Promise<RepositoryActivity[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM repositories WHERE installation_id = $1
       ORDER BY last_event_at DESC, id DESC`,
      [installationId],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      installationId: Number(r.installation_id),
      fullName: r.full_name,
      lastEvent: r.last_event,
      lastEventAt: r.last_event_at.toISOString(),
    }));
  }

  async forgetRepositories(ids: number[]): Promise<void> {
    if (!ids.length) return;
    await this.pool.query("DELETE FROM repositories WHERE id = ANY($1)", [ids]);
    await this.pool.query(
      "DELETE FROM configured_repositories WHERE id = ANY($1)",
      [ids],
    );
    await this.pool.query(
      "DELETE FROM deployments WHERE repository_id = ANY($1)",
      [ids],
    );
  }

  async setConfigured(
    repo: ConfiguredRepository,
    installationId: number,
    configured: boolean,
  ) {
    if (configured) {
      await this.pool.query(
        `INSERT INTO configured_repositories
           (id, installation_id, node_id, full_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           installation_id = $2, node_id = $3, full_name = $4`,
        [repo.id, installationId, repo.nodeId, repo.fullName],
      );
    } else {
      await this.pool.query(
        "DELETE FROM configured_repositories WHERE id = $1",
        [repo.id],
      );
    }
  }

  async listConfigured(installationId: number) {
    const { rows } = await this.pool.query(
      `SELECT * FROM configured_repositories WHERE installation_id = $1
       ORDER BY full_name`,
      [installationId],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      nodeId: r.node_id,
      fullName: r.full_name,
    }));
  }

  async recordDeployment(d: Omit<Deployment, "state"> & { state?: string }) {
    await this.pool.query(
      `INSERT INTO deployments
         (id, installation_id, repository_id, full_name, environment, state,
          created_at)
       VALUES ($1, $2, $3, $4, $5, coalesce($6, 'pending'), $7)
       ON CONFLICT (id) DO UPDATE SET
         full_name = $4, environment = $5,
         state = CASE
           WHEN $6::text IS NULL
             OR deployments.state IN ('success', 'failure', 'error')
           THEN deployments.state
           ELSE $6
         END`,
      [
        d.id,
        d.installationId,
        d.repositoryId,
        d.fullName,
        d.environment,
        d.state ?? null,
        d.createdAt,
      ],
    );
  }

  async countDeployments(since: string) {
    const { rows } = await this.pool.query(
      `SELECT count(*) AS total,
         count(*) FILTER (WHERE state = 'success') AS succeeded,
         count(*) FILTER (WHERE state IN ('failure', 'error')) AS failed,
         count(DISTINCT repository_id) AS repositories,
         count(DISTINCT installation_id) AS installations
       FROM deployments WHERE created_at >= $1`,
      [since],
    );
    const r = rows[0];
    return {
      total: Number(r.total),
      succeeded: Number(r.succeeded),
      failed: Number(r.failed),
      repositories: Number(r.repositories),
      installations: Number(r.installations),
    };
  }

  async dailyDeployments(since: string) {
    const { rows } = await this.pool.query(
      `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
         count(*) AS total,
         count(*) FILTER (WHERE state = 'success') AS succeeded,
         count(*) FILTER (WHERE state IN ('failure', 'error')) AS failed
       FROM deployments WHERE created_at >= $1
       GROUP BY day ORDER BY day`,
      [since],
    );
    return rows.map((r) => ({
      day: r.day,
      total: Number(r.total),
      succeeded: Number(r.succeeded),
      failed: Number(r.failed),
    }));
  }

  async recentDeployments(limit: number) {
    const { rows } = await this.pool.query(
      `SELECT * FROM deployments ORDER BY created_at DESC, id DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      installationId: Number(r.installation_id),
      repositoryId: Number(r.repository_id),
      fullName: r.full_name,
      environment: r.environment,
      state: r.state,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async topInstallations(since: string, limit: number) {
    const { rows } = await this.pool.query(
      `SELECT installation_id, count(*) AS total,
         count(DISTINCT repository_id) AS repositories,
         max(created_at) AS last_deployed_at
       FROM deployments WHERE created_at >= $1
       GROUP BY installation_id
       ORDER BY total DESC, last_deployed_at DESC
       LIMIT $2`,
      [since, limit],
    );
    return rows.map((r) => ({
      installationId: Number(r.installation_id),
      total: Number(r.total),
      repositories: Number(r.repositories),
      lastDeployedAt: r.last_deployed_at.toISOString(),
    }));
  }
}

function toInstallation(r: any): InstallationRecord {
  return {
    id: Number(r.id),
    account: r.account,
    accountType: r.account_type,
    repositorySelection: r.repository_selection,
    suspended: r.suspended,
    repositoryCount: r.repository_count,
    configuredCount: Number(r.configured_count || 0),
    configsSyncedAt: r.configs_synced_at
      ? r.configs_synced_at.toISOString()
      : null,
    lastActivityAt: r.last_activity_at
      ? r.last_activity_at.toISOString()
      : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}
