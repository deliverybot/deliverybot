import { KVStore, KVService } from "@deliverybot/core";
import { Watch } from "./types";

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

  addWatch(repoId: number, watch: Watch) {
    return this.store.put(`queue/${repoId}-${watch.sha}/jobs/${watch.id}`, {
      json: JSON.stringify(watch),
    });
  }

  delWatch(repoId: number, watch: Watch) {
    return this.store.del(`queue/${repoId}-${watch.sha}/jobs/${watch.id}`);
  }

  listWatchBySha(repoId: number, sha: string) {
    return this.store
      .list(`queue/${repoId}-${sha}/jobs`)
      .then(r => r.map(w => JSON.parse(w.json) as Watch));
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
      .then(l => l.map(r => r.env));
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
    return this.store.get(`repos/${repoId}/locks/${env}`).then(x => !!x);
  }
}
