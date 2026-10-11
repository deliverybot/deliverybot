import { execFileSync } from "child_process";

// The browser bundle imports these precompiled partials to re-render commits.
// They have to be an ES module like the rest of this package: webpack leaves a
// CommonJS `require` in an ES module untouched, and it fails in the browser.
// Vitest papers over that, so load them with plain Node instead.
describe("Precompiled partials", () => {
  it("load as an ES module", () => {
    const url = new URL("../../lib/views/partials.js", import.meta.url).href;
    const out = execFileSync(process.execPath, [
      "--input-type=module",
      "-e",
      `const { partials } = await import(${JSON.stringify(url)});
       console.log(typeof partials.commit_details);`,
    ]);
    expect(out.toString().trim()).toEqual("function");
  });
});
