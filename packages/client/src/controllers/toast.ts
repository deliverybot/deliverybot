import { Controller } from "./base";

export class ToastController extends Controller {
  static targets = ["toast", "body"];

  open(kind: string, msg: string) {
    const toast = this.targets.find("toast");
    if (!toast) return;
    const body = this.targets.find("body");
    if (!body) return;

    toast.classList.remove("d-none");
    toast.classList.add(`Toast--${kind}`);
    body.innerHTML = msg;

    setTimeout(() => {
      toast.classList.remove(`Toast--${kind}`);
      this.close();
    }, 10000);
  }

  close() {
    const toast = this.targets.find("toast");
    if (!toast) return;

    toast.classList.add("d-none");
  }
}
