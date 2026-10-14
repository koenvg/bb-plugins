import { useEffect, useId, useRef, useState } from "react";
import { definePluginApp, useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { OutputSnapshot } from "./contract";

import { graphSeconds, smoothSeconds } from "./timing";
import { createOutputSnapshotHook, type OutputSnapshotHook } from "./use-output-snapshot";
import { createOutputFooter } from "./footer";
type WindowSize = 1 | typeof smoothSeconds;
type Unit = "tokens" | "bytes";
const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const buttonClass =
  "rounded-md px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:bg-muted aria-pressed:text-foreground text-muted-foreground";

function LiveOutput({ useSnapshot }: { useSnapshot: OutputSnapshotHook }) {
  const navigate = useBbNavigate();
  const { snapshot, disconnected } = useSnapshot();
  const [windowSize, setWindowSize] = useState<WindowSize>(smoothSeconds);
  const [unit, setUnit] = useState<Unit>("tokens");
  const [selectedSecond, setSelectedSecond] = useState<number | "latest" | null>(null);
  const readoutId = useId();
  const chartRef = useRef<SVGSVGElement>(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const resize = () => {
      const { width, height } = chart.getBoundingClientRect();
      setChartSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (selectedSecond === "latest" && snapshot && !disconnected) {
      setSelectedSecond(snapshot.samples.at(-1)!.second);
    }
  }, [selectedSecond, snapshot, disconnected]);
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
  const values = snapshot?.samples.map(rate) ?? Array<number>(graphSeconds).fill(0);
  const peak = Math.max(...values, 0);
  const maximum = Math.max(peak * 1.2, unit === "tokens" ? 20 : 80);
  const y = (value: number) => 190 - (value / maximum) * 160;
  const line = values
    .map((value, index) => `${index ? "L" : "M"}${(index * 960) / (graphSeconds - 1)},${y(value)}`)
    .join(" ");
  const unitLabel = unit === "tokens" ? "est. tokens/s" : "bytes/s";
  const selectedIndex =
    snapshot?.samples.findIndex((sample) => sample.second === selectedSecond) ?? -1;
  const selected =
    !disconnected && selectedIndex >= 0 ? snapshot?.samples[selectedIndex] : undefined;
  // Observe Escape only while a readout exists; leave host keyboard actions untouched.
  const tooltipVisible = Boolean(selected);
  useEffect(() => {
    if (!tooltipVisible) return;
    const document = chartRef.current?.ownerDocument;
    if (!document) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedSecond(null);
    };
    document.addEventListener("keydown", dismiss, true);
    return () => document.removeEventListener("keydown", dismiss, true);
  }, [tooltipVisible]);
  const selectedX = (selectedIndex * 960) / (graphSeconds - 1);
  const tooltipX = (selectedX / 960) * chartSize.width;
  const tooltipWidth = Math.max(0, Math.min(240, chartSize.width - 16));
  const tooltipLeft = Math.max(
    8,
    Math.min(Math.round(tooltipX + 12), chartSize.width - tooltipWidth - 8),
  );
  const tooltipY = ((selected ? y(rate(selected)) : 0) / 230) * chartSize.height;
  const tooltipAbove = tooltipY > chartSize.height / 2;
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
                aria-pressed={windowSize === smoothSeconds}
                onClick={() => setWindowSize(smoothSeconds)}
              >
                Smooth · 30 seconds
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
              {windowSize === 1 ? "Raw 1-second buckets" : "30-second average"}
            </p>
          </div>
          <div className="relative mt-4">
            <svg
              className="h-60 w-full text-primary focus-visible:outline-2 focus-visible:outline-ring"
              ref={chartRef}
              viewBox="0 0 960 230"
              preserveAspectRatio="none"
              role="img"
              aria-label={`Observed output over the last ten minutes in ${unitLabel}`}
              tabIndex={0}
              aria-describedby={`${readoutId}-help${selected ? ` ${readoutId}` : ""}`}
              onFocus={() => {
                setSelectedSecond(
                  snapshot && !disconnected ? snapshot.samples.at(-1)!.second : "latest",
                );
              }}
              onBlur={() => setSelectedSecond(null)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSelectedSecond(null);
                  return;
                }
                if (!snapshot || disconnected) return;
                const current = selectedIndex >= 0 ? selectedIndex : graphSeconds - 1;
                const target = new Map([
                  ["ArrowLeft", current - 1],
                  ["ArrowRight", current + 1],
                  ["Home", 0],
                  ["End", graphSeconds - 1],
                ]).get(event.key);
                if (target === undefined) return;
                event.preventDefault();
                setSelectedSecond(
                  snapshot.samples[Math.max(0, Math.min(graphSeconds - 1, target))]!.second,
                );
              }}
              onMouseMove={(event) => {
                if (!snapshot || disconnected) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                setChartSize((current) =>
                  current.width === bounds.width && current.height === bounds.height
                    ? current
                    : { width: bounds.width, height: bounds.height },
                );
                if (bounds.width <= 0) return;
                const fraction = Math.max(
                  0,
                  Math.min(1, (event.clientX - bounds.left) / bounds.width),
                );
                setSelectedSecond(
                  snapshot.samples[Math.round(fraction * (graphSeconds - 1))]!.second,
                );
              }}
              onMouseLeave={(event) => {
                if (event.currentTarget.ownerDocument.activeElement !== event.currentTarget)
                  setSelectedSecond(null);
              }}
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
              {selected && (
                <g aria-hidden="true" className="pointer-events-none">
                  <line
                    x1={selectedX}
                    x2={selectedX}
                    y1="30"
                    y2="190"
                    stroke="currentColor"
                    strokeDasharray="4 4"
                  />
                  <circle cx={selectedX} cy={y(rate(selected))} r="4" fill="currentColor" />
                </g>
              )}
            </svg>
            <div
              data-output-axes=""
              className="pointer-events-none absolute inset-0 text-muted-foreground tabular-nums"
              style={{ fontSize: "0.875rem", lineHeight: 1.25 }}
            >
              {[0, 0.5, 1].map((fraction) => (
                <span
                  key={fraction}
                  className="absolute left-0"
                  style={{
                    top: `${(y(maximum * fraction) / 230) * 100}%`,
                    transform: "translateY(calc(-100% - 6px))",
                  }}
                >
                  {format(maximum * fraction)}
                </span>
              ))}
              <div className="absolute inset-x-0 bottom-0 flex justify-between gap-2">
                <span>10 minutes ago</span>
                <span className="text-right">Last complete second</span>
              </div>
            </div>
            <span id={`${readoutId}-help`} className="sr-only">
              Use Left/Right to step through samples, Home/End for the edges, and Escape to dismiss
              the tooltip.
            </span>
            {selected && (
              <div
                id={readoutId}
                role="tooltip"
                className="pointer-events-none absolute z-10 rounded-md border border-border bg-popover p-2 text-xs text-popover-foreground shadow-lg"
                style={{
                  left: tooltipLeft,
                  width: 240,
                  top: `${Math.round(tooltipY + (tooltipAbove ? -12 : 12))}px`,
                  transform: tooltipAbove ? "translateY(-100%)" : undefined,
                  maxWidth: "calc(100% - 16px)",
                }}
              >
                <time
                  className="block truncate text-muted-foreground"
                  dateTime={new Date(selected.second * 1000).toISOString()}
                >
                  {new Date(selected.second * 1000).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
                <span className="block truncate font-medium tabular-nums">
                  {snapshot && (selected.second + 1) * 1000 <= snapshot.startedAt
                    ? "Before collection started"
                    : `${format(rate(selected))} ${unitLabel}`}
                </span>
                <span className="block text-muted-foreground">
                  {windowSize === 1 ? "Raw 1-second bucket" : "30-second average"}
                </span>
              </div>
            )}
          </div>
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
            <Stat label={`Peak ${unitLabel} · last 10m`} value={snapshot ? format(peak) : "—"} />
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
  const useSnapshot = createOutputSnapshotHook();
  const Page = () => <LiveOutput useSnapshot={useSnapshot} />;
  const footer = createOutputFooter(useSnapshot);
  app.experimental_sidebarFooter.register({
    id: "rate",
    kind: "action",
    label: "Live Output · estimated tokens/s · 30s average",
    icon: "live-output/gauge",
    onActivate: footer.activate,
  });
  app.slots.experimental_appOverlay({ id: "output-footer", component: footer.component });
  app.slots.navPanel({
    id: "live-output",
    title: "Live Output",
    icon: "live-output/gauge",
    path: "live-output",
    component: Page,
  });
});
