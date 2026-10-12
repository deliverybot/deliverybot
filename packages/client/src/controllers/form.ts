import { Controller } from "./base";
import { ToastController } from "./toast";

export class FormController extends Controller {
  static targets = ["form", "button", "inputs"];
  static successMessage = "Creation successful";

  connect() {
    const form = this.targets.find("form") as HTMLFormElement | undefined;
    if (!form) {
      return;
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleSubmit(form);
    });
  }

  /** Shows only the input fields of the target picked in the select. */
  selectTarget(e: Event) {
    const target = (e.target as HTMLSelectElement).value;
    this.targets.findAll("inputs").forEach((el) => {
      const fieldset = el as HTMLFieldSetElement;
      const active = fieldset.dataset.inputsFor === target;
      fieldset.hidden = !active;
      fieldset.disabled = !active;
    });
  }

  disable() {
    const btn = this.targets.find("button");
    if (btn) btn.classList.add("disabled");
  }

  closeModal() {
    const modal = this.data.get("modal");
    if (modal) {
      const el = document.getElementById(modal);
      if (el) el.removeAttribute("open");
    }
  }

  enable() {
    const btn = this.targets.find("button");
    if (btn) btn.classList.remove("disabled");
  }

  message(kind: string, msg: string | null) {
    if (!msg) {
      return;
    }
    const toast = this.application.getControllerForElementAndIdentifier(
      document.body,
      "toast",
    ) as ToastController;
    toast.open(kind, msg);
  }

  formToJSON(form: HTMLFormElement) {
    const obj: { [k: string]: string } = {};
    const data = new FormData(form);
    data.forEach((val, key) => {
      obj[key] = val.toString();
    });
    return obj;
  }

  async handleSubmit(form: HTMLFormElement) {
    this.disable();

    try {
      const resp = await fetch(form.action, {
        method: form.method,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(this.formToJSON(form)),
      });
      const body = await resp.json();
      switch (resp.status) {
        case 200:
          this.message("success", this.data.get("success"));
          break;
        case 400:
          this.message("warning", body.error);
          break;
        case 500:
          this.message("error", this.data.get("error"));
          break;
      }
    } catch (error) {
      this.message("error", this.data.get("error"));
    }
    this.enable();
    this.closeModal();
  }
}
