import {
  ConfiguredRepository,
  DailyDeployments,
  Deployment,
  Installation,
  InstallationRecord,
  RepositoryActivity,
} from "../services.js";

export class InstallationStore {
  private installations: { [id: number]: InstallationRecord } = {};
  private activity: { [id: number]: RepositoryActivity } = {};
  // Repositories with a deploy config, with their installation id.
  private configured: {
    [id: number]: ConfiguredRepository & { installationId: number };
  } = {};
  private deployments: { [id: number]: Deployment } = {};

  async upsert(installation: Installation): Promise<void> {
    const now = new Date().toISOString();
    const existing = this.installations[installation.id];
    this.installations[installation.id] = {
      ...installation,
      repositoryCount: existing ? existing.repositoryCount : null,
      configsSyncedAt: existing ? existing.configsSyncedAt : null,
      configuredCount: 0,
      lastActivityAt: null,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
  }

  async get(id: number): Promise<Installation | undefined> {
    const i = this.installations[id];
    if (!i) return undefined;
    const {
      createdAt,
      updatedAt,
      repositoryCount,
      lastActivityAt,
      configsSyncedAt,
      configuredCount,
      ...installation
    } = i;
    return installation;
  }

  async delete(id: number): Promise<void> {
    delete this.installations[id];
    for (const a of Object.values(this.activity)) {
      if (a.installationId === id) delete this.activity[a.id];
    }
    for (const r of Object.values(this.configured)) {
      if (r.installationId === id) delete this.configured[r.id];
    }
    for (const d of Object.values(this.deployments)) {
      if (d.installationId === id) delete this.deployments[d.id];
    }
  }

  async list(): Promise<InstallationRecord[]> {
    const last: { [id: number]: string } = {};
    for (const a of Object.values(this.activity)) {
      const seen = last[a.installationId];
      if (!seen || a.lastEventAt > seen) last[a.installationId] = a.lastEventAt;
    }
    return Object.values(this.installations)
      .map((i) => ({
        ...i,
        lastActivityAt: last[i.id] || null,
        configuredCount: Object.values(this.configured).filter(
          (r) => r.installationId === i.id,
        ).length,
      }))
      .sort(
        (a, b) =>
          (b.lastActivityAt || "").localeCompare(a.lastActivityAt || "") ||
          b.createdAt.localeCompare(a.createdAt),
      );
  }

  async setRepositoryCount(id: number, count: number): Promise<void> {
    const i = this.installations[id];
    if (i) i.repositoryCount = count;
  }

  async markConfigsSynced(id: number): Promise<void> {
    const i = this.installations[id];
    if (i) i.configsSyncedAt = new Date().toISOString();
  }

  async recordActivity(a: Omit<RepositoryActivity, "lastEventAt">) {
    this.activity[a.id] = { ...a, lastEventAt: new Date().toISOString() };
  }

  async listActivity(installationId: number): Promise<RepositoryActivity[]> {
    return Object.values(this.activity)
      .filter((a) => a.installationId === installationId)
      .sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt));
  }

  async forgetRepositories(ids: number[]): Promise<void> {
    for (const id of ids) {
      delete this.activity[id];
      delete this.configured[id];
    }
    for (const d of Object.values(this.deployments)) {
      if (ids.includes(d.repositoryId)) delete this.deployments[d.id];
    }
  }

  async setConfigured(
    repo: ConfiguredRepository,
    installationId: number,
    configured: boolean,
  ) {
    if (configured) this.configured[repo.id] = { ...repo, installationId };
    else delete this.configured[repo.id];
  }

  async listConfigured(installationId: number) {
    return Object.values(this.configured)
      .filter((r) => r.installationId === installationId)
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map(({ installationId, ...repo }) => repo);
  }

  async recordDeployment(d: Omit<Deployment, "state"> & { state?: string }) {
    const existing = this.deployments[d.id];
    const keep = !d.state || (existing && finished.includes(existing.state));
    this.deployments[d.id] = {
      ...d,
      createdAt: new Date(d.createdAt).toISOString(),
      state: keep ? existing?.state || "pending" : d.state!,
    };
  }

  async countDeployments(since: string) {
    const ds = this.since(since);
    return {
      total: ds.length,
      succeeded: ds.filter((d) => d.state === "success").length,
      failed: ds.filter((d) => failed.includes(d.state)).length,
      repositories: new Set(ds.map((d) => d.repositoryId)).size,
      installations: new Set(ds.map((d) => d.installationId)).size,
    };
  }

  async dailyDeployments(since: string) {
    const days: { [day: string]: DailyDeployments } = {};
    for (const d of this.since(since)) {
      const day = d.createdAt.slice(0, 10);
      const row = (days[day] ||= { day, total: 0, succeeded: 0, failed: 0 });
      row.total++;
      if (d.state === "success") row.succeeded++;
      if (failed.includes(d.state)) row.failed++;
    }
    return Object.values(days).sort((a, b) => a.day.localeCompare(b.day));
  }

  async recentDeployments(limit: number) {
    return this.since("").slice(0, limit);
  }

  async topInstallations(since: string, limit: number) {
    const byInstall: {
      [id: number]: { ds: Deployment[]; repos: Set<number> };
    } = {};
    for (const d of this.since(since)) {
      const row = (byInstall[d.installationId] ||= {
        ds: [],
        repos: new Set(),
      });
      row.ds.push(d);
      row.repos.add(d.repositoryId);
    }
    return Object.entries(byInstall)
      .map(([id, { ds, repos }]) => ({
        installationId: Number(id),
        total: ds.length,
        repositories: repos.size,
        lastDeployedAt: ds[0].createdAt,
      }))
      .sort(
        (a, b) =>
          b.total - a.total || b.lastDeployedAt.localeCompare(a.lastDeployedAt),
      )
      .slice(0, limit);
  }

  /** Deployments created at or after `since`, newest first. */
  private since(since: string) {
    return Object.values(this.deployments)
      .filter((d) => d.createdAt >= since)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  }
}

const failed = ["failure", "error"];
// States a deployment doesn't leave once it reached them.
const finished = ["success", ...failed];
