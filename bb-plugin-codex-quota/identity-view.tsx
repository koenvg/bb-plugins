import type { AttributionView } from "./identity-contract.js";
export function IdentityTotals({
  view,
  onOpenThread,
}: {
  view: AttributionView;
  onOpenThread?: (threadId: string) => void;
}) {
  return (
    <section className="mt-4 min-w-0" aria-label="Thread attribution">
      <h3 className="font-semibold">Verified exact-thread totals</h3>
      <p className="mt-2 text-muted-foreground">
        Identity discovery: {view.discovery}.{" "}
        {view.backlog
          ? "Attribution backlog remains. Check readiness to continue."
          : "No current attribution backlog."}
      </p>
      <p className="mt-2 text-muted-foreground">
        Exact-thread requires unique verified identity. Workspace-only has no exact identity.
        Ambiguous has conflicting evidence. Unattributed has no recorded workspace or identity.
        Shared paths are never split or copied into thread rows.
      </p>
      {view.discovery !== "complete" || view.backlog ? (
        <p className="mt-2">
          Exact totals are not available until discovery and attribution finish. Workspace totals
          remain available.
        </p>
      ) : (
        <>
          <ul className="mt-2 space-y-1" aria-label="Attribution grades">
            {view.grades.map((row) => (
              <li key={row.grade}>
                {row.grade}: {row.totalTokens.toLocaleString()} recorded tokens, {row.events} events
              </li>
            ))}
          </ul>
          {!view.threads.length && (
            <p className="mt-2">
              No verified exact-thread usage in retained records. This is not proof of zero usage.
            </p>
          )}
          <ul className="mt-2 space-y-2">
            {view.threads.map((row) => (
              <li key={row.threadId} className="min-w-0 [overflow-wrap:anywhere]">
                <span>{row.label}</span>{" "}
                <span className="text-muted-foreground">
                  {row.state}. {row.threadId}
                </span>
                <p>
                  {row.totalTokens.toLocaleString()} recorded tokens, {row.events} events
                </p>
                {onOpenThread && (row.state === "available" || row.state === "archived") && (
                  <button
                    type="button"
                    className="mt-1 w-full whitespace-normal [overflow-wrap:anywhere] sm:w-auto rounded-md border border-border px-3 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => onOpenThread(row.threadId)}
                  >
                    Open thread {row.threadId}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {view.truncated && <p>Only the first 50 exact-thread rows are shown.</p>}
        </>
      )}
    </section>
  );
}
