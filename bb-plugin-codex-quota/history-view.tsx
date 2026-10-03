import { useEffect, useRef, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server.js";
import { historyReadinessSchema, historyUnavailable, type HistoryReadiness, type HistoryRequest } from "./history-contract.js";

type Selection = { hostId: string | null; generation: number };
type Props = { selection: Selection; selectionPending?: boolean; selectionRevision?: number; read(input: HistoryRequest): Promise<unknown> };
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

export function HistoryReadinessPanel({ selection, read, selectionPending = false, selectionRevision = 0 }: Props) {
  const key = `${selection.hostId ?? ""}:${selection.generation}:${selectionRevision}:${selectionPending}`;
  const [attempt, setAttempt] = useState(0);
  const [observation, setObservation] = useState<{ key: string; attempt: number; view: HistoryReadiness } | null>(null);
  const readRef = useRef(read); readRef.current = read;
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
  const current = !selectionPending && observation?.key === key && observation.attempt === attempt ? observation.view : null;
  const loading = selectionPending || (!!selection.hostId && !current);
  return <section className="mt-8 min-w-0 border-t border-border pt-4 text-sm" aria-label="History readiness" aria-busy={loading}>
    <h2 className="font-semibold">History readiness</h2>
    <p className="mt-2 text-muted-foreground" aria-live="polite">{selectionPending ? "Changing selected host. History readiness is pending." : !selection.hostId ? reasonText["no-selection"] : loading ? "Checking selected-host history readiness…" : reasonText[current!.reason]}</p>
    {current && <div className="mt-3 text-muted-foreground"><p>Storage: {storageText[current.storage]}.</p><p>Collector: {collectorText[current.collector]}.</p><p>Writer activation: unconfirmed. This is not proof of complete history.</p></div>}
    <button type="button" className="mt-3 rounded-md border border-border px-3 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
      disabled={!selection.hostId || loading} onClick={() => setAttempt((value) => value + 1)}>Check readiness</button>
    <details className="mt-4 text-muted-foreground">
      <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">Collection and privacy</summary>
      <p className="mt-2">This check does not install a collector or import history. It does not read transcripts or use account credentials.</p>
      <p className="mt-2">Collection controls are not available in this readiness release. The packaged collector stays inactive without explicit control metadata.</p>
      <p className="mt-2">A future installed collector runs separately from BB. Closing this page or disabling the BB plugin cannot stop a writer on an offline host. Existing Pi sessions need restarting to load a new extension.</p>
    </details>
  </section>;
}

export function HistoryReadinessSection({ selection, selectionPending, selectionRevision }: Omit<Props, "read">) {
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc); rpcRef.current = rpc;
  const read = useRef((input: HistoryRequest) => rpcRef.current.call("historyReadiness", input));
  return <HistoryReadinessPanel selection={selection} selectionPending={selectionPending} selectionRevision={selectionRevision} read={read.current} />;
}
