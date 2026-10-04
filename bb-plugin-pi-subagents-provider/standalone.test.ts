import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";

const root = fileURLToPath(new URL(".", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

describe("standalone packaging", () => {
  it("uses only public packages and package-local imports", () => {
    const result = experimental_scanPublicSdkOnly(root, { allow: [
      /^@earendil-works\/pi-(ai|coding-agent)(?:\/providers\/all)?$/,
      /^@get-bb\/plugin-sdk\/provider-bridge\/testing$/,
      /^typebox$/,
      /^@testing-library\/react$/,
      /^vitest(?:\/config)?$/,
      /^react(?:\/jsx-runtime)?$/,
    ] });
    // The inherited scripted child loads only the extension path supplied by the bridge.
    // Keep that one computed fixture import visible; no production imports are exempt.
    expect(result.violations.filter((violation) => !(
      violation.file === "src/bridge/fake-pi-rpc.mjs" &&
      violation.reason === "dynamic-specifier" &&
      violation.specifier === "pathToFileURL(loadPath"
    ))).toEqual([]);
    expect(result.privateDependencies).toEqual([]);
  });

  it("keeps the provider SDK available when development packages are omitted", () => {
    expect(manifest.dependencies["@get-bb/plugin-sdk"]).toBe("0.5.29");
    expect(manifest.bb.server).toBe("./server.ts");
    expect(manifest.bb.host).toBe("./src/host.ts");
    expect(manifest.bb.app).toBe("./app.tsx");
    expect(manifest.name).toBe("bb-plugin-pi-subagents-provider");
    expect(manifest.scripts.test).toContain("vitest run");
    for (const value of Object.values({ ...manifest.dependencies, ...manifest.devDependencies })) {
      expect(String(value)).not.toMatch(/^(workspace:|file:|link:)/);
    }
    expect(manifest.scripts.postinstall).toBeUndefined();
  });
});
