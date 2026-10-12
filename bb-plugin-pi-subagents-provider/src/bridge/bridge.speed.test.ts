import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FULL_PERMISSION_OPTIONS,
  startFakePiBridge,
  type FakePiBridgeHarness,
} from "./test-support.js";

let harness: FakePiBridgeHarness;
let stateFile: string;
let commandLog: string;
let id = 700;
const threadId = "thr_speed";
const options = (serviceTier = "fast") => ({
  ...FULL_PERMISSION_OPTIONS,
  model: "openai-codex/gpt-5.5",
  reasoningLevel: "high",
  serviceTier,
});
const setState = (value: object) => writeFileSync(stateFile, JSON.stringify(value));
const currentProviderId = () => {
  const identity = [...harness.messages]
    .reverse()
    .find((message) => message.method === "thread/identity");
  if (!identity?.params) throw new Error("Missing provider identity in fixture");
  return (identity.params as { providerThreadId: string }).providerThreadId;
};
const prompts = () =>
  existsSync(commandLog)
    ? readFileSync(commandLog, "utf8")
        .trim()
        .split("\n")
        .filter((line) => line === "prompt")
    : [];
const turn = (serviceTier = "fast", text = "hello", reasoningLevel = "high") =>
  harness.request(++id, "turn/start", {
    threadId,
    providerThreadId: currentProviderId(),
    clientRequestId: `creq_abcdefghi${"23456789"[id % 8]}`,
    input: [{ type: "text", text }],
    options: { ...options(serviceTier), reasoningLevel },
  });

beforeEach(async () => {
  harness = await startFakePiBridge({ prefix: "bb-pi-speed-", initialize: true, processLog: true });
  stateFile = join(harness.workspaceDir, "speed-state.json");
  commandLog = join(harness.workspaceDir, "commands.log");
  setState({ tiers: ["priority"] });
  vi.stubEnv("FAKE_PI_SPEED_STATE", stateFile);
  vi.stubEnv("FAKE_PI_COMMAND_LOG", commandLog);
});
afterEach(async () => {
  await harness.teardown();
  vi.unstubAllEnvs();
});

