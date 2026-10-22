import { retainCapture } from "../../capture-history.js";
import { fitViewState } from "../../view-budget.js";
import { isDeepStrictEqual } from "node:util";
import {
  VIEW_KIND,
  rowSchema,
  type Capture,
  type ViewRow,
  type ViewState,
} from "../../subagents-contract.js";
import { type CaptureTarget } from "./capture.js";
import { type RunNode } from "./protocol.js";
import { foregroundRows } from "./foreground.js";
export interface ViewOwner {
  sessionId: string;
  sessionFile: string;
  generation: number;
}
export interface ViewAssessment {
  availability: ViewState["availability"];
  reason: string;
}
interface ViewObservationOptions extends Partial<ViewAssessment> {
  settledRoots?: ReadonlySet<string>;
  foreground?: readonly { details: unknown; final: boolean }[];
  recaptureRuns?: ReadonlySet<string>;
}
const terminal = (state: string) => !["running", "queued", "unknown", "detached"].includes(state);
const ownerKey = (owner: ViewOwner) =>
  JSON.stringify([owner.sessionId, owner.sessionFile, owner.generation]);
const comparable = (state: ViewState) =>
  JSON.parse(
    JSON.stringify({
      ...state,
      updatedAt: 0,
      rows: state.rows.map((row) => ({ ...row, observedAt: 0 })),
    }),
  );
