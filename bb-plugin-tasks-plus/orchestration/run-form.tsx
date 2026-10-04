import { useState } from "react";
import {
  useRpc,
  type PluginPendingInteractionProps,
} from "@get-bb/plugin-sdk/app";
import { Button } from "../components/ui/button";
import {
  runConfigSchema,
  type RunProposal,
  type runRpcContract,
} from "./run-contract";
import { RunSummary } from "./run-summary";

export function RunApprovalForm({
  interaction,
  submit,
  cancel,
}: PluginPendingInteractionProps) {
  const rpc = useRpc<typeof runRpcContract>();
  const payload = interaction.payload as {
    action?: string;
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
    <section
      aria-label="Run approval"
      className="min-w-0 space-y-4 p-4 text-sm"
    >
      {preview ? (
        <RunSummary proposal={preview.proposal} />
      ) : (
        <p className="text-muted-foreground">
          Enter the missing run parameters in technical details, then check
          scope and selection before approval. No run is approved yet.
        </p>
      )}
      <p className="break-words text-xs text-muted-foreground">
        Approve this scope record, recorded selection and baseline only. No worker starts or receives input. Scope pause does not cancel native work. This
        does not approve publication, merge, production or added task scope.
        BB-recorded user classification does not prove human identity. See
        BBP-51.
      </p>
      <details
        open={!payload.initial}
        className="min-w-0 rounded-md border border-border"
      >
        <summary className="rounded-md p-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Technical details
        </summary>
        <div className="min-w-0 space-y-3 border-t border-border p-3">
          <label className="block space-y-2">
            <span>Run parameters as JSON</span>
            <textarea
              aria-label="Run parameters as JSON"
              className="block w-full min-w-0 rounded-md border border-input bg-background p-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          {preview && (
            <>
              <h3 className="font-medium">Complete scope text</h3>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs [overflow-wrap:anywhere]">
                {preview.summary}
              </pre>
              <h3 className="font-medium">Exact bound proposal</h3>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs [overflow-wrap:anywhere]">
                {JSON.stringify(preview.proposal, null, 2)}
              </pre>
            </>
          )}
        </div>
      </details>
      <Button
        variant="outline"
        className="h-auto min-h-9 max-w-full whitespace-normal text-left"
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
        {busy ? "Please wait" : "Check scope and selection"}
      </Button>
      {error && (
        <p
          role="alert"
          className="break-words text-destructive [overflow-wrap:anywhere]"
        >
          {error}
        </p>
      )}
      <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-border bg-card pt-3">
        <Button
          className="h-auto min-h-10 min-w-0 flex-1 whitespace-normal focus-visible:ring-2"
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
          {payload.action === "resume" ? "Approve resume" : "Approve run"}
        </Button>
        <Button
          variant="outline"
          className="h-auto min-h-10 min-w-0 whitespace-normal focus-visible:ring-2"
          disabled={busy}
          onClick={() => void cancel()}
        >
          Cancel
        </Button>
      </div>
    </section>
  );
}
