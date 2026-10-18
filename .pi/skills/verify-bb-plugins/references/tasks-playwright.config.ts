import base from "../../../../bb-plugin-tasks-plus/playwright.config";
import { fileURLToPath } from "node:url";

// Keep the package's test assertions, strict listener, and browser settings.
// Relocating the config requires explicit paths; screenshots use Playwright's output directory.
const packageUrl = new URL("../../../../bb-plugin-tasks-plus/", import.meta.url);
export default {
  ...base,
  testDir: fileURLToPath(new URL("tests/browser/", packageUrl)),
  use: { ...base.use, screenshot: "on" },
};
