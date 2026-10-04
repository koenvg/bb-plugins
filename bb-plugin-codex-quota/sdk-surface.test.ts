import { describe, expect, it } from "vitest";
import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";

describe("public SDK and quota-only boundary", () => {
  it("imports only public SDK surfaces and declared host/frontend dependencies", () => {
    const scan = experimental_scanPublicSdkOnly(import.meta.dirname, {
      allow: [
        /^@earendil-works\/pi-(ai|coding-agent)(\/.*)?$/, /^react(\/.*)?$/, /^react-dom$/,
        /^react-dom\/client$/, // Isolated synthetic preview entry.
        /^@testing-library\/react$/, /^vitest$/,
        // Existing dev dependency used to exercise BB's real native tooltip.
        /^@radix-ui\/react-tooltip$/,
      ],
    });
    expect(scan.privateDependencies).toEqual([]);
    // The scanner cannot prove expression imports. These test-only expressions are confined
    // to our serialized collector text and the copied host artifact in a fresh temporary directory.
    const testSeams = new Map([
      ["collector-compatibility.test.ts", "/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(packagedCollectorAsset(root"],
      ["collector-entry.test.ts", "/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(`export default ${COLLECTOR_ENTRY}`"],
      ["scripts/check-bundled-history.mjs", "pathToFileURL(artifact"],
    ]);
    expect(scan.violations.filter((entry) => entry.reason !== "dynamic-specifier" || testSeams.get(entry.file) !== entry.specifier)).toEqual([]);
    expect(scan.files.length).toBeGreaterThan(10);
  });
});
