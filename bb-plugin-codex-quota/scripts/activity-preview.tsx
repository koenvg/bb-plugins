// Isolated synthetic preview only. No BB connection, auth, collectors, transcript reads, or live network.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QuotaDashboard } from "../src/quota/quota-view.js";
import { AccountActivity } from "../src/activity/activity-view.js";
import { normalizeActivity } from "../src/activity/activity.js";
import type { ActivityApi } from "../src/activity/activity-request-state.js";
import { HistoryReadinessPanel } from "../src/history/history-view.js";
const now = Date.now();
let activityCalls = 0;
const read: ActivityApi = async () => {
  activityCalls++;
  document.body.dataset.activityCalls = String(activityCalls);
  return {
    state: "fresh",
    reason: "ok",
    snapshot: normalizeActivity(
      {
        stats: {
          lifetime_tokens: Number.MAX_SAFE_INTEGER,
          peak_daily_tokens: 150000,
          longest_running_turn_sec: 12.5,
          current_streak_days: 4,
          daily_usage_buckets: Array.from({ length: 30 }, (_, index) => ({
            date: new Date(Date.UTC(2026, 8, index + 1)).toISOString().slice(0, 10),
            tokens: Number.MAX_SAFE_INTEGER,
          })),
        },
      },
      now,
    ),
  };
};
function Preview() {
  const [hostId, setHostId] = useState<string | null>("synthetic-host");
  return (
    <>
      <p className="bg-accent px-5 py-2 text-sm">
        Synthetic preview. No live installed acceptance.
      </p>
      <QuotaDashboard
        now={now}
        view={{
          state: "fresh",
          reason: "ok",
          snapshot: {
            observedAt: new Date(now).toISOString(),
            plan: "plus",
            general: [
              { id: "primary_window", name: "5 hours", remainingPercent: 42, resetAt: null },
            ],
            additional: [],
            bindingWindowId: "primary_window",
            bindingRemainingPercent: 42,
            bankedResets: 0,
          },
        }}
        selectedHostId={hostId}
        hosts={[{ id: "synthetic-host", name: "Synthetic host", status: "connected" }]}
        onHostChange={setHostId}
        onRefresh={() => {}}
        history={
          <HistoryReadinessPanel
            selection={{ hostId, generation: 1 }}
            read={async () => ({
              state: "not-configured",
              reason: "not-configured",
              storage: "unconfigured",
              collector: "missing",
              writer: "unconfirmed",
            })}
          />
        }
      >
        <AccountActivity selection={{ hostId, generation: 1 }} read={read} />
      </QuotaDashboard>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
