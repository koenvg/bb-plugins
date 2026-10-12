import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
const preferenceFile = () => {
  const file = readdirSync(harness.sessionDir, { recursive: true, encoding: "utf8" }).find(
    (entry) => entry.endsWith(".bb-codex-speed.json"),
  );
  if (!file) throw new Error("Missing owned speed preference in fixture");
  return join(harness.sessionDir, file);
};
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
  it("hides native speed options, including after catalog refresh failures", async () => {
    const probe = () => harness.request(++id, "model/list", { cwd: harness.workspaceDir });
    const initial = await probe();
    expect(initial.error).toBeUndefined();
    const models = (
      initial.result as { models: { id: string; supportedServiceTiers: unknown[] }[] }
    ).models;
    expect(models.find((m) => m.id === "openai-codex/gpt-5.5")?.supportedServiceTiers).toEqual([]);
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
    expect((await turn("default", "/speed default")).error).toBeUndefined();
    expect((await turn("default")).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId, 1);
    expect(prompts()).toHaveLength(2);
  });

  it("keeps Default usable when discovery or authentication fails", async () => {
    setState({ fail: true, missingAuth: true });
    await harness.startThread(threadId, { options: options("default") });
    expect((await turn("default")).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId);
    const failure = await turn("default", "/speed fast");
    expect(failure.error?.message).toContain("/speed default");
    expect(failure.error?.message).not.toContain("BB speed selector");
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
    expect(details).toContain("Select /speed default or use /speed refresh.");
    expect(details).not.toContain("BB speed selector");
    const boundary = harness
      .deltasOf(threadId)
      .find((delta) => delta.kind === "turn.boundary" && delta.status === "failed");
    expect(boundary).toBeDefined();
    expect(JSON.stringify(boundary)).toContain("Speed: account-changed.");
    expect(JSON.stringify(boundary)).toContain("/speed default");
    expect(JSON.stringify(boundary)).not.toContain("BB speed selector");
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
    const dispatch = (serviceTier: string, text = "hello") =>
      harness.request(++id, "turn/start", {
        threadId,
        providerThreadId: currentProviderId(),
        clientRequestId: "creq_abcdefghij",
        input: [{ type: "text", text }],
        options: { ...options(serviceTier), model },
      });
    expect((await dispatch("default", "/speed fast")).error?.message).toMatch(
      /not confirmed|unavailable/i,
    );
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
    expect((await turn("default", "/speed ultrafast")).error).toBeDefined();
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
    expect((await steer("/speed ultrafast")).error).toBeDefined();
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
      expect((await turn("default", "/speed default", "low")).error).toBeUndefined();
      expect((await turn("default", "explicit speed recovery", "low")).error).toBeUndefined();
      await harness.waitForTurnBoundary(threadId, resumedTurnEnd);
      expect(prompts()).toHaveLength(3);
    },
    15_000,
  );

  it("keeps private Fast when BB sends fallback Default after a reasoning-only edit", async () => {
    await harness.startThread(threadId, { options: options("default") });
    expect((await turn("default", "/speed fast")).error).toBeUndefined();
    expect(prompts()).toHaveLength(0);
    setState({ fail: true });
    expect((await turn("default", "reasoning-only change", "low")).error).toBeDefined();
    expect(prompts()).toHaveLength(0);
    expect((await turn("default", "/speed default", "low")).error).toBeUndefined();
    expect(prompts()).toHaveLength(0);
    expect((await turn("default", "explicit recovery", "low")).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId);
    expect(prompts()).toHaveLength(1);
  });

  it("persists private Fast across release and resume without a model prompt", async () => {
    await harness.startThread(threadId, { options: options("default") });
    expect((await turn("default", "/speed fast")).error).toBeUndefined();
    expect(prompts()).toHaveLength(0);
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
    setState({ tiers: [] });
    expect(
      (
        await harness.request(++id, "thread/resume", {
          threadId,
          providerThreadId: currentProviderId(),
          cwd: harness.workspaceDir,
          instructionMode: "append",
          options: options("default"),
        })
      ).error,
    ).toBeUndefined();
    expect((await turn("default", "resumed reasoning edit", "low")).error).toBeDefined();
    expect(prompts()).toHaveLength(0);
    expect((await turn("default", "/speed default")).error).toBeUndefined();
    expect((await turn("default", "recovered resume")).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId);
    expect(prompts()).toHaveLength(1);
  }, 15_000);

  it("keeps status and invalid speed commands private", async () => {
    await harness.startThread(threadId, { options: options("default") });
    expect((await turn("default", "/speed")).error).toBeUndefined();
    expect((await turn("default", "/speed ultrafast")).error).toBeDefined();
    expect((await turn("default", "/speed invalid")).error).toBeDefined();
    expect(prompts()).toHaveLength(0);
    expect(JSON.stringify(harness.messages)).not.toContain("fixture-account");
  });

  it("keeps the running turn at Fast while Default is selected for the next turn", async () => {
    await harness.startThread(threadId, { options: options("default") });
    expect((await turn("default", "/speed fast")).error).toBeUndefined();
    expect((await turn("default", "/hold")).error).toBeUndefined();
    expect((await turn("default", "/speed default")).error).toBeUndefined();
    expect(prompts()).toHaveLength(1);
    setState({ fail: true });
    expect((await turn("default", "/speed refresh")).error).toBeDefined();
    const steer = (text: string) =>
      harness.request(++id, "turn/steer", {
        threadId,
        providerThreadId: currentProviderId(),
        input: [{ type: "text", text }],
        clientRequestId: "creq_abcdefghij",
        expectedTurnId: "active-turn",
        options: options("default"),
      });
    expect((await steer("blocked active steering")).error?.message).toContain("Speed:");
    expect(prompts()).toHaveLength(1);
    setState({ tiers: ["priority"] });
    expect((await turn("default", "/speed refresh")).error).toBeUndefined();
    expect((await steer("release held run")).error).toBeUndefined();
    const end = await harness.waitForTurnBoundary(threadId);
    setState({ fail: true });
    expect((await turn("default", "next turn uses explicit Default")).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId, end);
  }, 15_000);

  it("keeps a later Default selection when an earlier Fast probe completes", async () => {
    await harness.startThread(threadId, { options: options("default") });
    const discoveryStartedFile = join(harness.workspaceDir, "choice-discovery-started");
    const releaseDiscoveryFile = join(harness.workspaceDir, "choice-discovery-released");
    setState({ tiers: ["priority"], discoveryStartedFile, releaseDiscoveryFile });
    const pending = turn("default", "/speed fast");
    await vi.waitFor(() => expect(existsSync(discoveryStartedFile)).toBe(true));
    expect((await turn("default", "/speed default")).error).toBeUndefined();
    expect((await turn("default", "/hold")).error).toBeUndefined();
    const beforeHeldTurn = harness.deltasOf(threadId).length;
    writeFileSync(releaseDiscoveryFile, "release");
    expect((await pending).error).toBeUndefined();
    expect(readFileSync(preferenceFile(), "utf8")).toBe(
      JSON.stringify({ version: 1, speed: "default" }),
    );
    expect(
      harness
        .deltasOf(threadId)
        .slice(beforeHeldTurn)
        .some((delta) => delta.kind === "turn.boundary"),
    ).toBe(false);
    expect(
      (
        await harness.request(++id, "turn/steer", {
          threadId,
          providerThreadId: currentProviderId(),
          input: [{ type: "text", text: "release held run" }],
          clientRequestId: "creq_abcdefghij",
          expectedTurnId: "active-turn",
          options: options("default"),
        })
      ).error,
    ).toBeUndefined();
    const end = await harness.waitForTurnBoundary(threadId);
    setState({ fail: true });
    expect((await turn("default", "latest Default is retained")).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId, end);
  }, 15_000);

  it("blocks corrupt saved state until an explicit private selection repairs it", async () => {
    await harness.startThread(threadId, { options: options("default") });
    expect((await turn("default", "/speed fast")).error).toBeUndefined();
    const file = preferenceFile();
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ version: 1, speed: "fast" });
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
    writeFileSync(file, JSON.stringify({ version: 1, speed: "private-invalid-marker" }));
    expect(
      (
        await harness.request(++id, "thread/resume", {
          threadId,
          providerThreadId: currentProviderId(),
          cwd: harness.workspaceDir,
          instructionMode: "append",
          options: options("default"),
        })
      ).error,
    ).toBeUndefined();
    expect((await turn("default", "corrupt preference must not downgrade")).error).toBeDefined();
    expect(prompts()).toHaveLength(0);
    expect((await turn("default", "/speed")).error).toBeUndefined();
    expect(JSON.stringify(harness.messages)).not.toContain("private-invalid-marker");
    expect((await turn("default", "/speed default")).error).toBeUndefined();
    expect((await turn("default", "explicit recovery from corrupt state")).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId);
  }, 15_000);

  it("keeps the prior choice and removes its temporary file when saving fails", async () => {
    await harness.startThread(threadId, { options: options() });
    expect((await turn("default", "/speed default")).error).toBeUndefined();
    const file = preferenceFile();
    rmSync(file);
    mkdirSync(file);
    expect((await turn("default", "/speed fast")).error?.message).toContain("could not be saved");
    expect(prompts()).toHaveLength(0);
    expect(
      readdirSync(harness.sessionDir, { recursive: true, encoding: "utf8" }).filter(
        (entry) => entry.includes(".bb-codex-speed.json.") && entry.endsWith(".tmp"),
      ),
    ).toEqual([]);
    setState({ fail: true });
    expect((await turn("default", "failed selection leaves Default usable")).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId);
  });

  it("does not inherit private Fast into a separate session", async () => {
    await harness.startThread(threadId, { options: options("default") });
    const parentProviderId = currentProviderId();
    expect((await turn("default", "/speed fast")).error).toBeUndefined();
    setState({ fail: true });
    expect((await turn("default", "/speed refresh")).error).toBeDefined();
    const other = "thr_speed_other";
    expect(
      (await harness.startThread(other, { options: options("default") })).error,
    ).toBeUndefined();
    const otherProviderId = currentProviderId();
    expect(
      (
        await harness.request(++id, "turn/start", {
          threadId: other,
          providerThreadId: otherProviderId,
          clientRequestId: "creq_abcdefghij",
          input: [{ type: "text", text: "separate session stays Default" }],
          options: options("default"),
        })
      ).error,
    ).toBeUndefined();
    await harness.waitForTurnBoundary(other);
    expect(
      (
        await harness.request(++id, "turn/start", {
          threadId,
          providerThreadId: parentProviderId,
          clientRequestId: "creq_abcdefghij",
          input: [{ type: "text", text: "parent retains unconfirmed Fast" }],
          options: options("default"),
        })
      ).error,
    ).toBeDefined();
    expect(prompts()).toHaveLength(1);
  }, 15_000);

  it("persists native identity with a private choice before the first model prompt", async () => {
    setState({ tiers: ["priority"], realSessionManager: true, unflushedSessionManager: true });
    await harness.startThread(threadId, { options: options("default") });
    const providerId = currentProviderId();
    expect((await turn("default", "/speed default")).error).toBeUndefined();
    const nativeFile = preferenceFile().slice(0, -".bb-codex-speed.json".length);
    const { SessionManager } = await import("@earendil-works/pi-coding-agent");
    const nativeId = SessionManager.open(nativeFile).getSessionId();
    expect((await turn("default", "/speed fast")).error).toBeUndefined();
    expect(prompts()).toHaveLength(0);
    expect(SessionManager.open(nativeFile).getSessionId()).toBe(nativeId);
    expect((await turn("default", "first real native user message")).error).toBeUndefined();
    await harness.waitForTurnBoundary(threadId);
    const persisted = SessionManager.open(nativeFile);
    expect(persisted.getSessionId()).toBe(nativeId);
    expect(
      persisted
        .getEntries()
        .some(
          (entry) =>
            entry.type === "message" &&
            entry.message.role === "user" &&
            JSON.stringify(entry.message.content).includes("first real native user message"),
        ),
    ).toBe(true);
    expect(JSON.parse(readFileSync(preferenceFile(), "utf8"))).toEqual({
      version: 1,
      speed: "fast",
    });
    expect(
      (
        await harness.request(++id, "thread/stop", {
          threadId,
          providerThreadId: providerId,
          intent: "release",
          activeTurnId: null,
        })
      ).error,
    ).toBeUndefined();
    expect(
      (
        await harness.request(++id, "thread/resume", {
          threadId,
          providerThreadId: providerId,
          cwd: harness.workspaceDir,
          instructionMode: "append",
          options: options("default"),
        })
      ).error,
    ).toBeUndefined();
    expect(currentProviderId()).toBe(providerId);
    const resumed = SessionManager.open(nativeFile);
    expect(resumed.getSessionId()).toBe(nativeId);
    expect(
      resumed
        .getEntries()
        .some(
          (entry) =>
            entry.type === "message" &&
            entry.message.role === "user" &&
            JSON.stringify(entry.message.content).includes("first real native user message"),
        ),
    ).toBe(true);
    expect(prompts()).toHaveLength(1);
  }, 15_000);

  it.each(["file-first", "text-first", "image-first"])(
    "rejects attachments before private routing and expansion: %s",
    async (order) => {
      await harness.startThread(threadId, { options: options("default") });
      const attachment = {
        type: order === "image-first" ? "localImage" : "localFile",
        path: join(harness.workspaceDir, "must-not-read"),
      };
      const text = { type: "text", text: "/speed fast" };
      const input = order === "text-first" ? [text, attachment] : [attachment, text];
      for (const method of ["turn/start", "turn/steer"]) {
        const response = await harness.request(++id, method, {
          threadId,
          providerThreadId: currentProviderId(),
          clientRequestId: "creq_abcdefghij",
          input,
          options: options("default"),
          ...(method === "turn/steer" ? { expectedTurnId: "active-turn" } : {}),
        });
        expect(response.error?.message).toContain("attachments");
      }
      expect(prompts()).toHaveLength(0);
    },
  );

  it.each(["/speed default", "/speed invalid"])(
    "does not reconcile model or reasoning on a held private control: %s",
    async (command) => {
      await harness.startThread(threadId, { options: options("default") });
      expect((await turn("default", "/hold")).error).toBeUndefined();
      const before = harness.deltasOf(threadId).length;
      const messagesBefore = harness.messages.length;
      const spawnCount = harness.readProcessLog().spawned.length;
      const response = await harness.request(++id, "turn/start", {
        threadId,
        providerThreadId: currentProviderId(),
        clientRequestId: "creq_abcdefghij",
        input: [{ type: "text", text: command }],
        options: {
          ...options("default"),
          model: "fake-provider/fake-model",
          reasoningLevel: "low",
        },
      });
      if (command === "/speed default") expect(response.error).toBeUndefined();
      else expect(response.error).toBeDefined();
      expect(harness.readProcessLog().spawned.length).toBe(spawnCount);
      expect(
        harness
          .deltasOf(threadId)
          .slice(before)
          .some((delta) => delta.kind === "session.reset" || delta.kind === "turn.boundary"),
      ).toBe(false);
      expect(
        harness.messages
          .slice(messagesBefore)
          .some((message) => message.method === "session/replaced"),
      ).toBe(false);
      expect(prompts()).toHaveLength(1);
      expect(
        (
          await harness.request(++id, "turn/steer", {
            threadId,
            providerThreadId: currentProviderId(),
            clientRequestId: "creq_abcdefghij",
            expectedTurnId: "active-turn",
            input: [{ type: "text", text: "release held run" }],
            options: options("default"),
          })
        ).error,
      ).toBeUndefined();
      await harness.waitForTurnBoundary(threadId);
    },
  );
});
