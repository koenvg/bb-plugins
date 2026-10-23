import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"],
    tsconfigPaths: true,
    alias: {
      "tippy.js": "tippy.js/dist/tippy.esm.js",
    },
  },
  test: {
    silent: "passed-only",
    name: "bb-plugin-tasks",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**"],
    testTimeout: 20_000,
    // Node web storage shadows jsdom storage unless disabled before worker startup.
    execArgv: ["--no-experimental-webstorage"],
    setupFiles: ["./vitest.setup.ts"],
    server: {
      deps: {
        inline: ["@tiptap/extension-bubble-menu"],
      },
    },
  },
});
