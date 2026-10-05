// Synthetic UI only. No SDK, host state, credentials or transcripts.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QuotaDashboard } from "../src/quota/quota-view.js";
import { HistoryReadinessPanel } from "../src/history/history-view.js";
import type { HistoryReadiness } from "../src/history/history-contract.js";
export const syntheticHistory: HistoryReadiness = {
  state: "available",
  reason: "ok",
  storage: "compatible",
  collector: "compatible-v1",
  writer: "observed",
  collection: {
    enabled: true,
    firstObservedAt: "2026-10-01T00:00:00.000Z",
    pauseCount: 0,
    backlog: false,
    invalidRecords: 0,
    unconfirmedEvents: 0,
    conflictingEntries: 0,
    workspaces: [
      { workspace: "/synthetic/shared/" + "long-path-".repeat(12), totalTokens: 18, events: 6 },
    ],
    truncated: false,
    attribution: {
      discovery: "complete",
      backlog: false,
      grades: [
        { grade: "exact-thread", totalTokens: 12, events: 4 },
        { grade: "workspace-only", totalTokens: 3, events: 1 },
        { grade: "ambiguous", totalTokens: 3, events: 1 },
        { grade: "unattributed", totalTokens: 0, events: 0 },
      ],
      threads: [
        {
          threadId: "thr_exact",
          label: "Synthetic verified title " + "long-title-".repeat(16),
          state: "available",
          totalTokens: 3,
          events: 1,
        },
        {
          threadId: "thr_archived",
          label: "Archived thread thr_archived",
          state: "archived",
          totalTokens: 3,
          events: 1,
        },
        {
          threadId: "thr_deleted",
          label: "Deleted thread thr_deleted",
          state: "deleted",
          totalTokens: 3,
          events: 1,
        },
        {
          threadId: "thr_missing",
          label: "Unavailable thread thr_missing",
          state: "missing",
          totalTokens: 3,
          events: 1,
        },
      ],
      truncated: false,
    },
  },
};
function Preview() {
  const [hostId, setHostId] = useState<string | null>("synthetic-host");
  return (
    <>
      <p>Synthetic attribution preview. No installed acceptance.</p>
      <QuotaDashboard
        now={Date.now()}
        selectedHostId={hostId}
        hosts={[
          { id: "synthetic-host", name: "Synthetic host", status: "connected" },
          { id: "partial-host", name: "Partial host", status: "connected" },
        ]}
        onHostChange={setHostId}
        onRefresh={() => {}}
        view={{ state: "unavailable", reason: "auth-required", snapshot: null }}
        history={
          <HistoryReadinessPanel
            selection={{ hostId, generation: 1 }}
            read={async () =>
              hostId === "partial-host"
                ? {
                    ...syntheticHistory,
                    collection: {
                      ...syntheticHistory.collection!,
                      attribution: {
                        discovery: "partial",
                        backlog: true,
                        grades: [],
                        threads: [],
                        truncated: false,
                      },
                    },
                  }
                : syntheticHistory
            }
            onOpenThread={(id) => {
              document.body.dataset.openedThread = id;
            }}
          />
        }
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
