import { Controller } from "./base";
import { partials } from "../partials";

export class RecentsController extends Controller {
  static targets = ["recents"];

  connect() {
    const el = this.targets.find("recents");
    if (el) {
      el.innerHTML = partials["recent_repos"]!({
        recents: this.recentsToObjects(),
      });
    }
  }

  addRecent(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement | null;
    if (el) {
      const name = el.dataset.name;
      if (name) {
        const recents = this.getRecents();
        if (!recents.includes(name)) {
          this.setRecents(recents.concat([name]));
        }
      }
    }
  }

  recentsToObjects() {
    return this.getRecents().map(r => ({
      owner: r.split("/")[0],
      repo: r.split("/")[1],
    }));
  }

  setRecents(recents: string[]) {
    localStorage.setItem("recents", JSON.stringify(recents));
  }

  getRecents(): string[] {
    try {
      const arr = JSON.parse(localStorage.getItem("recents") || "[]");
      if (!Array.isArray(arr)) {
        return [];
      }
      return arr;
    } catch (e) {
      return [];
    }
  }
}