export function createViewStore(publish: (state: ViewState) => void, now = Date.now) {
  const rows = new Map<string, ViewRow>();
  const disposedOwners = new Set<string>();
  let activeOwner: string | undefined;
  let retired = false;
  let omitted = 0;
  let lastPublished: ViewState | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timerToken = 0;
  let availability: ViewState["availability"] = "unavailable";
  let reason = "No supported child observation received";
  const snapshot = (): ViewState => ({
    kind: VIEW_KIND,
    version: 1,
    updatedAt: now(),
    availability,
    reason,
    omitted,
    rows: [...rows.values()],
  });
  function cancelTimer() {
    timerToken++;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function fitted() {
    const state = fitViewState({ ...snapshot(), rows: [...rows.values()].reverse() });
    state.rows.reverse();
    rows.clear();
    for (const row of state.rows) rows.set(row.id, row);
    omitted = state.omitted;
    return state;
  }
  function flush() {
    cancelTimer();
    if (retired) return;
    const state = fitted();
    if (lastPublished && isDeepStrictEqual(comparable(lastPublished), comparable(state))) return;
    publish(structuredClone(state));
    lastPublished = structuredClone(state);
  }
  function emit(urgent = false) {
    if (retired) return;
    const state = fitted();
    if (lastPublished && isDeepStrictEqual(comparable(lastPublished), comparable(state))) return;
    const previous = new Map(lastPublished?.rows.map((row) => [row.id, row]));
    urgent ||=
      !lastPublished ||
      availability !== lastPublished.availability ||
      reason !== lastPublished.reason ||
      state.rows.some(
        (row) =>
          terminal(row.state) &&
          !isDeepStrictEqual(previous.get(row.id) && { ...previous.get(row.id), observedAt: 0 }, {
            ...row,
            observedAt: 0,
          }),
      );
    if (urgent) return flush();
    if (timer !== undefined) return;
    const token = ++timerToken;
    timer = setTimeout(() => {
      if (token !== timerToken || retired) return;
      timer = undefined;
      try {
        flush();
      } catch {}
    }, 250);
    timer.unref?.();
  }
  function acceptOwner(owner: ViewOwner) {
    if (retired || disposedOwners.has(ownerKey(owner))) return false;
    activeOwner = ownerKey(owner);
    return true;
  }
  function put(row: ViewRow): boolean {
    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) {
      omitted++;
      availability = "unavailable";
      reason = "Child detail exceeds the supported presentation schema";
      return false;
    }
    const validated = parsed.data;
    const previous = rows.get(row.id);
    if (
      isDeepStrictEqual(previous && { ...previous, observedAt: 0 }, { ...validated, observedAt: 0 })
    )
      return false;
    rows.delete(row.id);
    rows.set(row.id, validated);
    return true;
  }
  function putForeground(owner: ViewOwner, details: unknown, final: boolean) {
    const projected = foregroundRows(owner, details, final, now());
    if (!projected.length) {
      availability = "unavailable";
      reason = "Foreground identity or supported detail is unavailable";
      return;
    }
    for (const row of projected) {
      const previous = rows.get(row.id);
      if (previous && terminal(previous.state) && !terminal(row.state)) continue;
      put({ ...row, capture: retainCapture(row.capture, previous?.capture) });
    }
  }
  return {
    snapshot,
    availability(value: ViewState["availability"], detail: string, owner?: ViewOwner) {
      if (
        retired ||
        (owner &&
          (disposedOwners.has(ownerKey(owner)) ||
            (activeOwner !== undefined && activeOwner !== ownerKey(owner))))
      )
        return;
      if (availability !== value || reason !== detail) {
        availability = value;
        reason = detail.slice(0, 500);
        emit(true);
      }
    },
    background(
      owner: ViewOwner,
      roots: readonly RunNode[],
      incomplete: boolean,
      options: ViewObservationOptions = {},
    ): CaptureTarget[] {
      if (!acceptOwner(owner)) return [];
      availability = options.availability ?? "available";
      reason = options.reason ?? "";
      const targets: CaptureTarget[] = [];
      function visit(
        node: RunNode,
        path: string[],
        parentId: string | undefined,
        canonicalOwner: string | undefined,
      ) {
        const canonical = node.kind === "workflow" || node.kind === "subagent";
        const owningRun = canonical ? node.id : canonicalOwner;
        const id = JSON.stringify([owner.sessionId, "background", ...path, node.id]);
        const previous = rows.get(id);
        const row: ViewRow = {
          id,
          parentId,
          runId: node.id,
          sessionId: owner.sessionId,
          generation: owner.generation,
          source: "background",
          label: node.label,
          kind: node.kind,
          state: node.state,
          startedAt: node.startedAt,
          endedAt: node.endedAt,
          activity: node.activity?.currentTool ?? node.activity?.state,
          incomplete,
          observedAt: now(),
          capture: previous?.capture,
        };
        // A step projection can hide a materialized workflow's canonical ID.
        // Its descendants cannot inherit the enclosing workflow's inspect address.
        if (!owningRun)
          row.capture = {
            status: "unavailable",
            capturedAt: previous?.capture?.capturedAt ?? now(),
            reason: "Canonical inspection owner is unavailable for this projected descendant",
          };
        const changed = put(row);
        if (
          owningRun &&
          (changed ||
            (options.recaptureRuns?.has(owningRun) &&
              (node.kind === "subagent" || (node.kind === "step" && node.id === "step:0"))) ||
            (parentId === undefined && options.settledRoots?.has(node.id)))
        )
          targets.push({
            ...owner,
            id,
            asyncId: owningRun,
            kind: node.kind,
            childId: canonical ? undefined : node.id,
            terminal: terminal(node.state),
          });
        for (const child of node.children ?? [])
          visit(child, [...path, node.id], id, canonical ? owningRun : undefined);
      }
      for (const root of roots) visit(root, [], undefined, root.id);
      for (const event of options.foreground ?? [])
        putForeground(owner, event.details, event.final);
      emit(options.foreground?.some((event) => event.final));
      return targets;
    },
    foreground(
      owner: ViewOwner,
      details: unknown,
      final: boolean,
      assessment: ViewAssessment = { availability: "available", reason: "" },
    ) {
      if (!acceptOwner(owner)) return;
      availability = assessment.availability;
      reason = assessment.reason;
      putForeground(owner, details, final);
      emit(final);
    },
    captureIfCurrent(target: CaptureTarget, capture: Capture) {
      if (retired || disposedOwners.has(ownerKey(target))) return;
      const row = rows.get(target.id);
      if (
        !row ||
        row.generation !== target.generation ||
        row.sessionId !== target.sessionId ||
        row.kind !== target.kind ||
        row.runId !== (target.childId ?? target.asyncId) ||
        (target.childId !== undefined && rows.get(row.parentId ?? "")?.runId !== target.asyncId)
      )
        return;
      row.capture = retainCapture(capture, row.capture);
      emit();
    },
    capture(id: string, capture: Capture) {
      if (retired) return;
      const row = rows.get(id);
      if (!row) return;
      // Failure records availability without deleting an earlier accepted output.
      row.capture = retainCapture(capture, row.capture);
      emit();
    },
    dispose(owner: ViewOwner, disposalReason: string) {
      if (retired || disposedOwners.has(ownerKey(owner))) return;
      disposedOwners.add(ownerKey(owner));
      for (const row of rows.values())
        if (
          row.generation === owner.generation &&
          row.sessionId === owner.sessionId &&
          !terminal(row.state)
        ) {
          row.state = "unknown";
          row.incomplete = true;
          row.observedAt = now();
        }
      if (activeOwner === undefined || activeOwner === ownerKey(owner)) {
        availability = "unavailable";
        reason = `Session ${disposalReason}; unconfirmed execution outcome is unknown`;
      }
      emit(true);
    },
    retire() {
      retired = true;
      cancelTimer();
    },
  };
}
