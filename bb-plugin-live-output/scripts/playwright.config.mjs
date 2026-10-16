import { defineConfig } from "@playwright/test";
import { join } from "node:path";

export default defineConfig({
  testDir: "./browser",
  testMatch: "output.spec.ts",
  timeout: 60000,
  expect: { timeout: 5000 },
  workers: 2,
  retries: 0,
  fullyParallel: true,
  outputDir: join(process.env.LIVE_OUTPUT_EVIDENCE, "browser-results"),
  reporter: [
    ["list"],
    ["json", { outputFile: join(process.env.LIVE_OUTPUT_EVIDENCE, "browser-results.json") }],
  ],
  use: {
    baseURL: process.env.LIVE_OUTPUT_BASE_URL,
    browserName: "chromium",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    timezoneId: "UTC",
    hasTouch: true,
    headless: true,
    launchOptions: {
      executablePath:
        "/Users/koen/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
