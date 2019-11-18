import { Target } from "./types";
import { PayloadRepository } from "@octokit/webhooks";

export interface LockStore {
  // Runs the handler function
  lock(key: string, handler: () => {}): Promise<void>;

  lockEnv(repoId: number, env: string): Promise<void>;
  unlockEnv(repoId: number, env: string): Promise<void>;
  isLockedEnv(repoId: number, env: string): Promise<boolean>;
}

export interface Watch {
  repository: PayloadRepository;
  id: string;
  target: string;
  targetVal: Target;
  sha: string;
  ref: string;
}

export interface WatchStore {
  addWatch(repoId: number, watch: Watch): Promise<void>;
  delWatch(repoId: number, watch: Watch): Promise<void>;
  listWatchBySha(repoId: number, sha: string): Promise<Watch[]>;
}

export class InMemStore implements LockStore, WatchStore {
  private locks: { [k: string]: boolean | undefined } = {};
  private watches: { [k: string]: Watch | undefined } = {};

  clear() {
    this.locks = {};
    this.watches = {};
  }

  async addWatch(repoId: number, watch: Watch) {
    this.watches[`${repoId}/${watch.sha}/${watch.id}`] = watch;
  }

  async delWatch(repoId: number, watch: Watch) {
    delete this.watches[`${repoId}/${watch.sha}/${watch.id}`];
  }

  async listWatchBySha(repoId: number, sha: string) {
    return Object.keys(this.watches)
      .filter(k => k.startsWith(`${repoId}/${sha}`))
      .map(k => this.watches[k]!);
  }

  async lockEnv(repoId: number, env: string) {
    this.locks[`${repoId}/${env}`] = true;
  }

  async unlockEnv(repoId: number, env: string) {
    this.locks[`${repoId}/${env}`] = false;
  }

  async isLockedEnv(repoId: number, env: string) {
    return !!this.locks[`${repoId}/${env}`];
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
