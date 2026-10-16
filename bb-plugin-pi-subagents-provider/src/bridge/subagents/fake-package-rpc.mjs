import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Owned, model-free fixture for the Pi 1.0.0 widget wire and pi-subagents 0.75.0 public RPC v1. */
export function fakePackageRpc(session, sendWidget) {
  const bus = new EventEmitter();
  const events = {
    on(name, handler) {
      bus.on(name, handler);
      return () => bus.off(name, handler);
    },
    emit(name, value) {
      bus.emit(name, value);
    },
  };
  const modelFixture = process.env.FAKE_PI_SESSION_MODEL === "1";
  const runId = modelFixture ? "11111111-1111-4111-8111-111111111111" : "owned-run-1";
  let runs = [];
  let started = false;
  const capabilities = {
    status: true,
    asyncStatusSnapshot: { kind: "pi-subagents.async-status-snapshot", version: 1 },
    statusProjection: { version: 1, untargeted: "in-memory-when-ready", targeted: "executor" },
  };
  const snapshot = () => ({
    kind: "pi-subagents.async-status-snapshot",
    version: 1,
    generatedAt: Date.now(),
    caps: {
      maxRuns: 20,
      maxChildrenPerNode: 8,
      maxDepth: 3,
      maxStringLength: 160,
      maxSerializedBytes: 32768,
    },
    omitted: { runs: 0, children: 0, byteLimitExceeded: false },
    runs,
  });
  bus.on("subagents:rpc:v1:request", (request) => {
    if (!["ping", "status"].includes(request.method))
      throw new Error("Fixture forbids non-read RPC");
    const data =
      request.method === "ping"
        ? { version: 1, methods: ["ping", "status"], capabilities, session: session() }
        : { asyncSnapshot: snapshot() };
    if (process.env.FAKE_PI_SUBAGENT_FOREIGN === "1" && request.method === "ping")
      data.session.sessionFile = "/foreign/session.jsonl";
    if (process.env.FAKE_PI_SUBAGENT_BAD_VERSION === "1") data.version = 2;
    events.emit("subagents:rpc:v1:reply:" + request.requestId, {
      version: 1,
      requestId: request.requestId,
      method: request.method,
      success: true,
      data,
    });
  });
  return {
    events,
    inspect(message) {
      const [, requestId, asyncId, childId] = message.split(/\s+/);
      const run = runs.find((r) => r.id === asyncId);
      const reply = {
        kind: "pi-subagents.inspect-reply",
        version: 1,
        requestId,
        asyncId,
        ...(childId && childId !== "--lines" ? { childId } : {}),
        ...(process.env.FAKE_PI_INSPECTION_MISSING === "1"
          ? { error: { code: "not_found", message: "Owned result artifact is missing" } }
          : {
              status: run?.state,
              task: "Review owned fixture files",
              messages: [{ role: "assistant", kind: "text", text: "Read the owned fixture" }],
              ...(run?.state === "complete" ? { finalOutput: "Owned final answer" } : {}),
              truncated: { task: false, messages: 0, finalOutput: false },
            }),
      };
      sendWidget({
        type: "extension_ui_request",
        method: "setWidget",
        widgetKey: "subagent-inspect",
        widgetLines: ["PI_SUBAGENT_INSPECT_JSON:" + JSON.stringify(reply)],
      });
      sendWidget({
        type: "extension_ui_request",
        method: "setWidget",
        widgetKey: "subagent-inspect",
      });
    },
    start() {
      if (started) return;
      started = true;
      const start = Date.now();
      runs = [
        {
          id: runId,
          kind: "subagent",
          label: "owned fake reviewer",
          state: "running",
          startedAt: start,
          updatedAt: start,
          activity: { currentTool: "read" },
        },
      ];
      const root =
        session().sessionFile.replace(/\.jsonl$/, "") + "/22222222-2222-4222-8222-222222222222";
      if (modelFixture) mkdirSync(root, { recursive: true, mode: 0o700 });
      events.emit(
        "subagent:async-started",
        modelFixture
          ? {
              id: runId,
              sessionId: session().sessionFile,
              mode: "single",
              sessionRoot: root,
              nestedRoute: {
                rootRunId: "22222222-2222-4222-8222-222222222222",
                eventSink: "/owned-route/events",
                controlInbox: "/owned-route/controls",
                capabilityToken: "33333333-3333-4333-8333-333333333333",
              },
            }
          : { asyncId: runId },
      );
      sendWidget({
        type: "extension_ui_request",
        method: "setWidget",
        widgetKey: "subagent-async",
        widgetLines: ["PI_SUBAGENT_ASYNC_JSON:" + JSON.stringify(snapshot())],
      });
      if (process.env.FAKE_PI_SUBAGENT_HOLD !== "1") {
        setTimeout(
          () => {
            runs = [{ ...runs[0], state: "complete", endedAt: Date.now(), updatedAt: Date.now() }];
            if (modelFixture) {
              events.emit("subagent:child-status", {});
              setTimeout(() => {
                const file = join(root, "run-0", "session.jsonl");
                mkdirSync(join(root, "run-0"), { mode: 0o700 });
                const timestamp = new Date(start).toISOString();
                const entries = [
                  {
                    type: "session",
                    version: 3,
                    id: "scripted-child",
                    timestamp,
                    cwd: root,
                    parentSession: session().sessionFile,
                  },
                  {
                    type: "message",
                    id: "assistant",
                    parentId: null,
                    timestamp,
                    message: {
                      role: "assistant",
                      content: [{ type: "text", text: "Owned fixture output" }],
                      api: "fixture-api",
                      provider: "scripted-child-provider",
                      model: "scripted-child-actual",
                      stopReason: "stop",
                      timestamp: start,
                      usage: {
                        input: 0,
                        output: 1,
                        cacheRead: 0,
                        cacheWrite: 0,
                        totalTokens: 1,
                        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                      },
                    },
                  },
                ];
                writeFileSync(
                  file,
                  entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
                  { mode: 0o600 },
                );
                const now = Date.now();
                const completion = {
                  runId,
                  sessionId: session().sessionFile,
                  mode: "single",
                  success: true,
                  state: "complete",
                  timestamp: now,
                  durationMs: now - start,
                  results: [
                    {
                      index: 0,
                      context: "fresh",
                      success: true,
                      sessionFile: file,
                      sessionPath: file,
                    },
                  ],
                };
                events.emit("subagent:async-complete", completion);
                events.emit("subagent:async-complete", completion);
              }, 1600);
            } else {
              events.emit("subagent:async-complete", { asyncId: runId });
              events.emit("subagent:async-complete", { asyncId: runId });
            }
          },
          process.env.FAKE_PI_STREAM_SUBAGENT_INTERLEAVE === "1" ? 1600 : 800,
        );
      }
    },
  };
}
