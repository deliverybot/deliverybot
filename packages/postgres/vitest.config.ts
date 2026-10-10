import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    // The suites share one database, so run them one at a time.
    fileParallelism: false,
    snapshotFormat: { escapeString: true, printBasicPrototype: true },
  },
});
