import { useState } from "react";
import { projectTokenModels, type ModelSeries } from "./calendar-models.js";
import { tokenCountText } from "../../token-counts.js";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
} from "recharts";
import type { CalendarSnapshot } from "./calendar-contract.js";
import { capturedEstimate, pricingLabel } from "./calendar-money-view.js";
import {
  axisValue,
  chartData,
  coverageLabel,
  dateTick,
  dateLabel,
  weekdayTick,
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
function displayValue(day: CalendarDay, metric: TokenMetric) {
  const value = recordedValue(day, metric);
  return value === null
    ? "Unavailable"
    : metric === "cost" || metric === "cost-per-entity"
      ? capturedEstimate(value)
      : exact(value);
}
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
export function UsageTooltip({
  day,
  metric,
  maxWidth,
  modelView,
}: {
  day: CalendarDay;
  metric: TokenMetric;
  modelView?: { series: ModelSeries[]; values: Record<string, number | null> };
  maxWidth?: number;
}) {
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
      style={{ maxWidth }}
      className="w-80 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-md [overflow-wrap:anywhere]"
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
function CalendarDateTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
}) {
  if (!payload) return null;
  return (
    <text x={x} y={y} textAnchor="middle" fill="currentColor">
      <tspan x={x} fontSize={12} fontWeight={500}>
        {weekdayTick(payload.value)}
      </tspan>
      <tspan x={x} dy={16} fontSize={11}>
        {dateTick(payload.value)}
      </tspan>
    </text>
  );
}
function PositiveUsageMarkers({ rows }: Pick<ReturnType<typeof chartData>, "rows">) {
  const plot = usePlotArea();
  if (!plot) return null;
  // Mark the day, not each stack segment. Drawing coordinates and recorded facts stay proportional.
  return rows
    .filter((row) => (row.value ?? 0) > 0 && (row.height ?? 0) * plot.height < 2)
    .map((row) => (
      <ReferenceDot
        key={row.date}
        x={row.date}
        y={0}
        shape={({ cx = 0, cy = 0 }) => (
          <rect
            data-positive-usage={row.date}
            aria-hidden="true"
            x={cx - 3}
            y={cy - 2}
            width={6}
            height={2}
            fill="currentColor"
          />
        )}
      />
    ));
}
export function CalendarValues({
  view,
  metric,
}: {
  view: Pick<CalendarSnapshot, "query" | "days"> & { state?: CalendarSnapshot["state"] };
  metric: TokenMetric;
}) {
  const [chartWidth, setChartWidth] = useState(320);
  const { rows, maximum, models } = chartData(view.days, metric);
  const ticks = maximum < 4 ? [0, 1] : [0, 0.25, 0.5, 0.75, 1];
  return (
    <div
      className="mt-4 min-w-0 text-muted-foreground"
      role="group"
      aria-label="Daily recorded values"
    >
      <ResponsiveContainer
        onResize={setChartWidth}
        width="100%"
        height={280}
        minWidth={0}
        initialDimension={{ width: 320, height: 280 }}
      >
        <BarChart
          data={rows}
          margin={{ top: 14, right: 8, bottom: 8, left: chartWidth < 480 ? 16 : 24 }}
          accessibilityLayer
          aria-label={`Daily usage chart: ${metricName(metric)}`}
        >
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.16} />
          <XAxis
            dataKey="date"
            tickFormatter={dateTick}
            interval="preserveStartEnd"
            minTickGap={12}
            tickLine={false}
            axisLine={{ stroke: "currentColor", strokeOpacity: 0.3 }}
            tick={<CalendarDateTick />}
            tickMargin={8}
            height={46}
          />
          <YAxis
            domain={[0, 1]}
            ticks={ticks}
            width={chartWidth < 480 ? 64 : 84}
            tickFormatter={(value) => axisValue(value * maximum, metric)}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "currentColor", fontSize: 12 }}
            label={{
              value: metricName(metric),
              angle: -90,
              position: "left",
              offset: 8,
              fill: "currentColor",
              fontSize: 11,
            }}
          />
          <Tooltip
            position={chartWidth < 400 ? { x: 8 } : undefined}
            filterNull={false}
            cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
            content={({ active, label }) => {
              const day = active ? view.days.find((day) => day.date === label) : null;
              return day ? (
                <UsageTooltip
                  day={day}
                  metric={metric}
                  modelView={{
                    series: models,
                    values: rows.find((row) => row.date === day.date)!.modelFacts,
                  }}
                  maxWidth={Math.max(0, chartWidth - 16)}
                />
              ) : null;
            }}
          />
          {metric === "tokens" ? (
            models.map((series) => (
              <Bar
                key={series.key}
                stackId="tokens"
                dataKey={`modelHeights.${series.key}`}
                name={series.label}
                fill={series.color}
                maxBarSize={28}
                isAnimationActive={false}
              />
            ))
          ) : (
            <Bar
              stackId="tokens"
              dataKey="height"
              className="fill-primary"
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
              minPointSize={(_value, index) => ((rows[index]?.value ?? 0) > 0 ? 2 : 0)}
            />
          )}
          {metric === "tokens" && view.query.includeUncertain && (
            <Bar
              dataKey="uncertainHeight"
              stackId="tokens"
              fill="var(--muted)"
              stroke="var(--muted-foreground)"
              strokeDasharray="3 2"
              maxBarSize={28}
              isAnimationActive={false}
            />
          )}
          {metric === "tokens" && <PositiveUsageMarkers rows={rows} />}
        </BarChart>
      </ResponsiveContainer>
      {metric === "tokens" && (
        <p
          className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs [overflow-wrap:anywhere]"
          aria-label="Models"
        >
          {models.map((series) => (
            <span className="inline-flex min-w-0 max-w-full items-center gap-2" key={series.key}>
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: series.color }}
              />
              {series.label}
            </span>
          ))}
          {view.query.includeUncertain &&
            view.days.some((day) => (day.uncertain?.totalTokens ?? 0) > 0) && (
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 border border-dashed border-muted-foreground bg-muted"
                />
                Uncertain estimate
              </span>
            )}
        </p>
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
              {metric === "tokens" &&
                models.map((series) => (
                  <th scope="col" key={series.key}>
                    {series.label} tokens
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
                  {metric === "tokens" &&
                    models.map((series) => {
                      const value = rows.find((row) => row.date === day.date)?.modelFacts[
                        series.key
                      ];
                      return (
                        <td key={series.key}>
                          {value === null || value === undefined ? "Unavailable" : exact(value)}
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
