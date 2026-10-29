import { RepositoryVisit, User, UserRecord } from "../services.js";

export class UserStore {
  private users: { [k: string]: UserRecord } = {};
  private visits: { [userId: string]: RepositoryVisit[] } = {};

  async update(user: User): Promise<User> {
    const now = new Date().toISOString();
    const existing = this.users[user.id];
    const createdAt = existing ? existing.createdAt : now;
    this.users[user.id] = { ...user, createdAt, updatedAt: now };
    return { ...user, createdAt };
  }

  async delete(id: string): Promise<void> {
    delete this.users[id];
    delete this.visits[id];
  }

  async list(): Promise<UserRecord[]> {
    return Object.values(this.users).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  async recordVisit(
    userId: string,
    repo: Omit<RepositoryVisit, "visitedAt">,
  ): Promise<void> {
    const rest = (this.visits[userId] || []).filter((v) => v.id !== repo.id);
    const visit = { ...repo, visitedAt: new Date().toISOString() };
    this.visits[userId] = [visit, ...rest];
  }

  async recentVisits(userId: string, limit: number) {
    return (this.visits[userId] || []).slice(0, limit);
  }
}
