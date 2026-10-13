import { useEffect, useState } from "react";
import {
  definePluginApp,
  useBbNavigate,
  useRealtimeConnectionState,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { OutputSnapshot, rpcContract } from "./contract";

type WindowSize = 1 | 5;
type Unit = "tokens" | "bytes";
const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const buttonClass =
  "rounded-md px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:bg-muted aria-pressed:text-foreground text-muted-foreground";

function LiveOutput() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const connection = useRealtimeConnectionState();
  const [snapshot, setSnapshot] = useState<OutputSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [receivedAt, setReceivedAt] = useState(Date.now);
  const [windowSize, setWindowSize] = useState<WindowSize>(5);
  const [unit, setUnit] = useState<Unit>("tokens");

  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (!active || pending) return;
      pending = true;
      try {
        const next = await rpc.call("snapshot");
        if (active) {
          setSnapshot(next);
          setFailed(false);
          setNow(Date.now());
          setReceivedAt(Date.now());
        }
      } catch {
        if (active) setFailed(true);
      } finally {
        pending = false;
      }
    };
    const timer = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 1000);
    void refresh();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [rpc]);

  const disconnected =
    failed ||
    connection === "reconnecting" ||
    now - receivedAt > 5000 ||
    (snapshot !== null && connection !== "connected");
  const status = disconnected
    ? "Disconnected"
    : !snapshot || snapshot.coverage === "starting"
      ? "Starting"
      : snapshot.coverage === "degraded"
        ? "Degraded"
        : snapshot.streamingThreads === 0
          ? "Idle"
          : "Live";
  const divisor = unit === "tokens" ? 4 : 1;
  const rate = (value: Pick<OutputSnapshot, "rawBytesPerSecond" | "smoothBytesPerSecond">) =>
    (windowSize === 1 ? value.rawBytesPerSecond : value.smoothBytesPerSecond) / divisor;
  const values = snapshot?.samples.map(rate) ?? Array<number>(60).fill(0);
  const peak = Math.max(...values, 0);
  const maximum = Math.max(peak * 1.2, unit === "tokens" ? 20 : 80);
  const y = (value: number) => 190 - (value / maximum) * 160;
  const line = values
    .map((value, index) => `${index ? "L" : "M"}${(index * 960) / 59},${y(value)}`)
    .join(" ");
  const unitLabel = unit === "tokens" ? "est. tokens/s" : "bytes/s";
  const notice = disconnected
    ? "Live updates stopped. The last graph is stale and incomplete."
    : status === "Starting"
      ? "Discovering threads. Output before plugin startup is excluded."
      : status === "Degraded"
        ? "Coverage is incomplete. Discovery or event reads are behind or failed."
        : status === "Idle"
          ? "No observed output in the last five complete seconds. Collection is live."
          : "Real BB events. Output before plugin startup is excluded.";

  return (
    <main className="h-full overflow-auto p-4 text-foreground md:p-6">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">Observed output across all BB threads</p>
          <p role="status" className="text-sm font-medium">
            {status}
          </p>
        </div>
        <section
          aria-label="Live output rate"
          className="rounded-xl border border-border bg-card p-4 md:p-6"
        >
          <div className="flex flex-wrap justify-between gap-3">
            <div
              role="group"
              aria-label="Rate window"
              className="flex rounded-lg border border-border p-1"
            >
              <button
                type="button"
                className={buttonClass}
                aria-pressed={windowSize === 1}
                onClick={() => setWindowSize(1)}
              >
                Raw · 1 second
              </button>
              <button
                type="button"
                className={buttonClass}
                aria-pressed={windowSize === 5}
                onClick={() => setWindowSize(5)}
              >
                Smooth · 5 seconds
              </button>
            </div>
            <div
              role="group"
              aria-label="Rate unit"
              className="flex rounded-lg border border-border p-1"
            >
              <button
                type="button"
                className={buttonClass}
                aria-pressed={unit === "tokens"}
                onClick={() => setUnit("tokens")}
              >
                Est. tokens/s
              </button>
              <button
                type="button"
                className={buttonClass}
                aria-pressed={unit === "bytes"}
                onClick={() => setUnit("bytes")}
              >
                Bytes/s
              </button>
            </div>
          </div>
          <div className="mt-5 flex min-h-20 flex-wrap items-end justify-between gap-3">
            <p className="text-5xl font-semibold tabular-nums" aria-label="Current rate">
              <span>{snapshot && !disconnected ? format(rate(snapshot)) : "—"}</span>
              <span className="ml-2 text-sm font-normal text-muted-foreground">{unitLabel}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {windowSize === 1 ? "Raw 1-second buckets" : "5-second average"}
            </p>
          </div>
          <svg
            className="mt-4 h-60 w-full text-primary"
            viewBox="0 0 960 230"
            role="img"
            aria-label={`Observed output over the last sixty seconds in ${unitLabel}`}
          >
            {[0, 0.5, 1].map((fraction) => (
              <g key={fraction} className="text-muted-foreground">
                <line
                  x1="0"
                  x2="960"
                  y1={y(maximum * fraction)}
                  y2={y(maximum * fraction)}
                  stroke="currentColor"
                  opacity="0.2"
                />
                <text x="2" y={y(maximum * fraction) - 6} fill="currentColor" fontSize="11">
                  {format(maximum * fraction)}
                </text>
              </g>
            ))}
            <path d={`${line} L960,190 L0,190 Z`} fill="currentColor" opacity="0.12" />
            <path
              d={line}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <g className="text-muted-foreground" fill="currentColor" fontSize="11">
              <text x="0" y="224">
                60 seconds ago
              </text>
              <text x="960" y="224" textAnchor="end">
                Last complete second
              </text>
            </g>
          </svg>
          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 md:grid-cols-4">
            <Stat
              label="Threads streaming · last 5s"
              value={snapshot ? String(snapshot.streamingThreads) : "—"}
            />
            <Stat
              label="Threads discovered"
              value={snapshot ? String(snapshot.threadsDiscovered) : "—"}
            />
            <Stat
              label="Bytes observed since start"
              value={snapshot ? format(snapshot.totalBytes) : "—"}
            />
            <Stat label={`Peak ${unitLabel} · last 60s`} value={snapshot ? format(peak) : "—"} />
          </dl>
          <p className="mt-4 min-h-10 text-xs text-muted-foreground">
            {notice}
            {snapshot?.capacityLimited ? " The 10,000-thread memory limit was reached." : ""}
          </p>
        </section>
        <section aria-label="Recent contributors" className="space-y-3">
          <h2 className="text-sm font-medium">Recent contributors</h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="p-3 font-normal">Thread</th>
                  <th className="p-3 font-normal">Provider ID</th>
                  <th className="p-3 text-right font-normal">
                    {unitLabel} · {windowSize}s
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot?.contributors.length ? (
                  snapshot.contributors.map((thread) => (
                    <tr key={thread.id} className="border-t border-border">
                      <td className="p-3">
                        <button
                          type="button"
                          className="text-left underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                          onClick={() => navigate.toThread(thread.id)}
                        >
                          {thread.title}
                        </button>
                        <p className="mt-1 text-muted-foreground">
                          {thread.parentThreadId
                            ? `Child BB thread · parent ${thread.parentThreadId}`
                            : "Main BB thread"}
                          {thread.hidden ? " · hidden" : ""}
                          {thread.archived ? " · archived" : ""}
                        </p>
                        <p className="mt-1 text-muted-foreground">{thread.id}</p>
                      </td>
                      <td className="p-3 text-muted-foreground">{thread.providerId}</td>
                      <td className="p-3 text-right tabular-nums">
                        {disconnected ? "—" : format(rate(thread))}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="h-24 p-4 text-center text-muted-foreground">
                      {snapshot
                        ? "No output observed in the last minute."
                        : "Waiting for observed output."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <footer className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <p>
            Estimated tokens = UTF-8 delta bytes ÷ 4. This is observed output, not billing data.
            Counts streamed messages and visible reasoning text. Input, cache, hidden reasoning,
            tool output, reasoning summaries and tool-call generation are excluded.
          </p>
          <p>
            Rates use stored BB timestamps and complete one-second buckets. Notifications and
            provider batching can delay or bunch output. Provider IDs name the backend, not an agent
            role.
          </p>
          <p>
            {snapshot
              ? `${snapshot.deltas} deltas · ${snapshot.failures} read failures · ${snapshot.backlog} queued threads`
              : "No simulated data."}
          </p>
        </footer>
      </div>
    </main>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="text-lg tabular-nums">{value}</dd>
      <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}
export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "live-output",
    title: "Live Output",
    icon: "Activity",
    path: "live-output",
    component: LiveOutput,
  });
});
