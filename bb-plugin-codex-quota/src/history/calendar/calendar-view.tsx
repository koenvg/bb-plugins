import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import type { ModelSeries } from "./calendar-models.js";
import type { CostSeries } from "./calendar-model-costs.js";
import { displayValue, subtotalText } from "./calendar-tooltip.js";
export { UsageTooltip } from "./calendar-tooltip.js";
import { CalendarChart } from "./calendar-tanstack.js";
import type { CalendarSnapshot } from "./calendar-contract.js";
import { pricingLabel } from "./calendar-money-view.js";
import {
  chartData,
  coverageLabel,
  metricName,
  recordedValue,
  tokenCategories,
  tokenBreakdown,
  type CalendarDay,
  type TokenMetric,
} from "./calendar-chart-data.js";
export type { TokenMetric } from "./calendar-chart-data.js";
export { coverageLabel } from "./calendar-chart-data.js";
export const reportControl =
  "h-9 pointer-coarse:h-11 rounded-md border border-border leading-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";
export const reportButton = `${reportControl} inline-flex items-center justify-center px-3`;
const exact = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 0 });
const billingLimit = "Captured estimate, not billed charges.";
const isMoney = (metric: TokenMetric) => metric === "cost" || metric === "cost-per-entity";
function usageFacts(day: CalendarDay, metric: TokenMetric) {
  return {
    value: displayValue(day, metric),
    coverage: coverageLabel(day),
    pricing: isMoney(metric) ? pricingLabel(day.money) : null,
    exclusions: `${exact(day.excludedTokens)} excluded tokens`,
  };
}
type SeriesSelection = { query: string; hidden: ReadonlySet<string> };
function seriesId(series: ModelSeries | CostSeries): string {
  if ("selectionId" in series) return series.selectionId;
  if (series.model !== undefined) return JSON.stringify(["tokens", "model", series.model]);
  if (series.key === "other" || series.key === "unknown")
    return JSON.stringify(["tokens", series.key]);
  throw Error("Unrecognized model bucket");
}
const graphFilterHelp =
  "Graph filters affect bars only. Recorded totals and table include all series. Uncertain estimates are not filtered.";
const legendButton =
  "inline-flex min-w-0 pointer-coarse:min-w-[44px] pointer-coarse:min-h-[44px] max-w-full items-center gap-2 m-0 appearance-none border-0 bg-transparent p-0 text-left [font:inherit] [color:inherit] focus-visible:outline-2 focus-visible:outline-ring";
