import { describe, expect, it } from "vitest";
import { piProviderDeclaration } from "./declaration.js";
import { buildPiAvailableModels } from "./model-list.js";
import { buildPiSessionParams, buildPiTurnOptions } from "./session-params.js";

const codex = {
  id: "gpt-5.5",
  name: "GPT",
  provider: "openai-codex",
  input: ["text"],
  reasoning: true,
  supportedThinkingLevels: ["low", "medium", "high"],
};
const fast = { id: "fast", label: "Fast", description: "Increased usage" };

describe("Pi with subagents speed contract", () => {
  it("declares speed only for this provider", () => {
    const declaration = piProviderDeclaration();
    expect(declaration.id).toBe("pi-subagents");
    expect(declaration.capabilities?.supportsServiceTier).toBe(true);
    expect(declaration.serviceTiers?.map((tier) => tier.id)).toEqual(["default", "fast"]);
  });

  it("keeps unverified Ultrafast unavailable even if catalog metadata supplies it", () => {
    const ultrafast = { id: "ultrafast", label: "Ultrafast" };
    expect(
      buildPiAvailableModels({
        models: [{ ...codex, supportedServiceTiers: [fast, ultrafast] }],
      }).models[0]?.supportedServiceTiers,
    ).toEqual([fast]);
    for (const provider of ["openai", "anthropic"]) {
      expect(
        buildPiAvailableModels({
          models: [{ ...codex, provider, supportedServiceTiers: [fast, ultrafast] }],
        }).models[0]?.supportedServiceTiers,
      ).toEqual([]);
    }
  });
  it("narrows a Fast-only account without offering Ultrafast", () => {
    const result = buildPiAvailableModels({
      models: [{ ...codex, supportedServiceTiers: [fast] }],
    });
    expect(result.models[0]?.supportedServiceTiers).toEqual([fast]);
    expect(result.models[0]?.supportedReasoningEfforts).toHaveLength(3);
  });

  it("explicitly hides speed for missing discovery and other routes", () => {
    for (const provider of ["openai-codex", "openai", "anthropic"]) {
      const { models } = buildPiAvailableModels({ models: [{ ...codex, provider }] });
      expect(models[0]?.supportedServiceTiers).toEqual([]);
    }
  });

  it("preserves narrowing for scoped and selected-only versions", () => {
    const dated = { ...codex, id: "gpt-5.5-20260423", supportedServiceTiers: [fast] };
    expect(
      buildPiAvailableModels({ models: [dated] }).selectedOnlyModels[0]?.supportedServiceTiers,
    ).toEqual([fast]);
    expect(
      buildPiAvailableModels({ models: [dated], scopedModelIds: [`${dated.provider}/${dated.id}`] })
        .models[0]?.supportedServiceTiers,
    ).toEqual([fast]);
  });

  it("carries the saved tier separately from reasoning and defaults old sessions", () => {
    const params = buildPiSessionParams({
      threadId: "thread",
      cwd: "/workspace",
      instructionMode: "append",
      options: { model: "openai-codex/gpt-5.5", reasoningLevel: "high", serviceTier: "fast" },
    });
    expect(params).toMatchObject({ serviceTier: "fast", thinkingLevel: "high" });
    expect(buildPiTurnOptions({ serviceTier: "default", reasoningLevel: "low" })).toMatchObject({
      serviceTier: "default",
      thinkingLevel: "low",
    });
    expect(
      buildPiSessionParams({
        threadId: "thread",
        cwd: "/workspace",
        instructionMode: "append",
        options: {},
      }).serviceTier,
    ).toBe("default");
  });
});
