import { Controller } from "./base";
import { retryable } from "../util";

type Watcher = (
  token: string,
  repoId: string,
  cb: () => void,
) => Promise<() => void>;

export class RefreshController extends Controller {
  static watcher: Watcher | undefined;
  private close: (() => void) | undefined;

  public static registerWatcher = (w: Watcher) => {
    RefreshController.watcher = w;
  };

  async connect() {
    this.refresh();
    const owner = this.data.get("owner");
    const repo = this.data.get("repo");
    if (!owner || !repo) {
      console.warn("refresh controller invalid");
      return;
    }
    console.log("connecting", `${owner}/${repo}`);
    this.close = await this.watch(owner, repo, () => {
      console.log("connected", `${owner}/${repo}`);
      this.refresh();
    });
  }

  poller(fn: () => void) {
    const rm = setInterval(fn, 5000);
    return () => {
      clearInterval(rm);
    };
  }

  watch(owner: string, repo: string, cb: () => void) {
    return retryable(async (): Promise<() => void> => {
      const resp = await fetch(`/_/watch/${owner}/${repo}`);
      const data = await resp.json();
      if (data.token && RefreshController.watcher) {
        return RefreshController.watcher(data.token, data.id, cb);
      }
      if (data.continue) {
        return this.poller(cb);
      }
      return () => {};
    }, 2000);
  }

  disconnect() {
    if (this.close) {
      console.log("disconnected");
      this.close();
    }
  }

  update(data: any) {}

  async refresh() {
    try {
      const resp = await fetch(window.location.href, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const data = await resp.json();
      const prev = this.data.get("hash");
      if (data.hash === prev) {
        console.log("refresh: no update");
        return;
      }
      this.data.set("hash", data.hash);

      console.log("refresh: update");
      this.update(data);
    } catch (error) {
      console.error(error);
    }
  }
}
