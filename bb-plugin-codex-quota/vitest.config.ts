import { configDefaults } from "vitest/config";

export default {
  test: {
    env: { CODEX_HOME: "/private/tmp/codex-quota-tests-no-native-sources" },
    exclude: [...configDefaults.exclude, "scripts/browser/**/*.spec.ts"],
    maxWorkers: 1,
  },
};
