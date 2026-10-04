import { type DeltaBackgroundTaskShape, type ThreadDelta } from "@get-bb/plugin-sdk/provider-bridge";
import { isDeepStrictEqual } from "node:util";
import { parseStatusReceipt, SNAPSHOT_PREFIX, boundedJson, type RunNode } from "./protocol.js";
import { reconcileRunTrees, type RetainedRun } from "./run-reconciliation.js";

export interface ObservationOptions {
  sessionFile: string;
  generation: number;
  reconcile(): Promise<unknown>;
  emit(deltas: readonly ThreadDelta[]): void;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => () => void;
}
export type DisposalReason = "exit" | "release" | "replacement";
interface NativeRun extends RetainedRun { settled: boolean; shape: DeltaBackgroundTaskShape; }
const MAX_RUNS = 64;
const READ_INTERVAL_MS = 5000;
function schedule(callback: () => void, delayMs: number): () => void {
  const timer = setTimeout(callback, delayMs);
  timer.unref();
  return () => clearTimeout(timer);
}
function outcome(node: RunNode): Pick<DeltaBackgroundTaskShape, "status" | "taskStatus"> {
  if (node.state === "complete") return { status: "completed", taskStatus: "completed" };
  if (node.state === "failed" || node.state === "rejected") return { status: "failed", taskStatus: "failed" };
  return { status: "interrupted", taskStatus: node.state === "paused" ? "paused" : "stopped" };
}

