import * as admin from "firebase-admin";
import { KVStore } from "@deliverybot/core";

export class FirebaseKVStore<T> implements KVStore<T> {
  firebase: admin.app.App;
  store: admin.firestore.Firestore;

  constructor(firebase: admin.app.App) {
    this.firebase = firebase;
    this.store = this.firebase.firestore();
  }

  async put(key: string, val: T) {
    await this.store.doc(key).set(val);
  }

  async get(key: string): Promise<T | undefined> {
    const doc = await this.store.doc(key).get();
    return doc.data() as T;
  }

  async del(key: string) {
    await this.store.doc(key).delete();
  }

  async list<T>(prefix: string): Promise<T[]> {
    return this.store
      .collection(prefix)
      .get()
      .then(r => r.docs.map(d => d.data() as T));
  }
}