export function CalendarValues({
  view,
  metric,
}: {
  view: Pick<CalendarSnapshot, "query" | "days"> & { state?: CalendarSnapshot["state"] };
  metric: TokenMetric;
}) {
  const query = JSON.stringify(view.query);
  const helpId = useId();
  const group = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const lastToggled = useRef<string | null>(null);
  const restoreButton = useRef<HTMLButtonElement | null>(null);
  const removedFocusedRestore = useRef(false);
  const restoreRef = useCallback((node: HTMLButtonElement | null) => {
    if (!node && restoreButton.current === document.activeElement)
      removedFocusedRestore.current = true;
    restoreButton.current = node;
  }, []);
  const [selection, setSelection] = useState<SeriesSelection>(() => ({ query, hidden: new Set() }));
  const hidden = selection.query === query ? selection.hidden : new Set<string>();
  if (selection.query !== query) setSelection({ query, hidden: new Set() });
  const toggle = (id: string) => {
    lastToggled.current = id;
    setSelection((previous) => {
      const next = new Set(previous.query === query ? previous.hidden : []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { query, hidden: next };
    });
  };
  const data = chartData(view.days, metric);
  const { rows, models } = data;
  const entries = models.map((series) => {
    const id = seriesId(series);
    return { id, series, hidden: hidden.has(id) };
  });
  const metricPrefix = `["${metric}",`;
  const hasSelection = [...hidden].some((id) => id.startsWith(metricPrefix));
  const stacked = metric === "tokens" || metric === "cost";
  const seriesName = metric === "cost" ? "model cost" : "model";
  const currentHiddenCount = entries.filter((entry) => entry.hidden).length;
  const allCurrentHidden = entries.length > 0 && currentHiddenCount === entries.length;
  const focusSeries = () => {
    const last =
      lastToggled.current === null ? undefined : buttons.current.get(lastToggled.current);
    const target = last ?? buttons.current.get(entries[0]?.id) ?? group.current;
    target?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (
      removedFocusedRestore.current &&
      !restoreButton.current &&
      document.activeElement === document.body
    ) {
      focusSeries();
    }
    removedFocusedRestore.current = false;
  });
  return (
    <div
      className="mt-4 min-w-0 text-muted-foreground"
      role="group"
      aria-label="Daily recorded values"
      ref={group}
      tabIndex={-1}
    >
      <CalendarChart
        data={data}
        visibleModels={entries.filter((entry) => !entry.hidden).map((entry) => entry.series)}
        metric={metric}
        includeUncertain={!!view.query.includeUncertain}
        helpId={stacked ? helpId : undefined}
      />
      {stacked && (
        <>
          <p
            role="group"
            aria-label="Models"
            aria-describedby={helpId}
            className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs [overflow-wrap:anywhere]"
          >
            {entries.map(({ id, series, hidden }) => (
              <button
                type="button"
                key={id}
                ref={(node) => {
                  if (node) buttons.current.set(id, node);
                  else buttons.current.delete(id);
                }}
                aria-pressed={!hidden}
                aria-label={
                  series.model === "Unknown model" || series.model === "Other models"
                    ? `${series.label} named model`
                    : undefined
                }
                onClick={() => toggle(id)}
                className={legendButton}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: series.color }}
                />
                <span className={`min-w-0${hidden ? " line-through" : ""}`}>{series.label}</span>
              </button>
            ))}
            {metric === "tokens" &&
              view.query.includeUncertain &&
              view.days.some((day) => (day.uncertain?.totalTokens ?? 0) > 0) && (
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 border border-dashed border-muted-foreground bg-muted"
                  />
                  Uncertain estimate
                </span>
              )}
            {hasSelection && (
              <button
                type="button"
                ref={restoreRef}
                className={legendButton}
                onClick={() => {
                  if (restoreButton.current === document.activeElement) focusSeries();
                  setSelection({
                    query,
                    hidden: new Set([...hidden].filter((id) => !id.startsWith(metricPrefix))),
                  });
                }}
              >
                Restore all series
              </button>
            )}
          </p>
          <p id={helpId} className="sr-only">
            {graphFilterHelp}
          </p>
          <p
            role="status"
            aria-live="polite"
            className={allCurrentHidden ? "mt-1 text-xs" : "sr-only"}
          >
            {models.length === 0
              ? `No recorded ${seriesName} series.`
              : allCurrentHidden
                ? `All ${seriesName} series hidden. Recorded usage is not zero.`
                : `${currentHiddenCount} ${seriesName} series hidden.`}
          </p>
        </>
      )}
      <div className="sr-only">
        <table aria-label="Daily recorded usage">
          <caption>
            Daily recorded usage in {view.query.timezone}.{" "}
            {view.state === "observed-inactivity"
              ? "Observed inactivity"
              : view.state === "unknown"
                ? "Unknown history"
                : "Partial history"}
            . {isMoney(metric) && billingLimit}
            {stacked && " Graph filters do not change this table."}
          </caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">{metricName(metric)}</th>
              {metric === "tokens" && (
                <>
                  {tokenCategories.map((series) => (
                    <th scope="col" key={series.key}>
                      {series.label} tokens
                    </th>
                  ))}
                  <th scope="col">Reasoning tokens (in output)</th>
                  <th scope="col">Unclassified tokens</th>
                </>
              )}
              {metric === "tokens" && view.query.includeUncertain && (
                <th scope="col">Uncertain token estimate</th>
              )}
              <th scope="col">Coverage</th>
              <th scope="col">Recorded exclusions</th>
              {isMoney(metric) && <th scope="col">Pricing</th>}
              {stacked &&
                models.map((series) => (
                  <th scope="col" key={series.key}>
                    {series.label} {metric === "cost" ? "USD estimate and pricing" : "tokens"}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {view.days.map((day) => {
              const facts = usageFacts(day, metric);
              const classes = tokenBreakdown(day);
              return (
                <tr key={day.date}>
                  <th scope="row">{day.date}</th>
                  <td>{facts.value}</td>
                  {metric === "tokens" && (
                    <>
                      {(["input", "output", "cacheRead", "cacheWrite", "reasoning"] as const).map(
                        (key) => (
                          <td key={key}>
                            {classes.state === "available" ? exact(classes[key]) : "Unavailable"}
                          </td>
                        ),
                      )}
                      <td>
                        {recordedValue(day, "tokens") === null
                          ? "Unavailable"
                          : exact(classes.unclassified)}
                      </td>
                    </>
                  )}
                  {metric === "tokens" && view.query.includeUncertain && (
                    <td>{exact(day.uncertain?.totalTokens ?? 0)}</td>
                  )}
                  <td>{facts.coverage}</td>
                  <td>{facts.exclusions}</td>
                  {facts.pricing && <td>{facts.pricing}</td>}
                  {stacked &&
                    models.map((series) => {
                      const value = rows.find((row) => row.date === day.date)?.modelFacts[
                        series.key
                      ];
                      return (
                        <td key={series.key}>
                          {metric === "cost"
                            ? subtotalText(
                                rows.find((row) => row.date === day.date)!.costFacts[series.key],
                              )
                            : value === null || value === undefined
                              ? "Unavailable"
                              : exact(value)}
                        </td>
                      );
                    })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
