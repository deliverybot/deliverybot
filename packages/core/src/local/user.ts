import { User, UserRecord } from "../services.js";

export class UserStore {
  private users: { [k: string]: UserRecord } = {};

  async update(user: User): Promise<User> {
    const now = new Date().toISOString();
    const existing = this.users[user.id];
    const createdAt = existing ? existing.createdAt : now;
    this.users[user.id] = { ...user, createdAt, updatedAt: now };
    return { ...user, createdAt };
  }

  async delete(id: string): Promise<void> {
    delete this.users[id];
  }

  async list(): Promise<UserRecord[]> {
    return Object.values(this.users).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
}
