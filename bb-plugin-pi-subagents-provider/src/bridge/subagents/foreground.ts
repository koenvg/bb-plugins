import { z } from "zod";
import { boundedValue, type ViewRow } from "../../subagents-contract.js";
import { type ViewOwner } from "./view-store.js";
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : undefined;
const count = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
function executionState(
  row: Record<string, unknown>,
  progress: Record<string, unknown>,
  final: boolean,
): ViewRow["state"] {
  if (row.detached === true || progress.status === "detached") return "detached";
  if (row.interrupted === true) return "unknown";
  if (row.stopped === true || row.timedOut === true) return "stopped";
  if (
    progress.status === "failed" ||
    (final && (row.error || (typeof row.exitCode === "number" && row.exitCode !== 0)))
  )
    return "failed";
  if (progress.status === "completed" || (final && row.exitCode === 0)) return "complete";
  if (final) return "unknown";
  return progress.status === "pending" ? "queued" : "running";
}
const identity = z.object({
  mode: z.string(),
  runId: z.string().regex(/^[A-Za-z0-9_.:/-]{1,160}$/),
  results: z
    .array(
      z.object({ index: z.number().int().nonnegative(), agent: z.string().max(160) }).passthrough(),
    )
    .max(64),
});
export function foregroundRows(
  owner: ViewOwner,
  details: unknown,
  final: boolean,
  now: number,
): ViewRow[] {
  if (!boundedValue(details, 128 * 1024)) return [];
  const parsed = identity.safeParse(details);
  if (
    !parsed.success ||
    parsed.data.mode === "management" ||
    record(details).background === true ||
    record(details).asyncId !== undefined
  )
    return [];
  const d = parsed.data;
  if (new Set(d.results.map((r) => r.index)).size !== d.results.length) return [];
  return d.results.map((r) => {
    const summary = record(r.progressSummary);
    const rootProgress = Array.isArray(record(details).progress)
      ? (record(details).progress as unknown[])
      : [];
    const ownProgress = r.progress ?? rootProgress.find((p) => record(p).index === r.index);
    const progress = ownProgress ? record(ownProgress) : summary;
    const state = executionState(r, progress, final);
    const messages: NonNullable<ViewRow["capture"]>["messages"] = [];
    const rawMessages = Array.isArray(r.messages) ? r.messages : [];
    for (const message of rawMessages.slice(-20)) {
      const m = record(message);
      const content =
        typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content)
            ? m.content
                .map((part) => {
                  const p = record(part);
                  return p.type === "text" ? p.text : p.type === "toolCall" ? p.name : "";
                })
                .filter((x) => typeof x === "string")
                .join("\n")
            : "";
      if (content)
        messages.push({
          role: text(m.role, 80) ?? "unknown",
          kind: m.role === "toolResult" ? "toolResult" : "text",
          text: content.slice(0, 1000),
          textTruncated: content.length > 1000,
        });
    }
    const output = text(r.finalOutput, 8000);
    const task = text(r.task, 2000);
    const recent = Array.isArray(progress.recentOutput)
      ? (progress.recentOutput.filter((x) => typeof x === "string") as string[])
      : [];
    const usedRecent = !messages.length;
    if (usedRecent)
      for (const value of recent.slice(-10))
        messages.push({
          role: "assistant",
          kind: "text",
          text: value.slice(0, 1000),
          textTruncated: value.length > 1000,
        });
    return {
      id: JSON.stringify([owner.sessionId, "foreground", d.runId, r.index]),
      runId: d.runId,
      sessionId: owner.sessionId,
      generation: owner.generation,
      source: "foreground",
      label: r.agent,
      kind: "subagent",
      state,
      index: r.index,
      durationMs: count(progress.durationMs) ?? count(summary.durationMs),
      activity: text(progress.currentTool ?? progress.activityState ?? summary.currentTool, 160),
      incomplete: state === "unknown" || state === "detached",
      observedAt: now,
      capture: {
        status: "captured",
        capturedAt: now,
        task,
        finalOutput: output,
        messages,
        truncated: {
          task: typeof r.task === "string" && r.task.length > 2000,
          finalOutput: typeof r.finalOutput === "string" && r.finalOutput.length > 8000,
          messages: usedRecent
            ? Math.max(0, recent.length - 10)
            : Math.max(0, rawMessages.length - 20),
        },
      },
    };
  });
}
