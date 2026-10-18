import { defineConfig } from "@playwright/test";
import { browserFixtureOrigin } from "../scripts/browser-fixture-runner.mjs";

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: browserFixtureOrigin(),
    browserName: "chromium",
    channel: "chromium",
    serviceWorkers: "block",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
  },
});
