import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    silent: "passed-only",
    name: "bb-plugin-pi-subagents-provider",
    // Bridge tests spawn real Node children. Reserve CPU capacity for them on
    // small CI runners without changing assertion deadlines or exceeding four workers.
    maxWorkers: Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2))),
    include: ["*.test.ts", "*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules/**"],
  },
});
