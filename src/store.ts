export interface LockStore {
  // Runs the handler function
  lock(key: string, handler: () => {}): Promise<void>;

  lockEnv(owner: string, repo: string, env: string): Promise<void>;
  unlockEnv(owner: string, repo: string, env: string): Promise<void>;
  isLockedEnv(owner: string, repo: string, env: string): Promise<boolean>;
}

export class InMemStore implements LockStore {
  private store: { [k: string]: boolean | undefined } = {};
  private locks: { [k: string]: boolean | undefined } = {};

  async lockEnv(owner: string, repo: string, env: string) {
    this.store[`${owner}/${repo}/${env}`] = true;
  }

  async unlockEnv(owner: string, repo: string, env: string) {
    this.store[`${owner}/${repo}/${env}`] = false;
  }

  async isLockedEnv(owner: string, repo: string, env: string) {
    return !!this.store[`${owner}/${repo}/${env}`];
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
