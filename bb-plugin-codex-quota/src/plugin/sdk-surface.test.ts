import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  experimental_scanPublicSdkOnly,
  type PublicSdkOnlyScanOptions,
} from "@get-bb/plugin-sdk/testing";

function scanPluginSources(packageRoot: string, options?: PublicSdkOnlyScanOptions) {
  const scanRoot = mkdtempSync(join(tmpdir(), "quota-sdk-scan-"));
  // SDK 0.6.15 has no path exclusions. Keep the package layout and manifest in a
  // temporary copy, leaving Playwright evidence untouched at its configured paths.
  const excludedRoots = new Set(["node_modules", "dist", "playwright-report", "test-results"]);
  try {
    cpSync(packageRoot, scanRoot, {
      recursive: true,
      filter: (path) => !excludedRoots.has(relative(packageRoot, path).split(sep)[0]),
    });
    return experimental_scanPublicSdkOnly(scanRoot, options);
  } finally {
    rmSync(scanRoot, { recursive: true, force: true });
  }
}

describe("public SDK and quota-only boundary", () => {
  it("excludes generated browser evidence without weakening source or dependency checks", () => {
    const root = mkdtempSync(join(tmpdir(), "quota-sdk-fixture-"));
    // Assemble fixture imports so the regex-based SDK scanner does not read them as test imports.
    const importKeyword = "im" + "port";
    const sourceImports = [
      ["src/private.ts", "@bb/private", "private-package"],
      ["scripts/check.mjs", "unlisted-script-package", "outside-allowlist"],
      ["config.ts", "unlisted-config-package", "outside-allowlist"],
      ["src/playwright-report/source.ts", "unlisted-source-package", "outside-allowlist"],
      ["src/test-results/source.ts", "unlisted-source-package", "outside-allowlist"],
      ["src/outside.ts", "../../outside.ts", "outside-package"],
    ] as const;
    const generatedFiles = [
      "playwright-report/trace/assets/vendor.js",
      "test-results/trace/assets/vendor.js",
    ];
    const generatedContent = `${importKeyword}(generatedAsset);\n`;
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          dependencies: { "@bb/private": "1.0.0" },
          devDependencies: { "@bb/private-dev": "1.0.0" },
        }),
      );
      for (const [file, specifier] of sourceImports) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        writeFileSync(join(root, file), `${importKeyword} ${JSON.stringify(specifier)};\n`);
      }
      for (const file of generatedFiles) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        writeFileSync(join(root, file), generatedContent);
      }

      const scan = scanPluginSources(root);
      expect(scan.files.sort()).toEqual(sourceImports.map(([file]) => file).sort());
      expect(scan.violations).toHaveLength(sourceImports.length);
      expect(scan.violations).toEqual(
        expect.arrayContaining(
          sourceImports.map(([file, specifier, reason]) => ({ file, specifier, reason })),
        ),
      );
      expect(scan.privateDependencies).toEqual(["@bb/private", "@bb/private-dev"]);
      for (const file of generatedFiles) {
        expect(readFileSync(join(root, file), "utf8")).toBe(generatedContent);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("imports only public SDK surfaces and declared host/frontend dependencies", () => {
    const scan = scanPluginSources(resolve(import.meta.dirname, "../.."), {
      allow: [
        /^@earendil-works\/pi-(ai|coding-agent)(\/.*)?$/,
        /^react(\/.*)?$/,
        /^react-dom$/,
        /^react-dom\/client$/, // Isolated synthetic preview entry.
        /^@tanstack\/charts(?:\/.*)?$/, // Declared MIT chart dependency, bundled locally for the primary view.
        /^@testing-library\/react$/,
        /^vitest$/,
        // Existing dev dependency used to exercise BB's real native tooltip.
        /^@radix-ui\/react-tooltip$/,
      ],
    });
    expect(scan.privateDependencies).toEqual([]);
    // The scanner cannot resolve owned runtime artifacts. Exceptions match complete expressions.
    const testSeams = new Map<string, readonly string[]>([
      [
        "src/history/collection/collector-compatibility.test.ts",
        [
          '/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(packagedCollectorAsset(root)).toString("base64")}`',
        ],
      ],
      [
        "src/history/collection/collector-entry.test.ts",
        [
          "/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(`export default ${COLLECTOR_ENTRY}`)}`",
        ],
      ],
      [
        "src/history/collection/history-legacy.test.ts",
        [
          "/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(`export default ${LEGACY_ENTRY}`)}`",
        ],
      ],
      [
        "scripts/check-bundled-history.mjs",
        [
          "pathToFileURL(artifact).href",
          'pathToFileURL(artifact).href + "?reload=1"',
          'pathToFileURL(artifact).href + "?legacy-reload=1"',
        ],
      ],
      [
        "scripts/check-bundled-identity.mjs",
        ["pathToFileURL(artifact).href", 'pathToFileURL(artifact).href + "?reload=1"'],
      ],
      [
        "scripts/check-bundled-import.mjs",
        [
          "pathToFileURL(artifact).href",
          'pathToFileURL(artifact).href + "?reload=1"',
          'pathToFileURL(artifact).href + "?reload=" + pass',
        ],
      ],
      ["scripts/check-prior-schema3.mjs", ["pathToFileURL(path).href"]],
      ["scripts/check-storage-integration.mjs", ["pathToFileURL(artifact).href"]],
      [
        "scripts/check-bundled-calendar.mjs",
        ["pathToFileURL(artifact).href", 'pathToFileURL(artifact).href + "?reload=1"'],
      ],
      [
        "scripts/check-bundled-live-refresh.mjs",
        ["pathToFileURL(artifact).href", 'pathToFileURL(artifact).href + "?reload=1"'],
      ],
      [
        "scripts/check-bundled-money.mjs",
        ["pathToFileURL(artifact).href", 'pathToFileURL(artifact).href + "?reopen=1"'],
      ],
      ["scripts/check-bundled-speed.mjs", ["pathToFileURL(artifact).href"]],
      ["scripts/preview-server.mjs", ["pathToFileURL(fixtureArtifact).href"]],
    ]);
    const probeRoot = mkdtempSync(join(tmpdir(), "quota-sdk-expressions-"));
    const knownExpression = "pathToFileURL(artifact).href";
    const foreignExpression = "pathToFileURL(foreignArtifact).href";
    const changedExpression = 'pathToFileURL(artifact).href + "?unexpected"';
    try {
      writeFileSync(join(probeRoot, "package.json"), "{}");
      mkdirSync(join(probeRoot, "scripts"));
      const importKeyword = "im" + "port";
      writeFileSync(
        join(probeRoot, "scripts/check-bundled-history.mjs"),
        [knownExpression, foreignExpression, changedExpression]
          .map((expression) => `${importKeyword}(${expression});`)
          .join("\n"),
      );
      writeFileSync(
        join(probeRoot, "scripts/unexpected.mjs"),
        `${importKeyword}(${knownExpression});`,
      );
      const probe = scanPluginSources(probeRoot);
      expect(probe.violations).toHaveLength(4);
      const unexpected = probe.violations.filter(
        (entry) =>
          entry.reason !== "dynamic-specifier" ||
          !testSeams.get(entry.file)?.includes(entry.specifier),
      );
      expect(unexpected).toHaveLength(3);
      expect(unexpected).toEqual(
        expect.arrayContaining([
          {
            file: "scripts/check-bundled-history.mjs",
            specifier: foreignExpression,
            reason: "dynamic-specifier",
          },
          {
            file: "scripts/check-bundled-history.mjs",
            specifier: changedExpression,
            reason: "dynamic-specifier",
          },
          {
            file: "scripts/unexpected.mjs",
            specifier: knownExpression,
            reason: "dynamic-specifier",
          },
        ]),
      );
    } finally {
      rmSync(probeRoot, { recursive: true, force: true });
    }
    const hostHarnessProbes = new Set([
      "scripts/check-bundled-oauth.mjs",
      "scripts/check-bundled-activity.mjs",
    ]);
    expect(
      scan.violations.filter((entry) => {
        // Preview tooling is never shipped as a plugin entry. Keep exceptions file-scoped.
        if (
          entry.reason === "outside-package" &&
          ((entry.file === "playwright.config.ts" &&
            entry.specifier === "../scripts/browser-fixture-runner.mjs") ||
            (entry.file === "scripts/preview-server.mjs" &&
              entry.specifier === "../../scripts/browser-fixture-runner.mjs"))
        )
          return false;
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
          [
            "scripts/calendar-preview.tsx",
            "scripts/saved-preview.tsx",
            "scripts/footer-preview.tsx",
            "src/machines/app.test-support.ts",
          ].includes(entry.file)
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
          entry.reason !== "dynamic-specifier" ||
          !testSeams.get(entry.file)?.includes(entry.specifier)
        );
      }),
    ).toEqual([]);
    expect(scan.files.length).toBeGreaterThan(10);
  });
});
