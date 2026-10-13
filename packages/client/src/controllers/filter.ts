import { Controller } from "./base";

// FilterController adds type-to-search to a dropdown menu. It hides the items
// that don't match what was typed in the filter input.
export class FilterController extends Controller {
  static targets = ["input", "item", "empty"];

  get input() {
    return this.targets.find("input") as HTMLInputElement | undefined;
  }

  get visibleItems() {
    return this.targets
      .findAll("item")
      .filter((item) => !item.classList.contains("d-none"));
  }

  // Focuses the input when the dropdown opens and clears it when it closes.
  // Clearing on close (not open) keeps anything typed right after opening.
  toggle() {
    const details = this.element as HTMLDetailsElement;
    const input = this.input;
    if (!input) {
      return;
    }
    if (details.open) {
      input.focus();
    } else {
      input.value = "";
      this.filter();
    }
  }

  filter() {
    const query = (this.input ? this.input.value : "").trim().toLowerCase();
    let matches = 0;
    this.targets.findAll("item").forEach((item) => {
      const text = (item.textContent || "").trim().toLowerCase();
      const match = text.indexOf(query) !== -1;
      item.classList.toggle("d-none", !match);
      if (match) matches++;
    });
    const empty = this.targets.find("empty");
    if (empty) empty.classList.toggle("d-none", matches > 0);
  }

  keydown(e: KeyboardEvent) {
    const items = this.visibleItems;
    const links = items
      .map((item) => item.querySelector("a"))
      .filter((a): a is HTMLAnchorElement => !!a);
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);

    switch (e.key) {
      case "Enter":
        // Enter in the input follows the first match; on an item the link
        // handles it.
        if (current === -1 && links[0]) {
          e.preventDefault();
          links[0].click();
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (links[current + 1]) links[current + 1].focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        if (current > 0) links[current - 1].focus();
        else if (this.input) this.input.focus();
        break;
      case "Escape": {
        e.preventDefault();
        this.element.removeAttribute("open");
        const summary = this.element.querySelector("summary");
        if (summary) summary.focus();
        break;
      }
    }
  }
}
