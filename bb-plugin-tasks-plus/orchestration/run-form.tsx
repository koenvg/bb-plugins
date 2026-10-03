import { useState } from "react";
import {
  useRpc,
  type PluginPendingInteractionProps,
} from "@get-bb/plugin-sdk/app";
import {
  runConfigSchema,
  type RunProposal,
  type runRpcContract,
} from "./run-contract";

export function RunApprovalForm({
  interaction,
  submit,
  cancel,
}: PluginPendingInteractionProps) {
  const rpc = useRpc<typeof runRpcContract>();
  const payload = interaction.payload as {
    config?: unknown;
    initial?: { proposal: RunProposal; summary: string } | null;
  };
  const [text, setText] = useState(
    JSON.stringify(payload.config ?? {}, null, 2),
  );
  const [preview, setPreview] = useState(payload.initial ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="space-y-3 p-3">
      <h2>{interaction.title}</h2>
      <p>
        Approve existing task scope, execution selection and baseline only. This
        does not approve publication, merge, production or added task scope.
        BB-recorded user classification does not prove human identity. See
        BBP-51.
      </p>
      <label>
        Run parameters as JSON
        <textarea
          aria-label="Run parameters as JSON"
          className="w-full rounded border p-2 font-mono"
          rows={8}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setPreview(null);
            setError("");
          }}
          disabled={busy}
        />
      </label>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setPreview(
              await rpc.call("orchestratePreview", {
                coordinatorThreadId: interaction.threadId,
                config: runConfigSchema.parse(JSON.parse(text)),
              }),
            );
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "Invalid parameters",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Check scope and selection
      </button>
      {preview && (
        <>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap">
            {preview.summary}
          </pre>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(preview.proposal, null, 2)}
          </pre>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={busy || !preview}
          onClick={async () => {
            if (!preview) return;
            setBusy(true);
            try {
              await submit({ approved: true, proposal: preview.proposal });
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Approval failed",
              );
              setBusy(false);
            }
          }}
        >
          Approve run control
        </button>
        <button disabled={busy} onClick={() => void cancel()}>
          Cancel
        </button>
      </div>
    </section>
  );
}
