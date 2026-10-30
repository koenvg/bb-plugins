import { defineConfig } from "@playwright/test";
import { browserFixtureOrigin } from "../scripts/browser-fixture-runner.mjs";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  timeout: 30_000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: browserFixtureOrigin(),
    browserName: "chromium",
    viewport: { width: 1280, height: 900 },
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
