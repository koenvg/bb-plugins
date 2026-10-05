import { useEffect, useRef, useState } from "react";
import {
  importViewSchema,
  importUnavailable,
  type ImportCommand,
  type ImportView,
} from "./import-contract.js";
import type { HistoryRequest } from "../history-contract.js";
type Props = {
  selection: { hostId: string | null; generation: number };
  selectionPending?: boolean;
  selectionRevision?: number;
  call(input: HistoryRequest & { command: ImportCommand }): Promise<unknown>;
};
const reasonText: Record<ImportView["reason"], string> = {
  ok: "Configured sources are not proof of complete host coverage.",
  "not-configured": "BB Pi source root is not configured.",
  "invalid-configuration": "Source roots or workspace scopes could not be verified on this host.",
  "unfinished-generation":
    "Resume or cancel the unfinished import before changing sources or starting another import.",
  "metadata-incomplete":
    "Verified identity metadata is incomplete. Check history readiness, then start again.",
  "no-generation": "There is no unfinished import to resume or cancel.",
  "storage-unavailable": "Import storage is unavailable. Quota still works.",
  "storage-incompatible": "Import storage is incompatible. Existing data is unchanged.",
  "selection-changed": "Host selection changed. Check import status on the owning host.",
  "host-offline": "Selected host is offline.",
  "no-selection": "Select a host to manage import.",
  "foreign-host": "Import does not match the selected host.",
  unsupported: "Import is unavailable in this plugin or host version.",
};
const button =
  "rounded-md border border-border px-3 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";
