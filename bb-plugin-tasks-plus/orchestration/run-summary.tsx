import { useEffect, useState } from "react";
import { useRpc, useSdk } from "@get-bb/plugin-sdk/app";
import type { TasksRpcContract } from "../shared/contract";
import { RUN_LIMITS, type RunProposal } from "./run-contract";
import { trackerScopeFields } from "./run-scope-fields";

type DisplayNames = {
  proposal: RunProposal;
  tasks: Record<string, string>;
  coordinator: string | null;
};

// Read-only labels never replace any value in the bound proposal.
function useDisplayNames(proposal: RunProposal) {
  const rpc = useRpc<TasksRpcContract>();
  const sdk = useSdk();
  const [names, setNames] = useState<DisplayNames | null>(null);
  useEffect(() => {
    let current = true;
    const ids = [
      proposal.epicId,
      ...proposal.approvedTaskIds.slice(0, RUN_LIMITS.tasks),
    ];
    const tasks = Promise.all(
      ids.map(async (id) => {
        try {
          const { task } = await rpc.call("getTask", { taskId: id });
          if (
            task?.id === id &&
            task.projectId === proposal.projectId &&
            task.parentTaskId ===
              (id === proposal.epicId ? null : proposal.epicId)
          ) {
            const bytes = new TextEncoder().encode(
              JSON.stringify(trackerScopeFields(task)),
            );
            const digest = await crypto.subtle.digest("SHA-256", bytes);
            const hash = Array.from(new Uint8Array(digest), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join("");
            if (hash !== proposal.fingerprints[id]) return [id, id] as const;
            const title = task.title.trim();
            return [id, title ? `${task.key} · ${title}` : task.key] as const;
          }
        } catch {
          // Unavailable display metadata does not alter the approved selection.
        }
        return [id, id] as const;
      }),
    );
    const coordinator = sdk.threads
      .get({ threadId: proposal.coordinatorThreadId })
      .then((thread) =>
        thread.id === proposal.coordinatorThreadId &&
        thread.projectId === proposal.bbProjectId
          ? thread.title?.trim() || null
          : null,
      )
      .catch(() => null);
    void Promise.all([tasks, coordinator]).then(([labels, title]) => {
      if (current)
        setNames({
          proposal,
          tasks: Object.fromEntries(labels),
          coordinator: title,
        });
    });
    return () => {
      current = false;
    };
  }, [proposal, rpc, sdk]);
  return names?.proposal === proposal ? names : null;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 break-words [overflow-wrap:anywhere]">
        {value || "Not specified"}
      </dd>
    </div>
  );
}

export function RunSummary({ proposal }: { proposal: RunProposal }) {
  const names = useDisplayNames(proposal);
  const execution = proposal.execution.snapshot;
  const count = proposal.approvedTaskIds.length;
  return (
    <div className="@container min-w-0 space-y-4">
      {execution.permissionMode === "full" && (
        <div
          role="note"
          className="rounded-md border-2 border-border bg-muted p-3 text-sm"
        >
          <p className="font-semibold">Warning: full access</p>
          <p>Selected workers will use full-access permissions.</p>
          <p>
            Publication, merge, production and added scope need separate
            approval.
          </p>
        </div>
      )}
      <section aria-label="Selected scope" className="min-w-0 space-y-2">
        <h2 className="text-sm font-semibold">Run scope</h2>
        <p className="break-words font-medium [overflow-wrap:anywhere]">
          {names?.tasks[proposal.epicId] ?? proposal.epicId}
        </p>
        <p className="text-xs text-muted-foreground">
          {count} selected {count === 1 ? "task" : "tasks"}
        </p>
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-3 text-sm">
          {proposal.approvedTaskIds.map((id) => (
            <li key={id} className="break-words [overflow-wrap:anywhere]">
              {names?.tasks[id] ?? id}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Names are display only. Exact scope and IDs are in technical details.
        </p>
      </section>
      <section aria-label="Worker execution" className="min-w-0 space-y-2">
        <h2 className="text-sm font-semibold">Worker execution</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm @sm:grid-cols-3">
          <Fact
            label="Coordinator"
            value={names?.coordinator ?? proposal.coordinatorThreadId}
          />
          <Fact label="Provider" value={execution.providerId} />
          <Fact label="Model" value={execution.modelId} />
          <Fact label="Reasoning" value={execution.reasoningLevel} />
          <Fact label="Permissions" value={execution.permissionMode} />
          <Fact label="Environment" value={execution.environmentKind} />
          {execution.baseBranch && (
            <Fact label="Base branch" value={execution.baseBranch} />
          )}
          {execution.serviceTier && (
            <Fact label="Service tier" value={execution.serviceTier} />
          )}
          {execution.machineId && (
            <Fact label="Machine" value={execution.machineId} />
          )}
        </dl>
        <p className="text-xs text-muted-foreground">
          This form does not start a worker.
        </p>
      </section>
      <section aria-label="Intended baseline" className="min-w-0 space-y-2">
        <h2 className="text-sm font-semibold">Intended baseline</h2>
        <ul className="max-h-24 space-y-1 overflow-y-auto text-sm">
          {proposal.baselineReferences.map((reference) => (
            <li
              key={reference}
              className="break-words [overflow-wrap:anywhere]"
            >
              {reference}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
