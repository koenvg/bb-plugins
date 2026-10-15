import { useMemo, useState } from "react";
import { definePluginApp, useBbNavigate } from "@get-bb/plugin-sdk/app";
import { projectOutputRates } from "./output-rate";
import { OutputRateChart } from "./output-rate-chart";
import { smoothSeconds } from "./timing";
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
  const status = disconnected
    ? "Disconnected"
    : !snapshot || snapshot.coverage === "starting"
      ? "Starting"
      : snapshot.coverage === "degraded"
        ? "Degraded"
        : snapshot.streamingThreads === 0
          ? "Idle"
          : "Live";
  const view = useMemo(
    () =>
      projectOutputRates(
        snapshot ? { startedAt: snapshot.startedAt, samples: snapshot.samples } : null,
        { window: windowSize, unit },
      ),
    [snapshot, windowSize, unit],
  );
  const { rate, peak, unitLabel } = view;
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
          <OutputRateChart view={view} availability={disconnected ? "stale" : "connected"} />
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
            <Stat
              label={`Peak ${unitLabel} · last 10m`}
              value={peak !== null ? format(peak) : "—"}
            />
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
