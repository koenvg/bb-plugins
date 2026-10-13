import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    silent: "passed-only",
    name: "bb-plugin-pi-subagents-provider",
    // Bridge tests spawn real Node children. Bound file concurrency so child startup
    // does not consume the five-second assertion budget during parallel preflight.
    maxWorkers: 4,
    include: ["*.test.ts", "*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules/**"],
  },
});
