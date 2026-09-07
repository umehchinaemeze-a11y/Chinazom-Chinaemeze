import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // All integration tests share one PostgreSQL database and each starts by
    // wiping it. Running files in parallel would let one file's teardown delete
    // another's fixtures mid-test, so files must run sequentially. Intra-file
    // concurrency (Promise.all) still exercises the real race conditions.
    fileParallelism: false,
  },
});
