import { KVStore, KVService } from "@deliverybot/core";
import { Watch } from "./types.js";
import { hash } from "./util.js";

// Watches must be stored as JSON to avoid messing with type
// information.
interface WatchJSON {
  json: string;
}

export class WatchStore {
  store: KVStore<WatchJSON>;

  constructor(kv: KVService) {
    this.store = kv();
  }

  /**
   * Adds a watch and drops the one it replaces: the previous watch for the
   * same ref and target. Only the newest commit on a ref should auto-deploy,
   * so the older watch would at best be discarded later and at worst linger
   * forever if its checks never pass.
   */
  async addWatch(repoId: number, watch: Watch) {
    const latestKey = this.latestKey(repoId, watch);
    const previous = await this.store.get(latestKey);
    await this.store.put(this.watchKey(repoId, watch), {
      json: JSON.stringify(watch),
    });
    await this.store.put(latestKey, { json: JSON.stringify(watch) });
    if (previous) {
      const old = JSON.parse(previous.json) as Watch;
      if (old.id !== watch.id) {
        await this.store.del(this.watchKey(repoId, old));
      }
    }
  }

  async delWatch(repoId: number, watch: Watch) {
    await this.store.del(this.watchKey(repoId, watch));
    const latestKey = this.latestKey(repoId, watch);
    const latest = await this.store.get(latestKey);
    if (latest && (JSON.parse(latest.json) as Watch).id === watch.id) {
      await this.store.del(latestKey);
    }
  }

  listWatchBySha(repoId: number, sha: string) {
    return this.store
      .list(`queue/${repoId}-${sha}/jobs`)
      .then((r) => r.map((w) => JSON.parse(w.json) as Watch));
  }

  private watchKey(repoId: number, watch: Watch) {
    return `queue/${repoId}-${watch.sha}/jobs/${watch.id}`;
  }

  // Points at the newest watch for a ref and target. Kept under repos/ so it
  // is removed with the rest of a repository's data.
  private latestKey(repoId: number, watch: Watch) {
    return `repos/${repoId}/watches/${hash([watch.ref, watch.target])}`;
  }
}

export class EnvLockStore {
  store: KVStore<{ env: string; modified: string }>;

  constructor(kv: KVService) {
    this.store = kv();
  }

  list(repoId: number): Promise<string[]> {
    return this.store
      .list(`repos/${repoId}/locks`)
      .then((l) => l.map((r) => r.env));
  }

  lock(repoId: number, env: string): Promise<void> {
    return this.store.put(`repos/${repoId}/locks/${env}`, {
      env,
      modified: new Date().toISOString(),
    });
  }

  unlock(repoId: number, env: string): Promise<void> {
    return this.store.del(`repos/${repoId}/locks/${env}`);
  }

  isLocked(repoId: number, env: string): Promise<boolean> {
    return this.store.get(`repos/${repoId}/locks/${env}`).then((x) => !!x);
  }
}
