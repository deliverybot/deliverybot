import * as admin from "firebase-admin";
import { MessageBus, UnimplementedError } from "@deliverybot/core";

export class FirebaseMessageBus<T> implements MessageBus<T> {
  firebase: admin.app.App;
  store: admin.firestore.Firestore;
  auth: admin.auth.Auth;

  constructor(firebase: admin.app.App) {
    this.firebase = firebase;
    this.store = this.firebase.firestore();
    this.auth = this.firebase.auth();
  }

  async subscribe(
    topic: string,
    user: { id: string },
  ): Promise<string | undefined> {
    await this.store.doc(`${topic}/users/${user.id}`).set({
      modified: new Date().toISOString(),
    });
    const token = await this.auth.createCustomToken(`${user.id}`);
    return token;
  }

  async poll(topic: string, user: { id: string }): Promise<void> {
    throw new UnimplementedError();
  }

  async publish(topic: string, message: T): Promise<void> {
    await this.store.doc(topic).set(message);
  }
}
