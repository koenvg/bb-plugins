import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import piPlugin from "./server.js";

function registeredDeclaration() {
  const host = createFakePluginHost({ pluginId: "pi-subagents-provider" });
  piPlugin(host.bb);
  const declaration = host.harness.registrations.providerRegistrations.find(
    (entry) => entry.id === "pi-subagents",
  );
  if (declaration === undefined) throw new Error("expected pi to be registered");
  return declaration;
}

describe("the pi plugin's environment passthrough", () => {
  it("declares the bridge command override variables so a host-set value reaches the bridge", () => {
    expect(registeredDeclaration().env).toEqual({
      passthrough: ["BB_PI_BRIDGE_COMMAND", "BB_PI_BRIDGE_ARGS"],
    });
  });
});

describe("the independent provider", () => {
  it("uses its own identity without changing provider settings", () => {
    const declaration = registeredDeclaration();
    expect(declaration.id).toBe("pi-subagents");
    expect(declaration.displayName).toBe("Pi with subagents");
    expect(declaration.capabilities.fork).toBe("checkpoint");
    expect(declaration.capabilities.supportsManualCompaction).toBe(true);
  });
});

function rootPaths(side: readonly (string | { readonly path: string })[] | undefined): string[] {
  return (side ?? []).map((root) => (typeof root === "string" ? root : root.path));
}

describe("the pi plugin's skill roots", () => {
  it("declares pi's documented directories and resolves the rest per host", () => {
    const declaration = registeredDeclaration();
    const roots = declaration.experimental_nativeSkillRoots;
    expect(rootPaths(roots?.user)).toEqual([".pi/agent/skills", ".agents/skills"]);
    expect(rootPaths(roots?.project)).toEqual([".pi/skills", ".agents/skills"]);
    expect(declaration.experimental_resolvesNativeRoots).toBe(true);
  });
});
