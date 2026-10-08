import { afterEach, expect, it, vi } from "vitest";
import { experimental_createDeltaAssembler as createAssembler } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { threadDeltaSchema } from "@get-bb/plugin-sdk/provider-bridge";
import {
  startFakePiBridge,
  FULL_PERMISSION_OPTIONS,
  type FakePiBridgeHarness,
} from "./test-support.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseViewState,
  VIEW_EXTENSION_KIND,
  VIEW_KIND,
  type ViewRow,
} from "../subagents-contract.js";
import { restoreViewHistory } from "../view-history.js";
let harness: FakePiBridgeHarness | undefined;
afterEach(async () => {
  await harness?.teardown();
});

async function start(hold = false) {
  vi.stubEnv("FAKE_PI_SUBAGENT_PROTOCOL", "1");
  vi.stubEnv("FAKE_PI_VERSION", "1.0.0");
  if (hold) vi.stubEnv("FAKE_PI_SUBAGENT_HOLD", "1");
  harness = await startFakePiBridge({
    prefix: "bb-pi-subagent-",
    initialize: true,
    processLog: true,
  });
  const response = await harness.startThread("thr_owned");
  const providerThreadId = (response.result as { providerThreadId: string }).providerThreadId;
  await harness.request(1001, "turn/start", {
    threadId: "thr_owned",
    providerThreadId,
    clientRequestId: "creq_ab23456789",
    input: [{ type: "text", text: "/observe-background", mentions: [] }],
    options: FULL_PERMISSION_OPTIONS,
  });
  await harness.waitForTurnBoundary("thr_owned");
  return { harness, providerThreadId };
}
function assembled(h: FakePiBridgeHarness) {
  const assembler = createAssembler({ providerId: "pi-subagents", progressThrottleMs: 0 });
  const events = assembler.assemble({
    threadId: "thr_owned",
    deltas: h.deltasOf("thr_owned").map((d) => threadDeltaSchema.parse(d)),
  });
  const items = events.flatMap((e) =>
    "item" in e && e.item.type === "backgroundTask" ? [e.item] : [],
  );
  return { assembler, events, items };
}
function nativeStatus(delta: Record<string, unknown>) {
  const item = (delta.snapshot ?? delta.item) as { type?: unknown; status?: unknown } | undefined;
  return item?.type === "backgroundTask" ? item.status : undefined;
}
function hasOwnedFinalCapture(delta: Record<string, unknown>, sessionId: string): boolean {
  if (delta.kind !== "extension.state" || delta.extensionKind !== VIEW_EXTENSION_KIND) return false;
  return (
    parseViewState(delta.payload)?.rows.some(
      (row) =>
        row.sessionId === sessionId &&
        row.runId === "owned-run-1" &&
        row.source === "background" &&
        row.state === "complete" &&
        row.capture?.status === "captured" &&
        row.capture.finalOutput === "Owned final answer",
    ) ?? false
  );
}
it("does not let retained history, another child or partial capture satisfy the final-result wait", () => {
  const row: ViewRow = {
    id: "old",
    sessionId: "earlier-session",
    generation: 1,
    runId: "owned-run-1",
    source: "background",
    label: "reader",
    kind: "subagent",
    state: "complete",
    incomplete: false,
    observedAt: 1,
    capture: { status: "captured", capturedAt: 1, finalOutput: "Owned final answer" },
  };
  const delta = {
    kind: "extension.state",
    extensionKind: VIEW_EXTENSION_KIND,
    payload: {
      kind: VIEW_KIND,
      version: 1,
      updatedAt: 1,
      availability: "available",
      reason: "",
      omitted: 0,
      rows: [row],
    },
  };
  expect(hasOwnedFinalCapture(delta, "current-session")).toBe(false);
  const current = {
    ...row,
    id: "current",
    sessionId: "current-session",
    capture: { status: "captured", capturedAt: 1 },
  } as ViewRow;
  delta.payload.rows = [row, current];
  expect(hasOwnedFinalCapture(delta, "current-session")).toBe(false);
  delta.payload.rows = [row, { ...current, runId: "another-run", capture: row.capture }];
  expect(hasOwnedFinalCapture(delta, "current-session")).toBe(false);
  delta.payload.rows = [row, { ...current, state: "running", capture: row.capture }];
  expect(hasOwnedFinalCapture(delta, "current-session")).toBe(false);
  delta.payload.rows = [row, { ...current, capture: row.capture }];
  expect(hasOwnedFinalCapture(delta, "current-session")).toBe(true);
  expect(
    hasOwnedFinalCapture(
      { ...delta, extensionKind: "other-plugin/pi-subagents-view" },
      "current-session",
    ),
  ).toBe(false);
});
it("assembles background activity after parent idle and settles once with the same native ID", async () => {
  const { harness: h } = await start();
  await h.waitForDelta("thr_owned", (d) => nativeStatus(d) === "pending");
  const active = assembled(h);
  expect(active.assembler.getOpenTurnId("thr_owned")).toBeUndefined();
  const opened = new Set<string>();
  for (const event of active.events) {
    if (!("item" in event) || event.item.type !== "backgroundTask") continue;
    if (event.type === "item/started") opened.add(event.item.id);
    else
      expect(
        opened.has(event.item.id),
        "BB requires item/started before native background progress",
      ).toBe(true);
  }
  expect(opened.size).toBe(1);
  expect(active.items.at(-1)).toMatchObject({
    status: "pending",
    taskStatus: "running",
    taskType: "local_subagent",
    skipTranscript: false,
  });
  expect(active.items.at(-1)!.summary).toContain("read");
  await h.waitForDelta("thr_owned", (d) => nativeStatus(d) === "completed");
  const final = assembled(h);
  expect(new Set(final.items.map((item) => item.id)).size).toBe(1);
  expect(final.items.filter((item) => item.status === "completed")).toHaveLength(1);
  expect(final.items.every((item) => item.skipTranscript === false)).toBe(true);
  expect(final.events.filter((e) => e.type === "turn/started")).toHaveLength(1);
  expect(final.events.filter((e) => e.type === "turn/completed")).toHaveLength(1);
  expect(h.readProcessLog().spawned).toHaveLength(1);
}, 15000);
it("defers a native start requested between parent text deltas without splitting the parent", async () => {
  vi.stubEnv("FAKE_PI_STREAM_SUBAGENT_INTERLEAVE", "1");
  const { harness: h } = await start();
  await h.waitForDelta("thr_owned", (d) => nativeStatus(d) === "pending");
  await h.waitForDelta("thr_owned", (d) => nativeStatus(d) === "completed");
  const { events, items } = assembled(h);
  const messages = events.filter((e) => "item" in e && e.item.type === "agentMessage");
  expect(new Set(messages.map((e) => ("item" in e ? e.item.id : ""))).size).toBe(1);
  expect(messages.filter((e) => e.type === "item/started")).toHaveLength(1);
  expect(messages.filter((e) => e.type === "item/completed")).toHaveLength(1);
  const completed = messages.find((e) => e.type === "item/completed");
  expect(completed && "item" in completed && completed.item).toMatchObject({ text: "AB" });
  const nativeStart = events.findIndex(
    (e) => e.type === "item/started" && e.item.type === "backgroundTask",
  );
  expect(nativeStart).toBeGreaterThan(events.findIndex((e) => e.type === "turn/completed"));
  expect(new Set(items.map((i) => i.id)).size).toBe(1);
  expect(items.filter((i) => i.status === "completed")).toHaveLength(1);
  expect(events.filter((e) => e.type === "turn/started")).toHaveLength(1);
}, 15000);
it.each(["release", "exit", "replacement"])(
  "clears native work as unknown on %s without a child relaunch",
  async (reason) => {
    const { harness: h, providerThreadId } = await start(true);
    await h.waitForDelta("thr_owned", (d) => nativeStatus(d) === "pending");
    if (reason === "exit") {
      process.kill(h.readProcessLog().spawned[0]!, "SIGTERM");
      await h.waitForDelta("thr_owned", (d) => nativeStatus(d) === "interrupted");
    } else if (reason === "replacement") {
      await h.startThread("thr_owned");
    } else {
      await h.request(1002, "thread/stop", {
        threadId: "thr_owned",
        providerThreadId,
        intent: "release",
        activeTurnId: null,
      });
    }
    const terminal = h.deltasOf("thr_owned").filter((d) => nativeStatus(d) === "interrupted");
    expect(terminal).toHaveLength(1);
    expect((terminal[0]!.item as { summary: string }).summary).toContain("unknown");
    expect(h.readProcessLog().spawned).toHaveLength(reason === "replacement" ? 2 : 1);
  },
  15000,
);
it.each(["FAKE_PI_SUBAGENT_FOREIGN", "FAKE_PI_SUBAGENT_BAD_VERSION"])(
  "rejects %s but leaves ordinary Pi turns intact",
  async (flag) => {
    vi.stubEnv(flag, "1");
    const { harness: h } = await start();
    await new Promise((r) => setTimeout(r, 1200));
    expect(assembled(h).items).toEqual([]);
    expect(assembled(h).events.filter((e) => e.type === "turn/completed")).toHaveLength(1);
  },
  15000,
);
it("captures final detail as persistent public extension state without another parent turn", async () => {
  const { harness: h, providerThreadId } = await start();
  // Each owned process has a new Pi session, while this thread retains older rows.
  const sessionId = JSON.parse(
    readFileSync(join(h.sessionDir, `${providerThreadId}.jsonl`), "utf8").split("\n")[0]!,
  ).id as string;
  await h.waitForDelta("thr_owned", (d) => nativeStatus(d) === "completed");
  const terminalAt = h.deltasOf("thr_owned").findIndex((d) => nativeStatus(d) === "completed");
  await h.waitForDelta("thr_owned", (d) => hasOwnedFinalCapture(d, sessionId), terminalAt + 1);
  const final = h
    .deltasOf("thr_owned")
    .filter((d) => d.kind === "extension.state")
    .at(-1)!;
  const row = parseViewState(JSON.parse(JSON.stringify(final.payload)))?.rows.find(
    (r) => r.sessionId === sessionId && r.runId === "owned-run-1" && r.source === "background",
  );
  expect(final.extensionKind).toBe(VIEW_EXTENSION_KIND);
  expect(row).toMatchObject({
    state: "complete",
    capture: { status: "captured", finalOutput: "Owned final answer" },
  });
  expect(row!.capture!.finalOutput).toBe("Owned final answer");
  expect(
    h.deltasOf("thr_owned").findIndex((d) => hasOwnedFinalCapture(d, sessionId)),
  ).toBeGreaterThan(terminalAt);
  await h.request(1002, "thread/stop", {
    threadId: "thr_owned",
    providerThreadId,
    intent: "release",
    activeTurnId: null,
  });
  const published = h.deltasOf("thr_owned").filter((d) => d.kind === "extension.state");
  const persisted = restoreViewHistory(
    [...published].reverse().map((d) => JSON.parse(JSON.stringify(d.payload))),
  );
  expect(persisted?.rows.find((r) => r.id === row!.id)?.capture?.finalOutput).toBe(
    "Owned final answer",
  );
  expect(assembled(h).events.filter((e) => e.type === "turn/started")).toHaveLength(1);
  expect(assembled(h).items.filter((i) => i.status === "completed")).toHaveLength(1);
  expect(
    assembled(h).events.some(
      (e) => e.type === "thread/extensionState/updated" && e.kind === VIEW_EXTENSION_KIND,
    ),
  ).toBe(true);
}, 15000);
it.each(["FAKE_PI_INSPECTION_MISSING", "FAKE_PI_INSPECTION_UNSUPPORTED"])(
  "keeps known completion despite %s",
  async (flag) => {
    vi.stubEnv(flag, "1");
    const { harness: h } = await start();
    await h.waitForDelta("thr_owned", (d) => nativeStatus(d) === "completed");
    await h.waitForDelta(
      "thr_owned",
      (d) =>
        d.kind === "extension.state" &&
        JSON.stringify(d.payload).includes(
          flag.endsWith("MISSING") ? "Owned result artifact is missing" : "capability",
        ),
    );
    expect(assembled(h).events.filter((e) => e.type === "turn/started")).toHaveLength(1);
    expect(assembled(h).items.at(-1)!.status).toBe("completed");
  },
  15000,
);
