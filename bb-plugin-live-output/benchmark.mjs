// Deterministic scheduling simulation, not a CPU or production-latency benchmark.
// bun build benchmark.mjs --target node --outfile /tmp/live-output-benchmark.mjs
// node --expose-gc /tmp/live-output-benchmark.mjs <idle|active>
import { OutputCollector } from "./collector.ts";

const [mode = "active"] = process.argv.slice(2);
if (!["idle", "active"].includes(mode) || !global.gc)
  throw new Error("Supply idle|active, using --expose-gc");
const originals = {
  now: Date.now,
  interval: globalThis.setInterval,
  clear: globalThis.clearInterval,
  timeout: AbortSignal.timeout,
};
let now = 100_000;
let tick;
Date.now = () => now;
globalThis.setInterval = (fn) => {
  tick = fn;
  return 1;
};
globalThis.clearInterval = () => {
  tick = undefined;
};
AbortSignal.timeout = () => new AbortController().signal;
const metadata = (id) => ({
  id,
  title: id,
  titleFallback: null,
  providerId: "fixture",
  parentThreadId: null,
  visibility: "visible",
  archivedAt: null,
  deletedAt: null,
  status: "idle",
  createdAt: 90_000,
  updatedAt: 90_000,
});
const idle = Array.from({ length: 850 }, (_, i) => metadata(`idle_${i}`));
const streams =
  mode === "active" ? Array.from({ length: 10 }, (_, i) => metadata(`live_${i}`)) : [];
const rows = [...idle, ...streams];
const events = new Map(rows.map((row) => [row.id, []]));
const progress = new Map();
const returned = new Set();
const counters = { discovery: 0, identity: 0, events: 0, idleEvents: 0, hints: 0, errors: 0 };
const verified = new Set();
let measuring = false;
const api = {
  list: async ({ archived, offset, limit }) => {
    counters.discovery++;
    return archived ? [] : rows.slice(offset, offset + limit);
  },
  get: async ({ threadId }) => {
    counters.identity++;
    const row = rows.find((entry) => entry.id === threadId);
    if (!row) {
      counters.errors++;
      throw new Error("Unknown fixture identity");
    }
    return row;
  },
  events: {
    list: async ({ threadId, afterSeq, beforeSeq, order, limit }) => {
      counters.events++;
      if (threadId.startsWith("idle_")) {
        counters.idleEvents++;
        if (measuring) verified.add(threadId);
      }
      const source = events.get(threadId);
      if (!source) {
        counters.errors++;
        throw new Error("Unknown fixture events");
      }
      const page = source.filter(
        (event) =>
          (afterSeq === undefined || event.seq > Number(afterSeq)) &&
          (beforeSeq === undefined || event.seq < Number(beforeSeq)),
      );
      if (order === "desc") page.reverse();
      const result = page.slice(0, Number(limit));
      for (const event of result) {
        returned.add(`${threadId}:${event.seq}`);
        progress.set(threadId, Math.max(progress.get(threadId) ?? 0, event.seq));
      }
      return result;
    },
  },
};
const flush = () => new Promise(setImmediate);
const advance = async () => {
  now += 1000;
  tick?.();
  await flush();
};
global.gc();
const heapBefore = process.memoryUsage().heapUsed;
const collector = new OutputCollector(() => api);
const control = new AbortController();
try {
  void collector.run(control.signal);
  await flush();
  for (let i = 0; i < 4; i++) await advance();
  for (const row of rows) {
    collector.observe(row, 1);
    counters.hints++;
  }
  for (let i = 0; i < 90; i++) await advance();
  const before = { ...counters };
  measuring = true;
  let maxSequenceLag = 0;
  let maxTimestampLagMs = 0;
  let emittedBytes = 0;
  let peakBacklog = 0;
  let missedHintCountedAt = null;
  const measuredSeconds = 1200;
  const started = now;
  for (let second = 1; second <= measuredSeconds; second++) {
    for (const row of streams) {
      // UTF-8 is six bytes; counts and freshness do not use smoothed rates.
      events.get(row.id).push({
        threadId: row.id,
        seq: second,
        createdAt: now + 100,
        type: "item/agentMessage/delta",
        data: { delta: "é🙂" },
      });
      emittedBytes += 6;
      collector.observe(row, second);
      counters.hints++;
    }
    if (second === 1) {
      // One previously observed idle thread emits without a notification.
      events.get("idle_849").push({
        threadId: "idle_849",
        seq: 1,
        createdAt: now + 100,
        type: "item/agentMessage/delta",
        data: { delta: "abcd" },
      });
      emittedBytes += 4;
    }
    await advance();
    const snapshot = collector.snapshot();
    if (snapshot.failures || counters.errors) throw new Error("Simulation SDK failure");
    peakBacklog = Math.max(peakBacklog, snapshot.backlog);
    if (returned.has("idle_849:1") && missedHintCountedAt === null)
      missedHintCountedAt = now - started;
    for (const row of streams) {
      const latest = progress.get(row.id) ?? 0;
      maxSequenceLag = Math.max(maxSequenceLag, second - latest);
      const accountedAt = events.get(row.id)[latest - 1]?.createdAt ?? started;
      maxTimestampLagMs = Math.max(maxTimestampLagMs, now - accountedAt);
    }
  }
  const final = collector.snapshot();
  const uniqueBytes = [...returned].reduce(
    (sum, key) => sum + (key.startsWith("live_") ? 6 : 4),
    0,
  );
  if (final.totalBytes !== uniqueBytes || final.deltas !== returned.size)
    throw new Error("Collector accounting differs from unique returned events");
  const reads = Object.fromEntries(
    Object.entries(counters).map(([key, value]) => [key, value - before[key]]),
  );
  const idleMembersVerified = verified.size;
  // Clear load-generator history and indexes before measuring collector retention.
  events.clear();
  returned.clear();
  progress.clear();
  verified.clear();
  global.gc();
  const heapRetainedMiB = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
  console.log(
    JSON.stringify({
      mode,
      threads: rows.length,
      measuredSeconds,
      reads,
      emittedBytes,
      countedBytes: final.totalBytes,
      countedDeltas: final.deltas,
      uncountedBytes: emittedBytes - final.totalBytes,
      maxSequenceLag,
      maxTimestampLagMs,
      missedHintCountedAfterMs: missedHintCountedAt,
      peakBacklog,
      finalBacklog: final.backlog,
      failures: final.failures,
      idleMembersVerified,
      samples: final.samples.length,
      heapRetainedMiB,
    }),
  );
} finally {
  control.abort();
  collector.dispose();
  Date.now = originals.now;
  globalThis.setInterval = originals.interval;
  globalThis.clearInterval = originals.clear;
  AbortSignal.timeout = originals.timeout;
}
