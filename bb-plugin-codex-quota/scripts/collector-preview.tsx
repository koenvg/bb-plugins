// Isolated synthetic preview. No host, credentials, transcripts, installation or network.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QuotaDashboard } from "../quota-view.js";
import { AccountActivity } from "../activity-view.js";
import { HistoryReadinessPanel } from "../history-view.js";
import type { HistoryReadiness } from "../history-contract.js";
const missing: HistoryReadiness = { state: "not-configured", reason: "not-configured", storage: "unconfigured", collector: "missing", writer: "unconfirmed" };
const parameters = new URLSearchParams(location.search);
const previewState = parameters.get("state") ?? "recovered";
const legacyPhase = parameters.get("legacy");
let history: HistoryReadiness = missing;
const now = Date.now();
function Preview() {
  const [hostId, setHostId] = useState<string | null>("synthetic-host");
  return <><p className="px-5 py-2 text-sm">Synthetic collector preview. No live installed acceptance.</p>
    <QuotaDashboard now={now} view={{ state: "fresh", reason: "ok", snapshot: {
      observedAt: new Date(now).toISOString(), plan: "plus", general: [{ id: "primary_window", name: "5 hours", remainingPercent: 42, resetAt: new Date(now+3600000).toISOString() }],
      additional: [], bindingWindowId: "primary_window", bindingRemainingPercent: 42, bankedResets: 0,
    } }} selectedHostId={hostId} hosts={[{ id: "synthetic-host", name: "Synthetic host", status: "connected" }]} onHostChange={setHostId} onRefresh={() => {}}
      history={<HistoryReadinessPanel selection={{ hostId, generation: 1 }} read={async () => history} control={async ({action, confirmation}) => {
        if (confirmation) document.body.dataset.legacyConfirmation = JSON.stringify(confirmation);
        document.body.dataset.collectorActions = String(Number(document.body.dataset.collectorActions ?? "0")+1);
        history = { state: "available", reason: "ok", storage: "compatible", collector: "compatible-v1", writer: "observed", collection: {
          enabled: action !== "pause" && action !== "prepare-legacy" && action !== "retire-legacy", firstObservedAt: "2026-10-01T00:00:00.000Z", pauseCount: 1, backlog: true, invalidRecords: 2, unconfirmedEvents: 3, conflictingEntries: 1,
          workspaces: [{ workspace: "/synthetic/shared-workspace/" + "long-path-".repeat(16), totalTokens: Number.MAX_SAFE_INTEGER, events: 2 }], truncated: false,
        }, health: { state: "recovered", detailFrom: "2026-08-17T12:00:00.000Z", compactFrom: "2026-06-22T00:00:00.000Z", pending: true, legacyLogsPending: true, recoveryGaps: [{ start: "2026-06-22T00:00:00.000Z", end: "2026-10-01T12:00:00.000Z" }] } };
        if (previewState === "healthy" || previewState === "maintenance") history.health={...history.health!,state:previewState,pending:previewState === "maintenance",legacyLogsPending:previewState === "maintenance",recoveryGaps:[]};
        if (history.health && (legacyPhase || action === "prepare-legacy" || action === "retire-legacy")) {
          const phase = action === "prepare-legacy" ? "awaiting-confirmation" : action === "retire-legacy" ? "ingesting" : legacyPhase;
          if (["required", "awaiting-confirmation", "ingesting", "retaining", "complete", "blocked"].includes(phase!)) {
            history.health.legacyRetirement = { phase: phase as NonNullable<NonNullable<HistoryReadiness["health"]>["legacyRetirement"]>["phase"],
              ...(phase === "awaiting-confirmation" ? { token: "00000000-0000-4000-8000-000000000123", expiresAt: new Date(now + 15 * 60000).toISOString() } : {}),
              ...(phase === "blocked" ? { reason: "source-changed" as const } : {}) };
            if (phase === "blocked") { history.state = "unavailable"; history.reason = "retirement-incomplete"; }
            history.collection!.enabled = false;
            history.health.legacyLogsPending = phase !== "complete";
          }
        }
        if (previewState === "unavailable" || previewState === "incompatible") history={state:"unavailable",reason:previewState === "incompatible" ? "storage-incompatible":"storage-unavailable",storage:previewState === "incompatible" ? "incompatible":"unavailable",collector:"compatible-v1",writer:"unconfirmed"};
        return history;
      }} />}>
      <AccountActivity selection={{hostId, generation:1}} read={async () => ({state:"unavailable",reason:"unsupported",snapshot:null})} />
    </QuotaDashboard></>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
