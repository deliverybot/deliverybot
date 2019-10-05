export interface KVStore<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, val: T): Promise<void>;
  del(key: string): Promise<void>;
}

export interface LockStore {
  // Runs the handler function
  lock(key: string, handler: () => {}): Promise<void>;
}

export class InMemStore<T> implements KVStore<T>, LockStore {
  private store: { [k: string]: T | undefined } = {};
  private locks: { [k: string]: boolean | undefined } = {};

  async get(key: string): Promise<T | undefined> {
    return this.store[key];
  }
  async set(key: string, val: T) {
    this.store[key] = val;
  }
  async del(key: string) {
    if (this.store[key]) delete this.store[key];
  }
  lock(key: string, handler: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        if (this.locks[key]) {
          setTimeout(run, 1);
          return;
        }

        this.locks[key] = true;
        try {
          await handler();
          resolve();
        } catch (err) {
          reject(err);
        }
        this.locks[key] = false;
      }
      run();
    })
  }
}
