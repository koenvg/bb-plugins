import { createRoot } from "react-dom/client";
import { QuotaDashboard } from "../src/quota/quota-view.js";
import { HistoryReadinessPanel } from "../src/history/history-view.js";
import type { ImportView } from "../src/history/import/import-contract.js";
const view: ImportView = {
  reason: "ok",
  configuration: {
    bbRoot: "/synthetic/custom-bb-root",
    ordinaryRoots: ["/synthetic/pi/workspace-sessions"],
    workspaces: ["/synthetic/workspace/" + "long-path-".repeat(12)],
  },
  generation: {
    id: "00000000-0000-4000-8000-000000000022",
    state: "stopped",
    startAt: "2026-06-24T00:00:00.000Z",
    endAt: "2026-10-03T00:00:00.000Z",
    workspaces: ["/synthetic/workspace/" + "long-path-".repeat(12)],
    sourceRoots: [
      "/synthetic/resolved-custom-bb-root/" + "long-root-".repeat(12),
      "/synthetic/pi/workspace-sessions",
    ],
    candidates: 256,
    finished: 32,
    bytes: 8388608,
    records: 100,
    replayed: 20,
    omissions: 2,
    coverage: "partial",
    diagnostics: ["unresolved-ancestry", "oversize-record"],
  },
};
createRoot(document.getElementById("root")!).render(
  <QuotaDashboard
    now={Date.now()}
    selectedHostId="synthetic-host"
    hosts={[{ id: "synthetic-host", name: "Synthetic host", status: "connected" }]}
    onHostChange={() => {}}
    onRefresh={() => {}}
    view={{ state: "unavailable", reason: "auth-required", snapshot: null }}
    history={
      <HistoryReadinessPanel
        selection={{ hostId: "synthetic-host", generation: 1 }}
        read={async () => ({
          state: "not-configured",
          reason: "not-configured",
          storage: "compatible",
          collector: "missing",
          writer: "unconfirmed",
        })}
        importCall={async (input) => {
          document.body.dataset.action = input.command.action;
          return view;
        }}
      />
    }
  />,
);
