import { configDefaults } from "vitest/config";

export default {
  test: {
    env: { CODEX_HOME: "/private/tmp/codex-quota-tests-no-native-sources" },
    exclude: [...configDefaults.exclude, "scripts/browser/**/*.spec.ts"],
    // Real SQLite fixtures share the CI runner's disk. Avoid competing disk commits.
    maxWorkers: process.env.CI ? 1 : undefined,
  },
};
