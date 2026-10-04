import { useEffect, useRef, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server.js";
import { historyReadinessSchema, historyUnavailable, type HistoryReadiness, type CollectorAction, type HistoryRequest } from "./history-contract.js";

import { IdentityTotals } from "./identity-view.js";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
type Selection = { hostId: string | null; generation: number };
type Props = { onOpenThread?:(threadId:string)=>void; selection: Selection; selectionPending?: boolean; selectionRevision?: number; read(input: HistoryRequest): Promise<unknown>; control?(input: HistoryRequest & {action: CollectorAction}): Promise<unknown> };
const reasonText: Record<HistoryReadiness["reason"], string> = {
  ok: "History storage and collector asset are compatible. Writer activation is not confirmed.",
  "not-configured": "History not configured on this host.",
  "storage-unavailable": "History storage is unavailable on this host. Quota still works.",
  "storage-incompatible": "History storage is incompatible. Existing data is unchanged.",
  "collector-incompatible": "Collector is incompatible on this host. Quota still works.",
  "no-selection": "Select a host to check history readiness.",
  "foreign-host": "History request does not match the selected host.",
  "selection-changed": "Host selection changed. Check readiness again.",
  "host-offline": "Selected host is offline. History readiness is unavailable.",
  unsupported: "History readiness is unavailable in this plugin or host version.",
};
const storageText = { compatible: "compatible", unconfigured: "compatible, no database yet", unavailable: "unavailable", incompatible: "incompatible", unchecked: "not checked" };
const collectorText = { "compatible-v1": "compatible asset, version 1", missing: "missing", incompatible: "incompatible", unchecked: "not checked" };

export function HistoryReadinessPanel({ selection, read, control, onOpenThread, selectionPending = false, selectionRevision = 0 }: Props) {
  const key = `${selection.hostId ?? ""}:${selection.generation}:${selectionRevision}:${selectionPending}`;
  const [attempt, setAttempt] = useState(0);
  const [observation, setObservation] = useState<{ key: string; attempt: number; view: HistoryReadiness } | null>(null);
  const readRef = useRef(read); readRef.current = read;
  const controlRef = useRef(control); controlRef.current = control;
  const [controlling, setControlling] = useState<string | null>(null);
  const scope = `${key}:${attempt}`;
  const latestScope = useRef(scope); latestScope.current = scope;
  useEffect(() => {
    if (selectionPending || !selection.hostId) return;
    let active = true;
    const valid = () => active && latestScope.current === scope;
    const input = { hostId: selection.hostId, generation: selection.generation };
    void Promise.resolve().then(() => valid() ? readRef.current(input) : null).then((value) => {
      const parsed = historyReadinessSchema.safeParse(value);
      if (valid()) setObservation({ key, attempt, view: parsed.success ? parsed.data : historyUnavailable("unsupported") });
    }).catch(() => { if (valid()) setObservation({ key, attempt, view: historyUnavailable("unsupported") }); });
    return () => { active = false; };
  }, [scope, key, attempt, selection.hostId, selection.generation, selectionPending]);
  const activate = (action: CollectorAction) => {
    if (selectionPending || !selection.hostId || controlling === key || !controlRef.current) return;
    const capturedScope = latestScope.current;
    const valid = () => mounted.current && latestScope.current === capturedScope;
    const input = { hostId: selection.hostId, generation: selection.generation, action };
    setControlling(key);
    void Promise.resolve().then(() => valid() ? controlRef.current!(input) : null).then(value => {
      if (!valid()) return;
      const parsed = historyReadinessSchema.safeParse(value);
      setObservation({ key, attempt, view: parsed.success ? parsed.data : historyUnavailable("unsupported") });
    }).catch(() => { if (valid()) setObservation({ key, attempt, view: historyUnavailable("unsupported") }); })
      .finally(() => { if (valid()) setControlling(null); });
  };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = !selectionPending && observation?.key === key && observation.attempt === attempt ? observation.view : null;
  const loading = selectionPending || (!!selection.hostId && !current);
  return <section className="mt-8 min-w-0 border-t border-border pt-4 text-sm" aria-label="History readiness" aria-busy={loading}>
    <h2 className="font-semibold">History readiness</h2>
    <p className="mt-2 text-muted-foreground" aria-live="polite">{selectionPending ? "Changing selected host. History readiness is pending." : !selection.hostId ? reasonText["no-selection"] : loading ? "Checking selected-host history readiness…" : current!.reason === "ok" && current!.writer === "observed" ? "History storage and collector asset are compatible. Coverage is partial." : reasonText[current!.reason]}</p>
    {current && <div className="mt-3 text-muted-foreground"><p>Storage: {storageText[current.storage]}.</p><p>Collector: {collectorText[current.collector]}.</p><p>Writer activation: {current.writer === "observed" ? "observed in captured records" : "unconfirmed"}. This is not proof of complete history.</p></div>}
    {current?.collection && <div className="mt-3 min-w-0">
      <h3 className="font-semibold">Selected-host workspace totals</h3>
      <p className="mt-2">Capture {current.collection.enabled ? "enabled" : "paused"}. First observation boundary: {current.collection.firstObservedAt}.</p>
      <p className="mt-2 text-muted-foreground">Partial coverage. Other sessions may not have loaded the writer. {current.collection.pauseCount} pause intervals. {current.collection.invalidRecords} invalid records. {current.collection.conflictingEntries} conflicting entries excluded from totals. {current.collection.unconfirmedEvents} events lack entry confirmation. {current.collection.backlog ? "Reconciliation backlog remains. Check readiness to continue." : "No current reconciliation backlog."}</p>
      <p className="mt-2 text-muted-foreground">Shared workspace paths count once. These are not per-thread totals or complete account history.</p>
      {!current.collection.workspaces.length && <p className="mt-2">No captured usage yet. Unknown coverage is not zero usage.</p>}
      <ul className="mt-2 space-y-2">{current.collection.workspaces.map(row => <li key={row.workspace} className="break-words"><span className="[overflow-wrap:anywhere]">{row.workspace}</span>: {row.totalTokens.toLocaleString()} recorded tokens, {row.events} events</li>)}</ul>
      {current.collection.truncated && <p>Only the first 50 workspace rows are shown.</p>}
      {current.collection.attribution && <IdentityTotals view={current.collection.attribution} onOpenThread={onOpenThread} />}
    </div>}
    <button type="button" className="mt-3 rounded-md border border-border px-3 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
      disabled={!selection.hostId || loading || controlling === key} onClick={() => setAttempt((value) => value + 1)}>Check readiness</button>
    <details className="mt-4 text-muted-foreground">
      <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">Collection and privacy</summary>
      <p className="mt-2">This check does not install a collector or import history. It does not read transcripts or use account credentials.</p>
      <p className="mt-2">Installation enables new capture. Restart existing Pi sessions yourself to load or repair this extension. No session restarts automatically.</p>
      <p className="mt-2">The installed Pi extension can outlive BB's UI or plugin. Closing this page or disabling BB does not stop capture. Pause on the selected host to stop new writes. Already-owned writes can finish.</p>
      <p className="mt-2">Repair preserves earlier events, the first boundary, and paused state. Unknown or zero prices stay missing. Captured costs are not subscription spending.</p>
      {control && <div className="mt-3 flex flex-wrap gap-2">{(["install", "repair", "pause", "resume"] as const).map(action => <button key={action} type="button"
        className="rounded-md border border-border px-3 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
        disabled={!selection.hostId || loading || controlling === key || (action === "install" && !!current?.collection) || ((action === "pause" || action === "resume") && !current?.collection) || (action === "pause" && current?.collection?.enabled === false) || (action === "resume" && current?.collection?.enabled === true)}
        onClick={() => activate(action)}>{action === "install" ? "Install collector" : action === "repair" ? "Repair collector" : action === "pause" ? "Pause capture" : "Resume capture"}</button>)}</div>}
      {controlling === key && <p role="status">Updating selected-host collector…</p>}
    </details>
  </section>;
}

export function HistoryReadinessSection({ selection, selectionPending, selectionRevision }: Omit<Props, "read" | "control">) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const rpcRef = useRef(rpc); rpcRef.current = rpc;
  const read = useRef((input: HistoryRequest) => rpcRef.current.call("historyReadiness", input));
  const control = useRef((input: HistoryRequest & {action: CollectorAction}) => rpcRef.current.call("collectorControl", input));
  return <HistoryReadinessPanel onOpenThread={threadId => navigate.toThread(threadId)} selection={selection} selectionPending={selectionPending} selectionRevision={selectionRevision} read={read.current} control={control.current} />;
}
