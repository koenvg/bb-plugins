import { useEffect, useRef } from "react";
import { projectTokenModels, type ModelSeries } from "./calendar-models.js";
import { tokenCountText } from "../../token-counts.js";
import { capturedEstimate } from "./calendar-money-view.js";
import {
  dateLabel,
  metricName,
  recordedValue,
  tokenCategories,
  tokenBreakdown,
  type CalendarDay,
  type TokenMetric,
} from "./calendar-chart-data.js";
const exact = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 0 });
export function displayValue(day: CalendarDay, metric: TokenMetric) {
  const value = recordedValue(day, metric);
  return value === null
    ? "Unavailable"
    : metric === "cost" || metric === "cost-per-entity"
      ? capturedEstimate(value)
      : exact(value);
}
export function UsageTooltip({
  day,
  metric,
  maxWidth,
  modelView,
  pinned = false,
}: {
  day: CalendarDay;
  metric: TokenMetric;
  modelView?: { series: ModelSeries[]; values: Record<string, number | null> };
  maxWidth?: number;
  pinned?: boolean;
}) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = card.current;
    if (pinned && element && element.scrollHeight > element.clientHeight)
      element.focus({ preventScroll: true });
  }, [pinned]);
  const recorded = recordedValue(day, metric);
  const projection = modelView ? null : projectTokenModels([day]);
  const modelSeries = modelView?.series ?? projection!.series;
  const modelValues = modelView?.values ?? projection!.facts[0];
  const positiveModels = modelSeries.filter((series) => (modelValues[series.key] ?? 0) > 0);
  const tokens = metric === "tokens" && recorded !== null ? tokenCountText(recorded) : null;
  const value = tokens?.readable ?? displayValue(day, metric);
  const classes = tokenBreakdown(day);
  const reasoning = tokenCountText(classes.state === "available" ? classes.reasoning : 0);
  const unclassified = tokenCountText(classes.unclassified);
  const uncertain = tokenCountText(day.uncertain?.totalTokens ?? 0);
  const excluded = tokenCountText(day.excludedTokens);
  const hasUncertain = metric === "tokens" && (day.uncertain?.totalTokens ?? 0) > 0;
  const row = "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1";
  return (
    <div
      role="tooltip"
      ref={card}
      tabIndex={pinned ? -1 : undefined}
      style={{ maxWidth }}
      className="max-h-[calc(100dvh-16px)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-md [overflow-wrap:anywhere]"
    >
      <p className="font-medium">
        <time dateTime={day.date}>{dateLabel(day.date)}</time>
      </p>
      <dl className="mt-2 space-y-2">
        <div className={row}>
          <dt className="text-muted-foreground">
            {metric === "tokens" ? "Recorded tokens" : metricName(metric)}
          </dt>
          <dd
            className="text-sm font-semibold tabular-nums"
            title={tokens ? `${tokens.exact} tokens` : undefined}
          >
            {value}
          </dd>
        </div>
        {metric === "tokens" &&
          (classes.state === "available" ? (
            <>
              {tokenCategories.map((series) => {
                const text = tokenCountText(classes[series.key]);
                return (
                  <div className={row} key={series.key}>
                    <dt className="inline-flex items-center gap-2 text-muted-foreground">
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: series.color }}
                      />
                      {series.label} tokens
                    </dt>
                    <dd className="tabular-nums" title={`${text.exact} tokens`}>
                      {text.readable}
                    </dd>
                  </div>
                );
              })}
              {classes.reasoning > 0 && (
                <div className={row}>
                  <dt className="text-muted-foreground">Reasoning tokens (in output)</dt>
                  <dd className="tabular-nums" title={`${reasoning.exact} tokens`}>
                    {reasoning.readable}
                  </dd>
                </div>
              )}
            </>
          ) : (
            <div className={row}>
              <dt className="text-muted-foreground">Token breakdown</dt>
              <dd>Unavailable</dd>
            </div>
          ))}
        {metric === "tokens" && classes.unclassified > 0 && (
          <div className={row}>
            <dt className="text-muted-foreground">Unclassified tokens</dt>
            <dd className="tabular-nums" title={`${unclassified.exact} tokens`}>
              {unclassified.readable}
            </dd>
          </div>
        )}
        {hasUncertain && (
          <div className={row}>
            <dt className="text-muted-foreground">Uncertain estimate</dt>
            <dd className="tabular-nums" title={`${uncertain.exact} tokens`}>
              {uncertain.readable} tokens
            </dd>
          </div>
        )}
        {!!day.excludedTokens && (
          <div className={row}>
            <dt className="text-muted-foreground">Excluded tokens</dt>
            <dd className="tabular-nums" title={`${excluded.exact} tokens`}>
              {excluded.readable}
            </dd>
          </div>
        )}
      </dl>
      {metric === "tokens" &&
        positiveModels.some(
          (series) => series.model || series.key.startsWith("other") || series.speed !== "normal",
        ) && (
          <div className="mt-3 border-t border-border pt-2" aria-label="Tokens by model and speed">
            <p className="font-medium">Tokens by model and speed</p>
            <ul className="mt-2 space-y-2">
              {positiveModels.map((series) => {
                const text = tokenCountText(modelValues[series.key] ?? 0);
                return (
                  <li key={series.key} className={row}>
                    <span className="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: series.color }}
                      />
                      {series.label}
                    </span>
                    <span className="tabular-nums" title={`${text.exact} tokens`}>
                      {text.readable}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
    </div>
  );
}
