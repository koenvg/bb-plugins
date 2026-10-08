import { defineConfig } from "@playwright/test";

// Synthetic local SDK fixtures, not installed BB acceptance.
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  timeout: 30_000,
  outputDir: "test-results",
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/results.json" }],
    ["html", { open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4187",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  webServer: {
    command: "npm run preview:fixture -- --port 4187 --strictPort",
    url: "http://127.0.0.1:4187",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
