import { useEffect, useRef, useState } from "react";
import type { InsightResult } from "../contract";
import type { PrInsight } from "../core/overview";
import type { RunnableMergeAction } from "../core/merge-action";
import { useCommandIntent } from "./command-intents";
import { mergeOperations } from "./merge-operations";
import { useMergeAction } from "./use-merge-action";
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
  const { pr, mergeAction, blockers } = result.insight;
  return JSON.stringify([pr.number, pr.url, pr.headOid, pr.state, mergeAction, blockers, result.error]);
}
function unavailable(insight: PrInsight): string {
  if (insight.pr.state === "merged") return "Pull request merged";
  if (insight.pr.state === "closed") return "Pull request closed";
  if (insight.mergeAction.kind === "queued") return "Queued";
  return insight.blockers.map((blocker) => blocker.text).join(" · ") || "This pull request cannot merge.";
}

export function usePaletteMerge(threadId: string, insight: ReturnType<typeof useInsight>) {
  const { state: operation, run, dismiss: dismissOperation } = useMergeAction(threadId, insight.result?.kind === "ok" ? insight.result.insight.pr.headOid : undefined);
  const [state, setState] = useState<PaletteState>(IDLE);
  const busy = useRef(false);
  const generation = useRef(0);
  const currentVersion = versionOf(insight.result);

  useEffect(() => () => { generation.current++; busy.current = false; }, []);

  function showMessage(message: string, version = currentVersion) {
    busy.current = false;
    setState({ kind: "message", message, version });
  }
  function send(target: Target) {
    busy.current = false;
    setState(IDLE);
    void run({ action: target.action.kind, expectedHeadOid: target.pr.headOid });
  }
  async function prepare() {
    if (busy.current || mergeOperations.snapshot(threadId).kind === "running") return;
    busy.current = true;
    const attempt = ++generation.current;
    dismissOperation();
    setState({ kind: "preparing" });
    const result = await insight.refresh();
    if (attempt !== generation.current) return;
    if (mergeOperations.snapshot(threadId).kind === "running") {
      busy.current = false;
      setState(IDLE);
      return;
    }
    if (result === null) {
      showMessage("The PR changed. Refresh and try again.");
      return;
    }
    const version = versionOf(result);
    if (result.kind === "error") { showMessage(result.message, version); return; }
    if (result.kind === "no_pr") { showMessage("No pull request for this thread", version); return; }
    if (result.error !== null) { showMessage(result.error, version); return; }
    const { pr, mergeAction } = result.insight;
    if (mergeAction.kind !== "merge" && mergeAction.kind !== "enqueue") {
      showMessage(unavailable(result.insight), version);
      return;
    }
    const target = { pr, action: mergeAction };
    if (mergeAction.kind === "enqueue") send(target);
    else setState({ kind: "confirm", target });
  }
  useCommandIntent(threadId, "merge", () => { void prepare(); });

  useEffect(() => {
    if (state.kind === "message" && state.version !== currentVersion) setState(IDLE);
    if (state.kind === "message" && operation.kind === "running") setState(IDLE);
    if (state.kind !== "confirm") return;
    const { target } = state;
    const result = insight.result;
    if (operation.kind === "running") {
      busy.current = false;
      setState(IDLE);
    } else if (result?.kind !== "ok" || result.insight.pr.number !== target.pr.number
      || result.insight.pr.url !== target.pr.url || result.insight.pr.headOid !== target.pr.headOid
      || JSON.stringify(result.insight.mergeAction) !== JSON.stringify(target.action)) {
      showMessage("The PR changed. Refresh and try again.");
    }
  }, [state, currentVersion, insight.result, operation.kind]);

  function dismiss() {
    busy.current = false;
    setState(IDLE);
    dismissOperation();
  }
  const confirm = () => { if (state.kind === "confirm") send(state.target); };
  return { state, operation, confirm, dismiss };
}
