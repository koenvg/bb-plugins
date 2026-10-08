import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL("../../", import.meta.url)),
  publicDir: false,
  resolve: { tsconfigPaths: true },
  plugins: [
    {
      name: "fixture-preview-html",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "index.html",
          source: readFileSync(new URL("./index.html", import.meta.url), "utf8"),
        });
        this.emitFile({
          type: "asset",
          fileName: "table.html",
          source: readFileSync(new URL("./index.html", import.meta.url), "utf8"),
        });
      },
    },
  ],
  // The SDK slot harness uses React's act(), which needs the development build.
  define: { "process.env.NODE_ENV": JSON.stringify("development") },
  build: {
    target: "esnext",
    outDir: "public/project-settings-preview",
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./preview.tsx", import.meta.url)),
      formats: ["es"],
      fileName: () => "preview.js",
      cssFileName: "preview",
    },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