/** Session-owned observer. Only correlated package status may settle native work. */
export function createSubagentObservation(options: ObservationOptions) {
  const now = options.now ?? Date.now;
  const later = options.schedule ?? schedule;
  const runs = new Map<string, NativeRun>();
  let sessionId: string | undefined;
  let availability: "unavailable" | "available" = "unavailable";
  let reason = "No compatible package status received";
  let disposed = false;
  let pending: Promise<void> | undefined;
  let cancelRead: (() => void) | undefined;
  let hintedDuringRead = false;
  let scheduledHint = false;
  let generatedAt = -1;
  // Foreground details are bounded in-memory facts, not native background work.
  const foreground = new Map<string, { runId: string; index: number; agent: string }>();
  function key(id: string) { return { providerItemId: `pi-subagent-${options.generation}-${id}` }; }
  function hasLiveWork() { return [...runs.values()].some((run) => !run.settled); }
  function armRead() {
    cancelRead?.();
    cancelRead = undefined;
    scheduledHint = false;
    if (!disposed && (hasLiveWork() || hintedDuringRead)) {
      const delay = hintedDuringRead ? 250 : READ_INTERVAL_MS;
      hintedDuringRead = false;
      cancelRead = later(() => { cancelRead = undefined; void refresh(); }, delay);
    }
  }
  function shape(node: RunNode, active: boolean): DeltaBackgroundTaskShape {
    const elapsed = node.startedAt === undefined ? "elapsed unavailable" : `${Math.max(0, Math.floor(((active ? now() : node.endedAt ?? node.updatedAt ?? now()) - node.startedAt) / 1000))}s`;
    const activity = node.activity?.currentTool ?? node.activity?.state ?? "activity unavailable";
    return { type: "backgroundTask", familyId: "pi-subagents", taskType: "local_subagent", skipTranscript: true, description: `${node.label} [${node.id}]`, summary: `${node.state}; ${elapsed}; ${activity}; result not captured`, ...(active ? { status: "pending" as const, taskStatus: node.state === "queued" ? "pending" as const : "running" as const } : outcome(node)) };
  }
  async function refresh(): Promise<void> {
    if (disposed) return;
    if (pending) return pending;
    const read = (async () => {
      try {
        const raw = await options.reconcile();
        if (disposed) return;
        const receipt = parseStatusReceipt(raw, options.sessionFile, sessionId);
        if (!receipt) { availability = "unavailable"; reason = "Malformed, foreign, or unsupported package status"; return; }
        const snap = receipt.status.asyncSnapshot;
        if (snap.generatedAt < generatedAt) return;
        sessionId = receipt.sessionId;
        generatedAt = snap.generatedAt;
        availability = "available";
        reason = "";
        for (const fact of reconcileRunTrees(runs, snap)) {
          const { id, node, active, covered } = fact;
          const previous = runs.get(id);
          if (previous?.settled) continue;
          if (!previous && runs.size >= MAX_RUNS) { availability = "unavailable"; reason = "Run limit reached"; continue; }
          // Never create native activity for terminal history alone.
          if (!previous && !fact.live) continue;
          const next = shape(node, active);
          if (!previous || !isDeepStrictEqual(previous.shape, next)) {
            options.emit([{ kind: "item.progress", key: key(id), snapshot: next, flush: true }]);
          }
          runs.set(id, { node, covered, shape: next, settled: !active });
        }
      } catch {
        if (!disposed) { availability = "unavailable"; reason = "Package status read failed or timed out"; }
      }
    })();
    pending = read;
    try { await read; } finally { if (pending === read) pending = undefined; armRead(); }
  }
  function hint() {
    // Coalesce repeated hints. The bounded read timer is not a foreground keepalive.
    if (disposed) return;
    if (pending) { hintedDuringRead = true; return; }
    if (scheduledHint) return;
    cancelRead?.();
    scheduledHint = true;
    cancelRead = later(() => { cancelRead = undefined; scheduledHint = false; void refresh(); }, 250);
  }
  return {
    refresh, hint,
    widget(request: Record<string, unknown>): boolean {
      if (request.method !== "setWidget" || request.widgetKey !== "subagent-async") return false;
      const lines = request.lines;
      if (Array.isArray(lines) && lines.length === 1 && typeof lines[0] === "string" && lines[0].startsWith(SNAPSHOT_PREFIX) && Buffer.byteLength(lines[0], "utf8") <= 33000) hint();
      return true;
    },
    tool(event: Record<string, unknown>) {
      if (disposed || event.toolName !== "subagent" || !["tool_execution_update", "tool_execution_end"].includes(String(event.type))) return;
      const result = event.type === "tool_execution_update" ? event.partialResult : event.result;
      if (!boundedJson(result, 64 * 1024)) return;
      const details = (result as { details?: { mode?: unknown; runId?: unknown; results?: unknown } })?.details;
      if (!details || details.mode === "management" || typeof details.runId !== "string" || !/^[A-Za-z0-9_.:/-]{1,160}$/.test(details.runId) || !Array.isArray(details.results) || details.results.length > 64) return;
      const rows: { runId: string; index: number; agent: string }[] = [];
      const indices = new Set<number>();
      for (const row of details.results) {
        if (!row || typeof row !== "object" || !Number.isSafeInteger(row.index) || row.index < 0 || typeof row.agent !== "string" || row.agent.length > 160 || indices.has(row.index)) return;
        indices.add(row.index);
        rows.push({ runId: details.runId, index: row.index, agent: row.agent });
      }
      for (const row of rows) { if (foreground.size < 64 || foreground.has(`${row.runId}:${row.index}`)) foreground.set(`${row.runId}:${row.index}`, row); }
      hint();
    },
    dispose(disposalReason: DisposalReason) {
      if (disposed) return;
      disposed = true;
      cancelRead?.(); cancelRead = undefined;
      for (const [id, run] of runs) {
        if (run.settled) continue;
        const terminal: DeltaBackgroundTaskShape = { ...run.shape, status: "interrupted", taskStatus: "stopped", summary: `Execution outcome unknown after ${disposalReason}; result not captured` };
        options.emit([{ kind: "item.progress", key: key(id), snapshot: terminal, flush: true }]);
        run.shape = terminal;
        run.settled = true;
      }
      availability = "unavailable"; reason = `Session ${disposalReason}; execution outcome unknown`;
    },
    state() { return { availability, reason, inspection: "not-captured" as const, foreground: [...foreground.values()] }; },
  };
}
export type SubagentObservation = ReturnType<typeof createSubagentObservation>;
