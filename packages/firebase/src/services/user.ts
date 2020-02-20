import * as admin from "firebase-admin";
import { UserStore, User } from "@deliverybot/core";

export class FirebaseUsersStore implements UserStore {
  firebase: admin.app.App;
  store: admin.firestore.Firestore;
  auth: admin.auth.Auth;

  constructor(firebase: admin.app.App) {
    this.firebase = firebase;
    this.store = this.firebase.firestore();
    this.auth = this.firebase.auth();
  }

  async update(user: User): Promise<User> {
    try {
      const u = await this.auth.getUser(user.id);
      user.createdAt = u.metadata.creationTime;
    } catch (error) {
      await this.auth.createUser({ uid: user.id });
    }
    await this.auth.updateUser(user.id, {
      displayName: user.username,
      email: user.email,
    });
    return user;
  }

  async delete(id: string) {
    await this.auth.deleteUser(id);
  }
}
