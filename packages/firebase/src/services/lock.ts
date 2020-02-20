import * as admin from "firebase-admin";
import { logger, LockError, LockStore } from "@deliverybot/core";

export class FirebaseLockStore implements LockStore {
  // Retries for maximum 2m and minimum 30 seconds randomly.
  static LOCK_MAX_RETRIES = 8;
  static LOCK_MIN_RETRIES = 2;
  // Waits 15 seconds to retry lock.
  static LOCK_RETRY_DELAY = 1000 * 15;
  // Lock is leased for 3 minutes.
  static LOCK_LEASE = 1000 * 60 * 3;

  private firebase: admin.app.App;
  private store: FirebaseFirestore.Firestore;

  constructor(firebase: admin.app.App) {
    this.firebase = firebase;
    this.store = this.firebase.firestore();
  }

  private lockKey(key: string): Promise<boolean> {
    return this.store.runTransaction(async tx => {
      const doc = this.store.doc(`locks/${key}`);
      const cur = await tx.get(doc);
      const data = cur.data();
      if (!data || data.lockedAt < Date.now() - FirebaseLockStore.LOCK_LEASE) {
        tx.set(doc, { lockedAt: Date.now() });
        return true;
      }
      return false;
    });
  }

  private async unlockKey(key: string): Promise<void> {
    await this.store.doc(`locks/${key}`).delete();
  }

  private retryWithJitter() {
    return (
      Math.floor(
        Math.random() *
          (FirebaseLockStore.LOCK_MAX_RETRIES -
            FirebaseLockStore.LOCK_MIN_RETRIES +
            1),
      ) + FirebaseLockStore.LOCK_MIN_RETRIES
    );
  }

  public lock(key: string, handler: () => Promise<void>): Promise<void> {
    const retries = this.retryWithJitter();

    let tries = 0;
    return new Promise((resolve, reject) => {
      const run = async () => {
        tries++;
        const locked = await this.lockKey(key);
        if (!locked) {
          if (tries > retries) {
            reject(
              new LockError(
                `Lock retry limit reached retries=${tries} key=${key}`,
              ),
            );
            return;
          }
          logger.warn({ key, tries }, "retrying lock");
          setTimeout(run, FirebaseLockStore.LOCK_RETRY_DELAY);
          return;
        }

        logger.info({ key }, "locked key");
        try {
          await handler();
          resolve();
        } catch (err) {
          reject(err);
        }
        logger.info({ key }, "unlock key");

        this.unlockKey(key).catch(error => {
          logger.warn({ error }, "unlock failed");
        });
      };
      run();
    });
  }
}
