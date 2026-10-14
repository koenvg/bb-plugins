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

it("accepts optional capture enrichment and legacy version-1 captures", () => {
  const capture = {
    status: "captured",
    capturedAt: 10,
    messages: [{ role: "toolResult", kind: "toolResult", text: "failed" }],
  };
  const state = {
    kind: "pi-subagents-view",
    version: 1,
    updatedAt: 10,
    availability: "available",
    reason: "",
    omitted: 0,
    rows: [
      {
        id: "child",
        runId: "run",
        sessionId: "session",
        generation: 1,
        source: "foreground",
        label: "worker",
        kind: "subagent",
        state: "complete",
        incomplete: false,
        observedAt: 10,
        capture,
      },
    ],
  };
  expect(parseViewState(state)).toEqual(state);
  const enriched = {
    ...capture,
    resolvedModel: { provider: "child-provider", model: "child-model", capturedAt: 9 },
    messages: [{ ...capture.messages[0], name: "bash", isError: true }],
  };
  const withCapture = (value: unknown) => ({
    ...state,
    rows: [{ ...state.rows[0], capture: value }],
  });
  expect(parseViewState(withCapture(enriched))?.rows[0].capture).toEqual(enriched);
  for (const resolvedModel of [
    { provider: "p".repeat(161), model: "m", capturedAt: 9 },
    { provider: "p", model: "m".repeat(257), capturedAt: 9 },
    { provider: "", model: "m", capturedAt: 9 },
    { provider: "p", model: "m", capturedAt: -1 },
    { provider: "p", model: "m", capturedAt: "9" },
    { provider: "p", capturedAt: 9 },
  ])
    expect(parseViewState(withCapture({ ...enriched, resolvedModel }))).toBeUndefined();
  for (const metadata of [{ name: "n".repeat(161) }, { name: "" }, { isError: "true" }]) {
    expect(
      parseViewState(
        withCapture({ ...capture, messages: [{ ...capture.messages[0], ...metadata }] }),
      ),
    ).toBeUndefined();
  }
  expect(parseViewState({ ...withCapture(enriched), version: 2 })).toBeUndefined();
  expect(
    parseViewState({ ...withCapture(enriched), unknown: "x".repeat(256 * 1024) }),
  ).toBeUndefined();
});
