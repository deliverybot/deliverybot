import TomSelect from "tom-select/dist/cjs/tom-select.js";
import "tom-select/dist/css/tom-select.css";
import { Controller } from "./base";

// SelectController turns a <select> into a combobox you can type in to search
// its options. The original <select> stays in the form and keeps its value.
export class SelectController extends Controller {
  select?: TomSelect;

  connect() {
    this.select = new TomSelect(this.element as HTMLSelectElement, {
      // Show every option, not just the first 50.
      maxOptions: null,
      // Options are local, so filter on every keystroke. Otherwise pressing
      // Enter right after typing picks from the unfiltered list.
      refreshThrottle: 0,
    });
  }

  disconnect() {
    if (this.select) {
      this.select.destroy();
      this.select = undefined;
    }
  }
}