describe("shared speed module through the BB bridge", () => {
  it("publishes Fast-only capability narrowing, including catalog refresh failures", async () => {
    const probe = () => harness.request(++id, "model/list", { cwd: harness.workspaceDir });
    const initial = await probe();
    expect(initial.error).toBeUndefined();
    const models = (
      initial.result as { models: { id: string; supportedServiceTiers: unknown[] }[] }
    ).models;
    expect(models.find((m) => m.id === "openai-codex/gpt-5.5")?.supportedServiceTiers).toEqual([
      { id: "fast", label: "Fast", description: "Priority processing. Uses 2x usage." },
    ]);
    expect(
      models
        .filter((m) => !m.id.startsWith("openai-codex/"))
        .every((m) => m.supportedServiceTiers.length === 0),
    ).toBe(true);
    expect(JSON.stringify(initial)).not.toMatch(
      /fixture-account|signature|Authorization|private fixture/,
    );

    setState({ fail: true });
    const failed = await probe();
    expect(failed.error).toBeUndefined();
    expect(
      (failed.result as { models: { supportedServiceTiers: unknown[] }[] }).models.every(
        (m) => m.supportedServiceTiers.length === 0,
      ),
    ).toBe(true);
    expect(JSON.stringify(failed)).not.toContain("private fixture");
    setState({ tiers: [] });
    expect(JSON.stringify(await probe())).not.toContain('"id":"fast"');
  });

  it("uses saved Fast without rebuilding the session or synthetic speed prompts", async () => {
    expect((await harness.startThread(threadId, { options: options() })).error).toBeUndefined();
    expect((await turn()).error).toBeUndefined();
    let seen = await harness.waitForTurnBoundary(threadId);
    expect((await turn("default")).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId, seen);
    expect(prompts()).toHaveLength(2);
    expect(harness.messages.filter((m) => m.method === "session/replaced")).toHaveLength(0);
    expect(harness.readProcessLog().spawned).toHaveLength(1);
  });

  it.each(["ultrafast", "unrecognized"])(
    "blocks %s before prompt or steer dispatch",
    async (tier) => {
      expect(
        (await harness.startThread(threadId, { options: options(tier) })).error,
      ).toBeUndefined();
      expect((await turn(tier)).error).toBeDefined();
      const steer = await harness.request(++id, "turn/steer", {
        threadId,
        providerThreadId: currentProviderId(),
        input: [{ type: "text", text: "steer" }],
        clientRequestId: "creq_abcdefghij",
        expectedTurnId: "active-turn",
        options: options(tier),
      });
      expect(steer.error).toBeDefined();
      expect(prompts()).toHaveLength(0);
    },
  );

  it("does not trust the separate catalog when the active account has changed", async () => {
    await harness.request(++id, "model/list", { cwd: harness.workspaceDir });
    await harness.startThread(threadId, { options: options() });
    expect((await turn()).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId);
    setState({ account: "different-account", tiers: [] });
    expect((await turn()).error).toBeDefined();
    expect(prompts()).toHaveLength(1);
    expect((await turn("default")).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId, 1);
    expect(prompts()).toHaveLength(2);
  });

  it("keeps Default usable when discovery or authentication fails", async () => {
    setState({ fail: true, missingAuth: true });
    await harness.startThread(threadId, { options: options("default") });
    expect((await turn("default")).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId);
    const failure = await turn("fast");
    expect(failure.error?.message).toContain("BB speed selector");
    expect(failure.error?.message).not.toContain("/speed default");
    expect(prompts()).toHaveLength(1);
  });
  it("formats late native speed errors before translation and settlement", async () => {
    const networkCallsFile = join(harness.workspaceDir, "native-dispatch.log");
    setState({ tiers: ["priority"], nativeGuardFailure: "account-changed", networkCallsFile });
    await harness.startThread(threadId, { options: options() });
    expect((await turn()).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId);
    const failures = harness.deltasOf(threadId).filter((delta) => delta.kind === "provider.error");
    expect(failures).not.toHaveLength(0);
    const details = JSON.stringify(failures);
    expect(details).toContain("Speed: account-changed.");
    expect(details).toContain("Select Default in the BB speed selector or use /speed refresh.");
    expect(details).not.toContain("/speed default");
    const boundary = harness
      .deltasOf(threadId)
      .find((delta) => delta.kind === "turn.boundary" && delta.status === "failed");
    expect(boundary).toBeDefined();
    expect(JSON.stringify(boundary)).toContain("Speed: account-changed.");
    expect(JSON.stringify(boundary)).toContain("BB speed selector");
    expect(JSON.stringify(boundary)).not.toContain("/speed default");
    expect(existsSync(networkCallsFile)).toBe(false);
    expect(prompts()).toHaveLength(1);
  });

  it("does not rewrite unrelated native provider errors", async () => {
    const networkCallsFile = join(harness.workspaceDir, "native-dispatch.log");
    setState({ tiers: ["priority"], nativeGuardFailure: "provider-error", networkCallsFile });
    await harness.startThread(threadId, { options: options() });
    expect((await turn()).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId);
    const failures = harness.deltasOf(threadId).filter((delta) => delta.kind === "provider.error");
    expect(JSON.stringify(failures)).toContain("Unrelated provider error: Select /speed default.");
    expect(existsSync(networkCallsFile)).toBe(false);
  });

  it("permits Default but blocks Fast on non-Codex models", async () => {
    const catalog = await harness.request(++id, "model/list", { cwd: harness.workspaceDir });
    const model = (catalog.result as { models: { id: string }[] }).models.find(
      (entry) => !entry.id.startsWith("openai-codex/"),
    )!.id;
    await harness.startThread(threadId, { options: { ...options(), model } });
    const dispatch = (serviceTier: string) =>
      harness.request(++id, "turn/start", {
        threadId,
        providerThreadId: currentProviderId(),
        clientRequestId: "creq_abcdefghij",
        input: [{ type: "text", text: "hello" }],
        options: { ...options(serviceTier), model },
      });
    expect((await dispatch("fast")).error?.message).toMatch(/unsupported|openai-codex/i);
    expect(prompts()).toHaveLength(0);
    expect((await dispatch("default")).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId);
    expect(prompts()).toHaveLength(1);
  });

  it("does not settle a new active turn when delayed idle refresh finishes", async () => {
    const discoveryStartedFile = join(harness.workspaceDir, "discovery-started");
    const releaseDiscoveryFile = join(harness.workspaceDir, "discovery-release");
    setState({ tiers: ["priority"], discoveryStartedFile, releaseDiscoveryFile });
    await harness.startThread(threadId, { options: options("default") });
    const refresh = turn("default", "/speed refresh");
    await vi.waitFor(() => expect(existsSync(discoveryStartedFile)).toBe(true));
    expect((await turn("default", "/hold")).error).toBeUndefined();
    writeFileSync(releaseDiscoveryFile, "release");
    expect((await refresh).error).toBeUndefined();
    await harness.request(++id, "model/list", { cwd: harness.workspaceDir });
    expect(
      harness.messages.some(
        (message) =>
          message.method === "thread/delta" &&
          JSON.stringify(message.params).includes("turn.boundary"),
      ),
    ).toBe(false);
    const released = await harness.request(++id, "turn/steer", {
      threadId,
      providerThreadId: currentProviderId(),
      input: [{ type: "text", text: "release" }],
      clientRequestId: "creq_abcdefghij",
      expectedTurnId: "active-turn",
      options: options("default"),
    });
    expect(released.error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId);
    expect(prompts()).toHaveLength(2);
  });

  it("guards follow-ups and refresh while a turn is running", async () => {
    await harness.startThread(threadId, { options: options() });
    expect((await turn("fast", "/hold")).error).toBeUndefined();
    const followUp = turn("fast", "queued follow-up");
    await vi.waitFor(() => expect(prompts()).toHaveLength(2));
    expect((await turn("ultrafast", "blocked follow-up")).error).toBeDefined();
    expect((await turn("fast", "/speed refresh")).error).toBeUndefined();
    const steer = (text: string, tier = "fast") =>
      harness.request(++id, "turn/steer", {
        threadId,
        providerThreadId: currentProviderId(),
        input: [{ type: "text", text }],
        clientRequestId: "creq_abcdefghij",
        expectedTurnId: "active-turn",
        options: options(tier),
      });
    expect((await steer("blocked steer", "ultrafast")).error).toBeDefined();
    expect((await steer("/speed refresh")).error).toBeUndefined();
    expect(prompts()).toHaveLength(2);
    expect(
      harness.messages.some(
        (message) =>
          message.method === "thread/delta" &&
          JSON.stringify(message.params).includes("turn.boundary"),
      ),
    ).toBe(false);
    expect((await steer("release held run")).error).toBeUndefined();
    expect((await followUp).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId);
    expect(prompts()).toHaveLength(3);
  });
  it("refreshes explicitly without sending a prompt to Pi", async () => {
    await harness.startThread(threadId, { options: options("default") });
    expect((await turn("default", "/speed refresh")).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId);
    expect(prompts()).toHaveLength(0);
    setState({ fail: true });
    expect((await turn("default", "/speed refresh")).error?.message).toContain(
      "Speed discovery failed",
    );
    expect(prompts()).toHaveLength(0);
  });

  it.each([{ tiers: [] }, { fail: true }])(
    "restores Fast on resume and rejects unconfirmed saved selection %j",
    async (revoked) => {
      await harness.startThread(threadId, { options: options() });
      expect((await turn()).error).toBeUndefined();
      const firstTurnEnd = await harness.waitForTurnBoundary(threadId);
      expect(
        (
          await harness.request(++id, "thread/stop", {
            threadId,
            providerThreadId: currentProviderId(),
            intent: "release",
            activeTurnId: null,
          })
        ).error,
      ).toBeUndefined();
      const resume = () =>
        harness.request(++id, "thread/resume", {
          threadId,
          providerThreadId: currentProviderId(),
          cwd: harness.workspaceDir,
          instructionMode: "append",
          options: options(),
        });
      expect((await resume()).error).toBeUndefined();
      expect((await turn()).error).toBeUndefined();
      const resumedTurnEnd = await harness.waitForTurnBoundary(threadId, firstTurnEnd);
      await harness.request(++id, "thread/stop", {
        threadId,
        providerThreadId: currentProviderId(),
        intent: "release",
        activeTurnId: null,
      });
      setState(revoked);
      expect((await resume()).error).toBeUndefined();
      expect((await turn("fast", "reasoning-only change", "low")).error).toBeDefined();
      expect(prompts()).toHaveLength(2);
      expect((await turn("default", "explicit speed recovery", "low")).error).toBeUndefined();
      await harness.waitForTurnBoundary(threadId, resumedTurnEnd);
      expect(prompts()).toHaveLength(3);
    },
    15_000,
  );
});
