import { EventEmitter } from "node:events";

/** Owned, model-free fixture for the Pi 1.0.0 widget wire and pi-subagents 0.75.0 public RPC v1. */
export function fakePackageRpc(session, sendWidget) {
  const bus = new EventEmitter();
  const events = { on(name, handler) { bus.on(name, handler); return () => bus.off(name, handler); }, emit(name, value) { bus.emit(name, value); } };
  let runs = [];
  let started = false;
  const capabilities = { status: true, asyncStatusSnapshot: { kind: "pi-subagents.async-status-snapshot", version: 1 }, statusProjection: { version: 1, untargeted: "in-memory-when-ready", targeted: "executor" } };
  const snapshot = () => ({ kind: "pi-subagents.async-status-snapshot", version: 1, generatedAt: Date.now(), caps: { maxRuns: 20, maxChildrenPerNode: 8, maxDepth: 3, maxStringLength: 160, maxSerializedBytes: 32768 }, omitted: { runs: 0, children: 0, byteLimitExceeded: false }, runs });
  bus.on("subagents:rpc:v1:request", (request) => {
    if (!["ping", "status"].includes(request.method)) throw new Error("Fixture forbids non-read RPC");
    const data = request.method === "ping" ? { version: 1, methods: ["ping", "status"], capabilities, session: session() } : { asyncSnapshot: snapshot() };
    if (process.env.FAKE_PI_SUBAGENT_FOREIGN === "1" && request.method === "ping") data.session.sessionFile = "/foreign/session.jsonl";
    if (process.env.FAKE_PI_SUBAGENT_BAD_VERSION === "1") data.version = 2;
    events.emit("subagents:rpc:v1:reply:" + request.requestId, { version: 1, requestId: request.requestId, method: request.method, success: true, data });
  });
  return {
    events,
    inspect(message) {
      const [, requestId, asyncId, childId] = message.split(/\s+/);
      const run = runs.find(r => r.id === asyncId);
      const reply = { kind: "pi-subagents.inspect-reply", version: 1, requestId, asyncId, ...(childId && childId !== "--lines" ? { childId } : {}), ...(process.env.FAKE_PI_INSPECTION_MISSING === "1" ? { error: { code: "not_found", message: "Owned result artifact is missing" } } : { status: run?.state, task: "Review owned fixture files", messages: [{ role: "assistant", kind: "text", text: "Read the owned fixture" }], ...(run?.state === "complete" ? { finalOutput: "Owned final answer" } : {}), truncated: { task: false, messages: 0, finalOutput: false } }) };
      sendWidget({ type: "extension_ui_request", method: "setWidget", widgetKey: "subagent-inspect", widgetLines: ["PI_SUBAGENT_INSPECT_JSON:" + JSON.stringify(reply)] });
      sendWidget({ type: "extension_ui_request", method: "setWidget", widgetKey: "subagent-inspect" });
    },
    start() {
      if (started) return;
      started = true;
      const start = Date.now();
      runs = [{ id: "owned-run-1", kind: "subagent", label: "owned fake reviewer", state: "running", startedAt: start, updatedAt: start, activity: { currentTool: "read" } }];
      events.emit("subagent:async-started", { asyncId: "owned-run-1" });
      sendWidget({ type: "extension_ui_request", method: "setWidget", widgetKey: "subagent-async", widgetLines: ["PI_SUBAGENT_ASYNC_JSON:" + JSON.stringify(snapshot())] });
      if (process.env.FAKE_PI_SUBAGENT_HOLD !== "1") {
        setTimeout(() => {
          runs = [{ ...runs[0], state: "complete", endedAt: Date.now(), updatedAt: Date.now() }];
          events.emit("subagent:async-complete", { asyncId: "owned-run-1" });
          events.emit("subagent:async-complete", { asyncId: "owned-run-1" });
        }, process.env.FAKE_PI_STREAM_SUBAGENT_INTERLEAVE === "1" ? 1600 : 800);
      }
    },
  };
}
