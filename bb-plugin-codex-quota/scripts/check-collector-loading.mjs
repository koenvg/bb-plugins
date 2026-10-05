import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

// This process receives only the isolated fixture. Pi extensions run in Pi's Node runtime.
const [agentDir, cwd, dataDir] = process.argv.slice(2);
assert.ok(agentDir && cwd);
process.env.PI_CODING_AGENT_DIR = agentDir;
globalThis.fetch = async () => {
  throw Error("Network is forbidden in collector loading");
};
const { discoverAndLoadExtensions } = await import("@earendil-works/pi-coding-agent");
const loaded = await discoverAndLoadExtensions([], cwd, agentDir);
assert.deepEqual(loaded.errors, []);
assert.ok(
  loaded.extensions.some(
    (item) => item.path === join(agentDir, "extensions/bb-codex-usage/index.js"),
  ),
  "Pi must load the packaged asset",
);
assert.ok(
  loaded.extensions.some((item) => item.path === join(agentDir, "extensions/unrelated.js")),
  "Pi must load the unrelated extension",
);
const collector = loaded.extensions.find(
  (item) => item.path === join(agentDir, "extensions/bb-codex-usage/index.js"),
);
assert.ok(
  collector.handlers.get("message_end")?.length,
  "Must load the real capture handler, not a placeholder",
);
const entries = new Map();
let leaf = null;
const context = {
  cwd,
  sessionManager: {
    getSessionId: () => "synthetic-session",
    getSessionFile: () => join(cwd, "synthetic-provider.jsonl"),
    getLeafId: () => leaf,
    getEntry: (id) => entries.get(id),
  },
};
const event = {
  message: {
    role: "assistant",
    provider: "openai-codex",
    model: "synthetic",
    timestamp: Date.now(),
    usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { total: 0 } },
    content: "private-content-sentinel",
    toolArgs: "private-credentials-sentinel",
  },
};
const control = join(dataDir, "history/collector-control-v1.json");
const logs = join(dataDir, `history/events-v1-${new Date().toISOString().slice(0, 10)}.jsonl`);
// Verify the exact asset fails closed without control, even when installed explicitly.
const { unlinkSync } = await import("node:fs");
unlinkSync(control);
for (const handler of collector.handlers.get("message_end")) await handler(event, context);
assert.equal(existsSync(logs), false, "Missing control must not start a writer");
writeFileSync(
  control,
  JSON.stringify({ protocol: 2, revision: "00000000-0000-4000-8000-000000000001", enabled: true }),
);
for (let i = 0; i < 3; i++) {
  const message = {
    ...event.message,
    usage: { ...event.message.usage, cost: { total: i === 0 ? 0.125 : 0 } },
  };
  for (const handler of collector.handlers.get("message_end")) handler({ message }, context);
  entries.set("entry-" + i, { type: "message", id: "entry-" + i, parentId: leaf, message });
  leaf = "entry-" + i;
}
for (const handler of collector.handlers.get("session_shutdown")) await handler({}, context);
const text = readFileSync(logs, "utf8");
const records = text
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
assert.equal(records.length, 3);
assert.equal(new Set(records.map((row) => row.eventId)).size, 3);
assert.deepEqual(
  records.map((row) => row.capturedCost),
  [0.125, null, null],
);
assert.ok(
  records.every(
    (row) =>
      row.occurredAt === new Date(event.message.timestamp).toISOString() && row.totalTokens === 3,
  ),
);
const confirmations = readFileSync(
  join(dataDir, `history/confirmations-v1-${new Date().toISOString().slice(0, 10)}.jsonl`),
  "utf8",
);
assert.equal(confirmations.trim().split("\n").length, 3);
assert.equal(
  (text + confirmations).includes("sentinel"),
  false,
  "No message/tool/credential content may be stored",
);
writeFileSync(
  control,
  JSON.stringify({ protocol: 2, revision: "00000000-0000-4000-8000-000000000001", enabled: false }),
);
for (const handler of collector.handlers.get("message_end")) await handler(event, context);
assert.equal(readFileSync(logs, "utf8"), text);
console.log(
  "Actual packaged writer: serialized capture, original time/price, missing prices, object-identity confirmation, pause, and shutdown draining passed.",
);
