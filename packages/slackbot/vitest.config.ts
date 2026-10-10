import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    snapshotFormat: { escapeString: true, printBasicPrototype: true },
  },
});
