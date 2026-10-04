import { afterEach, expect, it, vi } from "vitest";
import { experimental_createDeltaAssembler as createAssembler } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { threadDeltaSchema } from "@get-bb/plugin-sdk/provider-bridge";
import { startFakePiBridge, FULL_PERMISSION_OPTIONS, type FakePiBridgeHarness } from "./test-support.js";
let harness: FakePiBridgeHarness | undefined;
afterEach(async () => { await harness?.teardown(); });

async function start(hold = false) {
  vi.stubEnv("FAKE_PI_SUBAGENT_PROTOCOL", "1");
  if (hold) vi.stubEnv("FAKE_PI_SUBAGENT_HOLD", "1");
  harness = await startFakePiBridge({ prefix: "bb-pi-subagent-", initialize: true, processLog: true });
  const response = await harness.startThread("thr_owned");
  const providerThreadId = (response.result as { providerThreadId: string }).providerThreadId;
  await harness.request(1001, "turn/start", { threadId: "thr_owned", providerThreadId, clientRequestId: "creq_ab23456789", input: [{ type: "text", text: "/observe-background", mentions: [] }], options: FULL_PERMISSION_OPTIONS });
  await harness.waitForTurnBoundary("thr_owned");
  return { harness, providerThreadId };
}
function assembled(h: FakePiBridgeHarness) {
  const assembler = createAssembler({ providerId: "pi-subagents", progressThrottleMs: 0 });
  const events = assembler.assemble({ threadId: "thr_owned", deltas: h.deltasOf("thr_owned").map((d) => threadDeltaSchema.parse(d)) });
  const items = events.flatMap((e) => "item" in e && e.item.type === "backgroundTask" ? [e.item] : []);
  return { assembler, events, items };
}
it("assembles background activity after parent idle and settles once with the same native ID", async () => {
  const { harness: h } = await start();
  await h.waitForDelta("thr_owned", (d) => (d.snapshot as { status?: unknown })?.status === "pending");
  const active = assembled(h);
  expect(active.assembler.getOpenTurnId("thr_owned")).toBeUndefined();
  expect(active.items.at(-1)).toMatchObject({ status: "pending", taskStatus: "running", taskType: "local_subagent" });
  expect(active.items.at(-1)!.summary).toContain("read");
  await h.waitForDelta("thr_owned", (d) => (d.snapshot as { status?: unknown })?.status === "completed");
  const final = assembled(h);
  expect(new Set(final.items.map((item) => item.id)).size).toBe(1);
  expect(final.items.filter((item) => item.status === "completed")).toHaveLength(1);
  expect(final.events.filter((e) => e.type === "turn/started")).toHaveLength(1);
  expect(final.events.filter((e) => e.type === "turn/completed")).toHaveLength(1);
  expect(h.readProcessLog().spawned).toHaveLength(1);
}, 15000);
it.each(["release", "exit", "replacement"])("clears native work as unknown on %s without a child relaunch", async (reason) => {
  const { harness: h, providerThreadId } = await start(true);
  await h.waitForDelta("thr_owned", (d) => (d.snapshot as { status?: unknown })?.status === "pending");
  if (reason === "exit") {
    process.kill(h.readProcessLog().spawned[0]!, "SIGTERM");
    await h.waitForDelta("thr_owned", (d) => (d.snapshot as { status?: unknown })?.status === "interrupted");
  } else if (reason === "replacement") {
    await h.startThread("thr_owned");
  } else {
    await h.request(1002, "thread/stop", { threadId: "thr_owned", providerThreadId, intent: "release", activeTurnId: null });
  }
  const terminal = h.deltasOf("thr_owned").filter((d) => (d.snapshot as { status?: unknown })?.status === "interrupted");
  expect(terminal).toHaveLength(1);
  expect((terminal[0]!.snapshot as { summary: string }).summary).toContain("unknown");
  expect(h.readProcessLog().spawned).toHaveLength(reason === "replacement" ? 2 : 1);
}, 15000);
it.each(["FAKE_PI_SUBAGENT_FOREIGN", "FAKE_PI_SUBAGENT_BAD_VERSION"])("rejects %s but leaves ordinary Pi turns intact", async (flag) => {
  vi.stubEnv(flag, "1");
  const { harness: h } = await start();
  await new Promise((r) => setTimeout(r, 1200));
  expect(assembled(h).items).toEqual([]);
  expect(assembled(h).events.filter((e) => e.type === "turn/completed")).toHaveLength(1);
}, 15000);
it("captures final detail as persistent public extension state without another parent turn", async () => {
  const { harness: h } = await start();
  await h.waitForDelta("thr_owned", d => d.kind === "extension.state" && JSON.stringify(d.payload).includes("Owned final answer"));
  await h.waitForDelta("thr_owned", d => (d.snapshot as {status?:unknown})?.status === "completed");
  const final = h.deltasOf("thr_owned").filter(d => d.kind === "extension.state").at(-1)!;
  expect(final.extensionKind).toBe("pi-subagents/pi-subagents-view");
  expect(assembled(h).events.filter(e => e.type === "turn/started")).toHaveLength(1);
  expect(assembled(h).items.filter(i => i.status === "completed")).toHaveLength(1);
  expect(JSON.parse(JSON.stringify(final.payload)).rows[0].capture.finalOutput).toBe("Owned final answer");
  expect(assembled(h).events.some(e=>e.type==="thread/extensionState/updated"&&e.kind==="pi-subagents/pi-subagents-view")).toBe(true);
},15000);
it.each(["FAKE_PI_INSPECTION_MISSING","FAKE_PI_INSPECTION_UNSUPPORTED"])("keeps known completion despite %s",async flag=>{
  vi.stubEnv(flag,"1");const {harness:h}=await start();
  await h.waitForDelta("thr_owned",d=>(d.snapshot as {status?:unknown})?.status==="completed");
  await h.waitForDelta("thr_owned",d=>d.kind==="extension.state"&&JSON.stringify(d.payload).includes(flag.endsWith("MISSING")?"Owned result artifact is missing":"capability"));
  expect(assembled(h).events.filter(e=>e.type==="turn/started")).toHaveLength(1);
  expect(assembled(h).items.at(-1)!.status).toBe("completed");
},15000);
