import { createRoot } from "react-dom/client";
import { useState } from "react";
import { CalendarReportPanel } from "../src/history/calendar/calendar-panel.js";
import { MachineReportPanel } from "../src/machines/report-view.js";
import type { CalendarQuery, CalendarSnapshot } from "../src/history/calendar/calendar-contract.js";
import type { MachineReports } from "../src/machines/machines-contract.js";

declare const __SPEED_REPORTS__: CalendarSnapshot[];
const reports = __SPEED_REPORTS__;
const now = Date.parse("2026-10-01T12:00:00Z");
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args: [] | [string | number]) {
    super(args.length ? args[0] : now);
  }
  static now() {
    return now;
  }
} as DateConstructor;
const state = new URLSearchParams(location.search).get("state");
const calls: string[] = [],
  pending: (() => void)[] = [];
let first = true;
let retryBlocked = state === "retry";
function report(query: CalendarQuery) {
  const value = reports.find(
    (value) => value.query.startDate === query.startDate && value.query.group === query.group,
  );
  if (!value) throw Error("Fixture query unavailable");
  return structuredClone(value);
}
async function read(query: CalendarQuery) {
  calls.push(JSON.stringify(query));
  if (first && state === "loading") await new Promise<void>((resolve) => pending.push(resolve));
  if (retryBlocked) {
    first = false;
    return { state: "unavailable" as const, reason: "host-offline" as const };
  }
  first = false;
  return report(query);
}
const settled = async () => ({ state: "settled" as const, progress: "backend-fixture" });
function Preview() {
  const [scope, setScope] = useState(new URLSearchParams(location.search).get("scope") ?? "all");
  return (
    <main className="mx-auto max-w-5xl p-5 text-foreground">
      <h1 className="text-xl font-semibold">Recorded speed fixture</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Native tiers are forward-format policy fixtures, not current Codex persistence evidence.
      </p>
      <nav aria-label="Fixture machine scope" className="mt-3 flex flex-wrap gap-3">
        <button onClick={() => setScope("all")} aria-pressed={scope === "all"}>
          All machines
        </button>
        <button onClick={() => setScope("host")} aria-pressed={scope === "host"}>
          Host fixture
        </button>
        <button onClick={() => pending.splice(0).forEach((resolve) => resolve())}>
          Release loading
        </button>
        {state === "retry" && (
          <button
            onClick={() => {
              retryBlocked = false;
            }}
          >
            Reconnect fixture
          </button>
        )}
      </nav>
      {scope === "host" ? (
        <CalendarReportPanel
          now={now}
          selection={{ hostId: "host_fixture", generation: 1 }}
          prepare={settled}
          read={({ query }) => read(query)}
        />
      ) : (
        <MachineReportPanel
          now={now}
          prepare={settled}
          read={async ({ query }): Promise<MachineReports> => {
            const result = await read(query);
            return {
              machines: ["a", "b"].map((id) => ({
                machine: {
                  id: `host_${id}`,
                  name: `Host ${id.toUpperCase()}`,
                  status: state === "offline" && id === "b" ? "disconnected" : "connected",
                },
                cached: state === "offline" && id === "b",
                preparation: { state: "settled", progress: "backend-fixture" },
                report: result,
              })),
              truncated: false,
              cache: "saved",
            };
          }}
        />
      )}
    </main>
  );
}
Object.assign(window, { speedFixture: { calls, reports } });
createRoot(document.getElementById("root")!).render(<Preview />);
