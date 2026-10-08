import { defineConfig } from "@playwright/test";

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
    baseURL: "http://127.0.0.1:38716",
    browserName: "chromium",
    viewport: { width: 1280, height: 1100 },
    timezoneId: "UTC",
    hasTouch: true,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/preview-server.mjs",
    env: { CODEX_QUOTA_PREVIEW_PORT: "38716" },
    url: "http://127.0.0.1:38716",
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    timeout: 60_000,
  },
});
