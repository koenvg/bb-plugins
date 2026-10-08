import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";

describe("public SDK and quota-only boundary", () => {
  it("imports only public SDK surfaces and declared host/frontend dependencies", () => {
    const scan = experimental_scanPublicSdkOnly(resolve(import.meta.dirname, "../.."), {
      allow: [
        /^@earendil-works\/pi-(ai|coding-agent)(\/.*)?$/,
        /^react(\/.*)?$/,
        /^react-dom$/,
        /^react-dom\/client$/, // Isolated synthetic preview entry.
        /^recharts$/, // Declared MIT chart dependency, bundled locally for the primary view.
        /^@testing-library\/react$/,
        /^vitest$/,
        // Existing dev dependency used to exercise BB's real native tooltip.
        /^@radix-ui\/react-tooltip$/,
      ],
    });
    expect(scan.privateDependencies).toEqual([]);
    // The scanner cannot prove expression imports. These test-only expressions are confined
    // to serialized collector text, copied artifacts, and an owned sibling source FIFO probe.
    const testSeams = new Map([
      [
        "src/history/collection/collector-compatibility.test.ts",
        "/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(packagedCollectorAsset(root",
      ],
      [
        "src/history/collection/collector-entry.test.ts",
        "/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(`export default ${COLLECTOR_ENTRY}`",
      ],
      [
        "src/history/collection/history-legacy.test.ts",
        "/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(`export default ${LEGACY_ENTRY}`",
      ],
      ["scripts/check-bundled-history.mjs", "pathToFileURL(artifact"],
      ["scripts/check-bundled-identity.mjs", "pathToFileURL(artifact"],
      ["scripts/check-bundled-import.mjs", "pathToFileURL(artifact"],
      ["scripts/check-prior-schema3.mjs", "pathToFileURL(path"], // Exact hash-verified pre-integration artifact.
      ["scripts/check-storage-integration.mjs", "pathToFileURL(artifact"], // Owned copy of the actual packaged host.
      ["scripts/check-bundled-calendar.mjs", "pathToFileURL(artifact"], // Owned copies, persistent reopen and import-only packaged report.
      ["scripts/check-bundled-live-refresh.mjs", "pathToFileURL(artifact"], // Owned copied host artifact and temporary collector logs. No live source.
      ["scripts/check-bundled-money.mjs", "pathToFileURL(artifact"], // Owned copied host artifact, real SQLite and original import prices.
      [
        "src/history/import/import-source.test.ts",
        '${JSON.stringify(new URL("./import-source.ts", import.meta.url',
      ], // Owned sibling source in a hard-deadline child process.
    ]);
    const hostHarnessProbes = new Set([
      "scripts/check-bundled-oauth.mjs",
      "scripts/check-bundled-activity.mjs",
    ]);
    expect(
      scan.violations.filter((entry) => {
        // Preview tooling is never shipped as a plugin entry. Keep exceptions file-scoped.
        if (entry.reason === "outside-allowlist") {
          if (
            entry.specifier === "@playwright/test" &&
            (entry.file === "playwright.config.ts" || entry.file.startsWith("scripts/browser/"))
          )
            return false;
          if (
            entry.file === "scripts/preview-server.mjs" &&
            ["esbuild", "@tailwindcss/node", "@tailwindcss/oxide"].includes(entry.specifier)
          )
            return false;
          if (entry.file === "vitest.config.ts" && entry.specifier === "vitest/config")
            return false;
        }
        // Only these synthetic probes may use the public test harness outside *.test.ts.
        if (
          entry.reason === "outside-allowlist" &&
          entry.specifier === "@get-bb/plugin-sdk/testing/host" &&
          hostHarnessProbes.has(entry.file)
        )
          return false;
        if (
          entry.reason === "outside-allowlist" &&
          entry.specifier === "@get-bb/plugin-sdk/testing/app" &&
          entry.file === "scripts/calendar-preview.tsx"
        )
          return false; // Public SDK React fixture. Never shipped as the plugin app.
        // CI-only guard imports exact file URLs resolved through the installed Pi graph.
        if (
          entry.reason === "dynamic-specifier" &&
          entry.file === "scripts/check-installed-globs.mjs" &&
          (entry.specifier === "brace" || entry.specifier === "minimatch")
        )
          return false;
        return (
          entry.reason !== "dynamic-specifier" || testSeams.get(entry.file) !== entry.specifier
        );
      }),
    ).toEqual([]);
    expect(scan.files.length).toBeGreaterThan(10);
  });
});
