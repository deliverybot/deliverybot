import {
  ConfiguredRepository,
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

  async upsert(installation: Installation): Promise<void> {
    const now = new Date().toISOString();
    const existing = this.installations[installation.id];
    this.installations[installation.id] = {
      ...installation,
      repositoryCount: existing ? existing.repositoryCount : null,
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
  }

  async list(): Promise<InstallationRecord[]> {
    const last: { [id: number]: string } = {};
    for (const a of Object.values(this.activity)) {
      const seen = last[a.installationId];
      if (!seen || a.lastEventAt > seen) last[a.installationId] = a.lastEventAt;
    }
    return Object.values(this.installations)
      .map((i) => ({ ...i, lastActivityAt: last[i.id] || null }))
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
}
