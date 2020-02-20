import { User } from "../services";

export class UserStore {
  private users: { [k: string]: User } = {};

  async update(user: User): Promise<User> {
    if (!user.createdAt) {
      user.createdAt = new Date().toISOString();
    }
    this.users[user.id] = user;
    return user;
  }

  async delete(id: string): Promise<void> {
    delete this.users[id];
  }
}
