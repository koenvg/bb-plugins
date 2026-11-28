import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { InsightResult } from "../contract";
import type { PrInsight } from "../core/overview";
import type { RunnableMergeAction } from "../core/merge-action";
import { useCommandIntent } from "./command-intents";
import { prStatusView } from "./pr-status-view";
import { prOperations } from "./pr-operations";
import { usePrAction } from "./use-pr-action";
import type { useInsight } from "./use-insight";

interface Target {
  pr: PrInsight["pr"];
  action: RunnableMergeAction;
}
type PaletteState =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "confirm"; target: Target }
  | { kind: "message"; message: string; version: string };
const IDLE: PaletteState = { kind: "idle" };

function versionOf(result: InsightResult | null): string {
  if (result?.kind !== "ok") return JSON.stringify(result);
  const { pr, mergeAction, blockers, mergeQueue } = result.insight;
  return JSON.stringify([
    pr.number,
    pr.url,
    pr.headOid,
    pr.state,
    mergeAction,
    blockers,
    mergeQueue,
    result.error,
  ]);
}
function unavailable(insight: PrInsight): string {
  if (insight.pr.state === "merged") return "Pull request merged";
  if (insight.pr.state === "closed") return "Pull request closed";
  const status = prStatusView(insight);
  if (status.detail?.kind === "queue") return status.detail.text;
  return (
    insight.blockers.map((blocker) => blocker.text).join(" · ") || "This pull request cannot merge."
  );
}

export function usePaletteMerge(threadId: string, insight: ReturnType<typeof useInsight>) {
  const {
    state: operation,
    run,
    dismiss: dismissOperation,
  } = usePrAction(
    threadId,
    insight.result?.kind === "ok" ? insight.result.insight.pr.headOid : undefined,
  );
  const palette = useMemo(() => createPalette(), []);
  const state = useSyncExternalStore(palette.subscribe, palette.read);
  const { result, refreshing, revalidating } = insight;
  const currentVersion = versionOf(result);

  useCommandIntent(threadId, "merge", () => {
    const current = palette.read();
    if (
      current.kind === "preparing" ||
      current.kind === "confirm" ||
      prOperations.snapshot(threadId).kind === "running"
    ) {
      return;
    }
    palette.publish({ kind: "preparing" });
    dismissOperation();
  });

  useEffect(() => {
    if (palette.read() !== state) return;
    if (state.kind === "preparing") {
      if (result === null || refreshing || revalidating) return;
      if (prOperations.snapshot(threadId).kind === "running") {
        palette.publish(IDLE);
        return;
      }
      const prepared = prepareMerge(result, currentVersion);
      if (prepared.kind === "confirm" && prepared.target.action.kind === "enqueue") {
        palette.publish(IDLE);
        void run({ action: "enqueue", expectedHeadOid: prepared.target.pr.headOid });
      } else {
        palette.publish(prepared);
      }
      return;
    }
    if (
      state.kind === "message" &&
      (state.version !== currentVersion || operation.kind === "running")
    ) {
      palette.publish(IDLE);
    }
    if (state.kind !== "confirm") return;
    if (operation.kind === "running") {
      palette.publish(IDLE);
    } else if (!matchesTarget(result, state.target)) {
      palette.publish({
        kind: "message",
        message: "The PR changed. Refresh and try again.",
        version: currentVersion,
      });
    }
  }, [
    state,
    palette,
    currentVersion,
    result,
    refreshing,
    revalidating,
    operation.kind,
    run,
    threadId,
  ]);

  function dismiss() {
    palette.publish(IDLE);
    dismissOperation();
  }
  const confirm = () => {
    if (state.kind !== "confirm" || palette.read() !== state) return;
    palette.publish(IDLE);
    void run({ action: state.target.action.kind, expectedHeadOid: state.target.pr.headOid });
  };
  return { state, operation, confirm, dismiss };
}

function createPalette() {
  let snapshot = IDLE;
  const listeners = new Set<() => void>();
  return {
    read: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(next: PaletteState) {
      if (next === snapshot) return;
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
}

function prepareMerge(
  result: InsightResult,
  version: string,
): Extract<PaletteState, { kind: "message" | "confirm" }> {
  if (result.kind === "error") return { kind: "message", message: result.message, version };
  if (result.kind === "no_pr")
    return { kind: "message", message: "No pull request for this thread", version };
  if (result.error !== null) return { kind: "message", message: result.error, version };
  const { action } = prStatusView(result.insight);
  return action === null
    ? { kind: "message", message: unavailable(result.insight), version }
    : { kind: "confirm", target: { pr: result.insight.pr, action } };
}

function matchesTarget(result: InsightResult | null, target: Target): boolean {
  if (result?.kind !== "ok") return false;
  const { pr } = result.insight;
  return (
    pr.number === target.pr.number &&
    pr.url === target.pr.url &&
    pr.headOid === target.pr.headOid &&
    JSON.stringify(prStatusView(result.insight).action) === JSON.stringify(target.action)
  );
}