export function ImportPanel({
  selection,
  selectionPending = false,
  selectionRevision = 0,
  call,
}: Props) {
  const key = `${selection.hostId ?? ""}:${selection.generation}:${selectionRevision}:${selectionPending}`;
  const currentKey = useRef(key);
  currentKey.current = key;
  const callRef = useRef(call);
  callRef.current = call;
  const sequence = useRef(0),
    mounted = useRef(true);
  const [observation, setObservation] = useState<{
    key: string;
    view: ImportView;
  } | null>(null);
  const [busy, setBusy] = useState<{ key: string; seq: number } | null>(null);
  const [draft, setDraft] = useState<{
    key: string;
    bbRoot: string;
    ordinary: string;
    workspaces: string;
  } | null>(null);
  const view = !selectionPending && observation?.key === key ? observation.view : null;
  const values =
    draft?.key === key
      ? draft
      : {
          key,
          bbRoot: view?.configuration?.bbRoot ?? "",
          ordinary: view?.configuration?.ordinaryRoots.join("\n") ?? "",
          workspaces: view?.configuration?.workspaces.join("\n") ?? "",
        };
  const activate = (command: ImportCommand) => {
    if (selectionPending || !selection.hostId) return;
    const seq = ++sequence.current,
      scope = key,
      input = {
        hostId: selection.hostId,
        generation: selection.generation,
        command,
      };
    const valid = () => mounted.current && currentKey.current === scope && sequence.current === seq;
    setBusy({ key, seq });
    void Promise.resolve()
      .then(() => (valid() ? callRef.current(input) : null))
      .then((value) => {
        if (!valid()) return;
        const parsed = importViewSchema.safeParse(value);
        setObservation({
          key: scope,
          view: parsed.success ? parsed.data : importUnavailable("unsupported"),
        });
      })
      .catch(() => {
        if (valid())
          setObservation({
            key: scope,
            view: importUnavailable("unsupported"),
          });
      })
      .finally(() => {
        if (valid()) setBusy(null);
      });
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current++;
    };
  }, []);
  useEffect(() => {
    activate({ action: "status" });
    return () => {
      sequence.current++;
    };
  }, [key]);
  const pending = selectionPending || busy?.key === key,
    unfinished = view?.generation?.state === "stopped";
  const field = (label: string, name: "bbRoot" | "ordinary" | "workspaces", multiline = false) => (
    <label className="mt-3 block min-w-0">
      {label}
      {multiline ? (
        <textarea
          aria-label={label}
          className="mt-1 block w-full min-w-0 rounded border border-border bg-background p-2"
          rows={2}
          value={values[name]}
          disabled={pending || unfinished}
          onChange={(e) => setDraft({ ...values, [name]: e.target.value })}
        />
      ) : (
        <input
          aria-label={label}
          className="mt-1 block w-full min-w-0 rounded border border-border bg-background p-2"
          value={values[name]}
          disabled={pending || unfinished}
          onChange={(e) => setDraft({ ...values, [name]: e.target.value })}
        />
      )}
    </label>
  );
  return (
    <details className="mt-4 min-w-0 text-sm" aria-label={`Historical import`}>
      <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">
        Historical import
      </summary>
      <p className="mt-2">
        Only Start and Resume discover or read retained transcripts on the selected host. Each
        action runs one bounded cycle. Reload never resumes work.
      </p>
      <p className="mt-2">
        Enter the actual source roots for this host, including any custom root. No root is guessed.
        Ordinary Pi roots must be specific session directories, not a home directory. Workspaces
        must be known BB environments on this host.
      </p>
      <p className="mt-2" aria-live="polite">
        {selectionPending
          ? "Changing host. Import controls are disabled."
          : !selection.hostId
            ? reasonText["no-selection"]
            : pending
              ? "Checking or updating selected-host import…"
              : view
                ? reasonText[view.reason]
                : "Import status is not available."}
      </p>
      {field("BB Pi source root", "bbRoot")}
      {field("Optional ordinary Pi roots, one per line", "ordinary", true)}
      {field("Known workspace paths, one per line", "workspaces", true)}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={button}
          disabled={
            !selection.hostId || pending || unfinished || !values.bbRoot || !values.workspaces
          }
          onClick={() =>
            activate({
              action: "configure",
              configuration: {
                bbRoot: values.bbRoot,
                ordinaryRoots: values.ordinary.split("\n").filter(Boolean),
                workspaces: values.workspaces.split("\n").filter(Boolean),
              },
            })
          }
        >
          Save import sources
        </button>
        <button
          className={button}
          disabled={!selection.hostId || pending || unfinished || !view?.configuration}
          onClick={() => activate({ action: "start" })}
        >
          Start import
        </button>
        <button
          className={button}
          disabled={!selection.hostId || pending}
          onClick={() => activate({ action: "status" })}
        >
          Check import status
        </button>
        <button
          className={button}
          disabled={pending || !unfinished}
          onClick={() => activate({ action: "resume" })}
        >
          Resume import
        </button>
        <button
          className={button}
          disabled={selectionPending || !selection.hostId || (!unfinished && !pending)}
          onClick={() => activate({ action: "cancel" })}
        >
          Cancel import
        </button>
      </div>
      {view?.generation && (
        <div className="mt-3 [overflow-wrap:anywhere]">
          <p>
            Import {view.generation.state}. Frozen UTC range: {view.generation.startAt} to{" "}
            {view.generation.endAt}.
          </p>
          <p>Selected-host workspace scopes: {view.generation.workspaces.join(", ")}.</p>
          {view.generation.sourceRoots && (
            <p>Frozen configured source roots: {view.generation.sourceRoots.join(", ")}.</p>
          )}
          <p>
            {view.generation.finished} of {view.generation.candidates} candidates finished.{" "}
            {view.generation.bytes.toLocaleString()} bytes read. {view.generation.records} usage
            records processed. {view.generation.replayed} confirmed inherited entries excluded.{" "}
            {view.generation.omissions} omissions.
          </p>
          <p>
            Partial coverage, including when no records are found. No actual usage is inferred as
            zero.
          </p>
          {view.generation.diagnostics.length > 0 && (
            <p>Diagnostics: {view.generation.diagnostics.join(", ")}.</p>
          )}
        </div>
      )}
      <p className="mt-2">
        Cancel stops further work. Already committed host records remain. Browser cancellation or a
        host change cannot roll back a committed operation. Check status after reconnecting.
      </p>
    </details>
  );
}
