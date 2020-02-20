import { partials } from "../partials";
import { RefreshController } from "./refresh";

export class CommitsController extends RefreshController {
  static targets = ["details", "new"];

  async update(data: any) {
    const commits: any = {};
    data.commits.forEach((commit: any) => {
      commits[commit.oid] = commit;
    });

    const update = (name: string, partial: string) => {
      this.targets.findAll(name).forEach(el => {
        const oid = el.id.replace(name + "-", "");
        const commit = commits[oid];
        if (!commit) {
          const newEl = this.targets.find("new");
          if (newEl) newEl.classList.remove("d-none");
          return;
        }
        if (el.getAttribute("data-hash") !== commit.hash) {
          el.setAttribute("data-hash", commit.hash);
          el.innerHTML = partials[partial]!(commit);
        }
      });
    };

    const updateSingle = (name: string, partial: string) => {
      const el = this.targets.find(name);
      if (!el) {
        return;
      }
      if (el.getAttribute("data-hash") !== data.hash) {
        el.setAttribute("data-hash", data.hash);
        el.innerHTML = partials[partial]!(data);
      }
    };

    update("details", "commit_details");
    update("envstatus", "deploy_env_status");
    update("checkstatus", "commit_status");
    updateSingle("lock", "lock_modal");
    updateSingle("lockstates", "lock_states");
  }
}
