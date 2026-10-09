import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BbPluginApi } from "@get-bb/plugin-sdk";

const root = new URL("./", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const approvedHash = "b7c7c7c1bcfba16904fb10b44944185e128446b90273080f9a8e6d46765cd750";

describe("Codex Inspired package", () => {
  it("keeps the installed plugin and theme identities and compatibility floors", () => {
    expect(manifest.name).toBe("bb-plugin-codex-inspired");
    expect(manifest.version).toBe("0.1.2");
    expect(manifest.engines).toEqual({ bb: ">=0.45", bbPluginSdk: ">=0.6.15 <0.7" });
    expect(manifest.bb.themes).toEqual([
      {
        id: "codex-inspired",
        name: "Codex Inspired",
        description:
          "Libron for chat and Markdown document text, Inter for the sidebar, and a neutral light and dark palette.",
        css: "./themes/codex-inspired.css",
      },
    ]);
  });

  it("resolves the approved stylesheet from the manifest's package-relative path", () => {
    const css = readFileSync(new URL(manifest.bb.themes[0].css, root));
    expect(createHash("sha256").update(css).digest("hex")).toBe(approvedHash);
  });

  it("gives enabled buttons a separated keyboard-only focus outline", () => {
    const css = readFileSync(new URL(manifest.bb.themes[0].css, root), "utf8");
    expect(css).toContain(
      ':is(button, [role="button"]):focus-visible:not(:disabled):not([aria-disabled="true"]) {',
    );
    expect(css).toContain("outline: 3px solid var(--ring);");
    expect(css).toContain("outline-offset: 3px;");
    expect(css).not.toMatch(/:focus(?!-visible)/);
    expect(css).not.toContain("!important");
  });

  it("has no app, host, settings, or runtime dependencies", () => {
    expect(manifest.bb.server).toBe("./server.ts");
    expect(manifest.bb.skills).toEqual([]);
    for (const key of ["app", "host", "settings"]) {
      expect(manifest.bb).not.toHaveProperty(key);
    }
    expect(manifest.dependencies ?? {}).toEqual({});
  });

  it("ships the theme, source backend, and built backend metadata", () => {
    expect(manifest.files).toEqual([
      "server.ts",
      "dist/server.js",
      "dist/server.js.map",
      "dist/server.meta.json",
      "themes",
      "README.md",
      "PLUGIN_OVERVIEW.md",
    ]);
  });

  it("does not access the host API on activation or reload", async () => {
    const { default: plugin } = await import("./server.js");
    const untouchedHost = new Proxy({} as BbPluginApi, {
      get(_target, key) {
        throw new Error(`Unexpected host access: ${String(key)}`);
      },
      set(_target, key) {
        throw new Error(`Unexpected host write: ${String(key)}`);
      },
    });
    await plugin(untouchedHost);
    await plugin(untouchedHost);
  });
});
