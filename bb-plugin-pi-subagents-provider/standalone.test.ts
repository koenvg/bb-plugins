import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";

const root = fileURLToPath(new URL(".", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

describe("standalone packaging", () => {
  it("uses only public packages and package-local imports", () => {
    const result = experimental_scanPublicSdkOnly(root, {
      allow: [
        /^@earendil-works\/pi-(ai|coding-agent)(?:\/providers\/all)?$/,
        // The native failure fixture uses this exported Pi 1.1.0 transport.
        /^@earendil-works\/pi-ai\/api\/openai-codex-responses$/,
        /^@get-bb\/plugin-sdk\/provider-bridge\/testing$/,
        /^@get-bb\/plugin-sdk\/testing\/app$/,
        /^react-dom\/client$/,
        /^@get-bb\/plugin-sdk-runtime\/(?:host|provider-bridge)$/,
        /^typebox$/,
        /^@testing-library\/react$/,
        /^vitest(?:\/config)?$/,
        /^react(?:\/jsx-runtime)?$/,
        /^esbuild$/,
      ],
    });
    // Only these fixtures load runtime-generated modules or use the development archive's types.
    // Production imports remain subject to the public-package allowlist.
    expect(
      result.violations.filter(
        (violation) =>
          !(
            (violation.file === "src/bridge/fake-pi-rpc.mjs" &&
              violation.reason === "dynamic-specifier" &&
              violation.specifier === "pathToFileURL(loadPath).href") ||
            (violation.file === "src/bridge/codex-speed-source.test.ts" &&
              ((violation.reason === "outside-allowlist" &&
                violation.specifier === "@koenvg/pi-openai-codex-speed") ||
                (violation.reason === "dynamic-specifier" &&
                  violation.specifier === "/* @vite-ignore */ path")))
          ),
      ),
    ).toEqual([]);
    expect(result.privateDependencies).toEqual([]);
  });

  it("keeps the provider SDK available when development packages are omitted", () => {
    expect(manifest.devDependencies["@get-bb/plugin-sdk"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.devDependencies["bb-app"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.dependencies["@get-bb/plugin-sdk"]).toBeUndefined();
    expect(manifest.dependencies["@get-bb/plugin-sdk-runtime"]).toBe(
      `npm:@get-bb/plugin-sdk@${manifest.devDependencies["@get-bb/plugin-sdk"]}`,
    );
    expect(manifest.bb.server).toBe("./server.ts");
    expect(manifest.bb.host).toBe("./src/host.ts");
    expect(manifest.bb.app).toBe("./app.tsx");
    expect(manifest.name).toBe("bb-plugin-pi-subagents-provider");
    expect(manifest.scripts.test).toContain("vitest run");
    const { "@koenvg/pi-openai-codex-speed": speedPackage, ...otherDevDependencies } =
      manifest.devDependencies;
    expect(speedPackage).toBe("file:vendor/koenvg-pi-openai-codex-speed-0.1.0.tgz");
    for (const value of Object.values({ ...manifest.dependencies, ...otherDevDependencies })) {
      expect(String(value)).not.toMatch(/^(workspace:|file:|link:)/);
    }
    expect(manifest.scripts.postinstall).toBeUndefined();
  });
});
