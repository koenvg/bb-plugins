import { isDeepStrictEqual } from "node:util";
import { VIEW_KIND, VIEW_BYTES, boundedValue, parseViewState, rowSchema, type Capture, type ViewRow, type ViewState } from "../../subagents-contract.js";
import { type CaptureTarget } from "./capture.js";
import { type RunNode } from "./protocol.js";
import { foregroundRows } from "./foreground.js";
export interface ViewOwner { sessionId: string; sessionFile: string; generation: number; }
export interface ViewAssessment { availability: ViewState["availability"]; reason: string; }
interface ViewObservationOptions extends Partial<ViewAssessment> {
  settledRoots?: ReadonlySet<string>;
  foreground?: readonly { details: unknown; final: boolean }[];
}
const terminal = (state: string) => !["running", "queued", "unknown", "detached"].includes(state);
export function createViewStore(publish: (state: ViewState) => void, now = Date.now) {
  const rows = new Map<string, ViewRow>(); let omitted = 0;
  let lastPublished: ViewState | undefined;
  let availability: ViewState["availability"] = "unavailable"; let reason = "No supported child observation received";
  const snapshot = (): ViewState => ({ kind: VIEW_KIND, version: 1, updatedAt: now(), availability, reason, omitted, rows: [...rows.values()] });
  function emit() {
    while (rows.size > 128 || !boundedValue(snapshot(), VIEW_BYTES)) { const id = rows.keys().next().value; if (!id) break; rows.delete(id); omitted++; }
    const state = parseViewState(snapshot());
    if (state && !isDeepStrictEqual(lastPublished && { ...lastPublished, updatedAt: 0 }, { ...state, updatedAt: 0 })) {
      lastPublished = structuredClone(state);
      publish(state);
    }
  }
  function put(row: ViewRow): boolean {
    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) { omitted++; availability = "unavailable"; reason = "Child detail exceeds the supported presentation schema"; return false; }
    const validated = parsed.data; const previous = rows.get(row.id);
    if (isDeepStrictEqual(previous && { ...previous, observedAt: 0 }, { ...validated, observedAt: 0 })) return false;
    rows.delete(row.id); rows.set(row.id, validated); return true;
  }
  function putForeground(owner: ViewOwner, details: unknown, final: boolean) {
    const projected = foregroundRows(owner, details, final, now());
    if (!projected.length) { availability = "unavailable"; reason = "Foreground identity or supported detail is unavailable"; return; }
    for (const row of projected) {
      const previous = rows.get(row.id);
      if (previous && terminal(previous.state) && !terminal(row.state)) continue;
      put({ ...row, capture: row.capture ?? previous?.capture });
    }
  }
  return {
    snapshot,
    availability(value: ViewState["availability"], detail: string) { if (availability !== value || reason !== detail) { availability = value; reason = detail.slice(0,500); emit(); } },
    background(owner: ViewOwner, roots: readonly RunNode[], incomplete: boolean, options: ViewObservationOptions = {}): CaptureTarget[] {
      availability = options.availability ?? "available"; reason = options.reason ?? ""; const targets: CaptureTarget[] = [];
      function visit(node: RunNode, path: string[], parentId: string | undefined, canonicalOwner: string | undefined) {
        const canonical = node.kind === "workflow" || node.kind === "subagent";
        const owningRun = canonical ? node.id : canonicalOwner;
        const id = JSON.stringify([owner.sessionId, "background", ...path, node.id]);
        const previous = rows.get(id);
        const row: ViewRow = { id, parentId, runId: node.id, sessionId: owner.sessionId, generation: owner.generation, source: "background", label: node.label, kind: node.kind, state: node.state, startedAt: node.startedAt, endedAt: node.endedAt, activity: node.activity?.currentTool ?? node.activity?.state, incomplete, observedAt: now(), capture: previous?.capture };
        // A step projection can hide a materialized workflow's canonical ID.
        // Its descendants cannot inherit the enclosing workflow's inspect address.
        if (!owningRun) row.capture = { status: "unavailable", capturedAt: previous?.capture?.capturedAt ?? now(), reason: "Canonical inspection owner is unavailable for this projected descendant" };
        const changed = put(row);
        if (owningRun && (changed || parentId === undefined && options.settledRoots?.has(node.id))) targets.push({ ...owner, id, asyncId: owningRun, childId: canonical ? undefined : node.id, terminal: terminal(node.state) });
        for (const child of node.children ?? []) visit(child, [...path,node.id], id, canonical ? owningRun : undefined);
      }
      for (const root of roots) visit(root, [], undefined, root.id);
      for (const event of options.foreground ?? []) putForeground(owner, event.details, event.final);
      emit(); return targets;
    },
    foreground(owner: ViewOwner, details: unknown, final: boolean, assessment: ViewAssessment = { availability: "available", reason: "" }) {
      availability = assessment.availability; reason = assessment.reason;
      putForeground(owner, details, final);
      emit();
    },
    capture(id: string, capture: Capture) {
      const row = rows.get(id); if (!row) return;
      // Failure records availability without deleting an earlier accepted output.
      row.capture = capture.status === "captured" ? { ...row.capture, ...capture } : { ...row.capture, ...capture, capturedAt: row.capture?.capturedAt ?? capture.capturedAt, attemptedAt: capture.capturedAt };
      emit();
    },
    dispose(owner: ViewOwner, disposalReason: string) {
      for (const row of rows.values()) if (row.generation === owner.generation && !terminal(row.state)) { row.state = "unknown"; row.incomplete = true; row.observedAt = now(); }
      availability = "unavailable"; reason = `Session ${disposalReason}; unconfirmed execution outcome is unknown`; emit();
    },
  };
}
