import { expect, it } from "vitest";
import { parseViewState, viewSchema } from "./subagents-contract.js";
it("validates bounded versioned persisted view state", () => {
  const state = {
    kind: "pi-subagents-view",
    version: 1,
    updatedAt: 1,
    availability: "available",
    reason: "",
    omitted: 0,
    rows: [],
  };
  expect(parseViewState(state)).toEqual(state);
  expect(parseViewState({ ...state, version: 2 })).toBeUndefined();
  expect(parseViewState({ ...state, unknown: "x".repeat(256 * 1024) })).toBeUndefined();
  expect(viewSchema.safeParse({ ...state, omitted: -1 }).success).toBe(false);
});

it("qualifies public state with the owning plugin rather than the provider ID", async () => {
  const { VIEW_KIND, VIEW_EXTENSION_KIND } = await import("./subagents-contract.js");
  const { piProviderDeclaration } = await import("./declaration.js");
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const pluginId = manifest.name.replace(/^bb-plugin-/, "");
  expect(piProviderDeclaration().id).toBe("pi-subagents");
  expect(pluginId).toBe("pi-subagents-provider");
  expect(VIEW_EXTENSION_KIND).toBe(`${pluginId}/${VIEW_KIND}`);
  expect(piProviderDeclaration().extensionKinds![VIEW_KIND]).toBeDefined();
});
