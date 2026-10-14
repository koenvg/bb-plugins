import { defineConfig } from "@playwright/test";
import { browserFixtureOrigin } from "../scripts/browser-fixture-runner.mjs";

export default defineConfig({
  testDir: "./scripts/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  timeout: 60_000,
  retries: 0,
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: browserFixtureOrigin(),
    browserName: "chromium",
    viewport: { width: 1280, height: 1100 },
    timezoneId: "UTC",
    hasTouch: true,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
