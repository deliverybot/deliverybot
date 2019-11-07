export interface LockStore {
  // Runs the handler function
  lock(key: string, handler: () => {}): Promise<void>;

  lockEnv(repoId: number, env: string): Promise<void>;
  unlockEnv(repoId: number, env: string): Promise<void>;
  isLockedEnv(repoId: number, env: string): Promise<boolean>;
}

export class InMemStore implements LockStore {
  private store: { [k: string]: boolean | undefined } = {};
  private locks: { [k: string]: boolean | undefined } = {};

  async lockEnv(repoId: number, env: string) {
    this.store[`${repoId}/${env}`] = true;
  }

  async unlockEnv(repoId: number, env: string) {
    this.store[`${repoId}/${env}`] = false;
  }

  async isLockedEnv(repoId: number, env: string) {
    return !!this.store[`${repoId}/${env}`];
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
      };
      run();
    });
  }
}
