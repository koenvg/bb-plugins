import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4193",
    browserName: "chromium",
    channel: "chromium",
    serviceWorkers: "block",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
  },
  webServer: {
    command: "bun run preview:fixture --port 4193 --strictPort",
    url: "http://127.0.0.1:4193/tests/preview.html",
    reuseExistingServer: false,
  },
});
