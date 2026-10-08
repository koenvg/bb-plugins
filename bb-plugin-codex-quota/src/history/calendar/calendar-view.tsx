import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  type CalendarDay,
  type TokenMetric,
} from "./calendar-chart-data.js";
export type { TokenMetric } from "./calendar-chart-data.js";
export { coverageLabel } from "./calendar-chart-data.js";
export const reportControl =
  "h-9 rounded-md border border-border leading-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";
export const reportButton = `${reportControl} inline-flex items-center justify-center px-3`;
const exact = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 20 });
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
}: {
  day: CalendarDay;
  metric: TokenMetric;
  maxWidth?: number;
}) {
  const value = displayValue(day, metric);
  const hasUncertain = metric === "tokens" && (day.uncertain?.totalTokens ?? 0) > 0;
  const row = "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1";
  return (
    <div
      role="tooltip"
      style={{ maxWidth }}
      className="w-72 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-md [overflow-wrap:anywhere]"
    >
      <p className="font-medium">
        <time dateTime={day.date}>{dateLabel(day.date)}</time>
      </p>
      <dl className="mt-2 space-y-2">
        <div className={row}>
          <dt className="text-muted-foreground">
            {metric === "tokens" ? "Recorded tokens" : metricName(metric)}
          </dt>
          <dd className="text-sm font-semibold tabular-nums">{value}</dd>
        </div>
        {hasUncertain && (
          <div className={row}>
            <dt className="text-muted-foreground">Uncertain estimate</dt>
            <dd className="tabular-nums">{exact(day.uncertain!.totalTokens)} tokens</dd>
          </div>
        )}
        {!!day.excludedTokens && (
          <div className={row}>
            <dt className="text-muted-foreground">Excluded tokens</dt>
            <dd className="tabular-nums">{exact(day.excludedTokens)}</dd>
          </div>
        )}
      </dl>
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
export function CalendarValues({ view, metric }: { view: CalendarSnapshot; metric: TokenMetric }) {
  const [chartWidth, setChartWidth] = useState(320);
  const { rows, maximum } = chartData(view.days, metric);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedDay = view.days.find((day) => day.date === selectedDate);
  const ticks =
    maximum < (metric === "cost" || metric === "cost-per-entity" ? 0.01 : 4)
      ? [0, 1]
      : [0, 0.25, 0.5, 0.75, 1];
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
          margin={{ top: 14, right: 8, bottom: 8, left: 24 }}
          accessibilityLayer
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
            width={80}
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
                <UsageTooltip day={day} metric={metric} maxWidth={Math.max(0, chartWidth - 16)} />
              ) : null;
            }}
          />
          <Bar
            stackId="tokens"
            dataKey="height"
            className="fill-primary"
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
            minPointSize={(_value, index) => ((rows[index]?.value ?? 0) > 0 ? 2 : 0)}
          />
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
        </BarChart>
      </ResponsiveContainer>
      {metric === "tokens" &&
        view.query.includeUncertain &&
        view.days.some((day) => (day.uncertain?.totalTokens ?? 0) > 0) && (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-2.5 rounded-sm bg-primary" />
              Recorded
            </span>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 border border-dashed border-muted-foreground bg-muted"
              />
              Uncertain estimate
            </span>
          </p>
        )}
      <details className="mt-3 text-sm text-foreground">
        <summary className="min-h-9 cursor-pointer rounded-md px-2 py-2 focus-visible:outline-2 focus-visible:outline-ring">
          Inspect a date
        </summary>
        <div
          role="group"
          aria-label="Choose a recorded date"
          className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10"
        >
          {view.days.map((day) => (
            <button
              key={day.date}
              type="button"
              aria-label={`Inspect ${day.date}`}
              aria-pressed={selectedDay?.date === day.date}
              className="min-h-9 min-w-0 rounded-md border border-border px-1 py-2 text-xs tabular-nums hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-accent"
              onClick={() => setSelectedDate(day.date)}
            >
              {dateTick(day.date)}
            </button>
          ))}
        </div>
        {selectedDay && (
          <section className="mt-3" aria-label="Selected date" aria-live="polite">
            <UsageTooltip day={selectedDay} metric={metric} />
          </section>
        )}
      </details>
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
              {metric === "tokens" && view.query.includeUncertain && (
                <th scope="col">Uncertain token estimate</th>
              )}
              <th scope="col">Coverage</th>
              <th scope="col">Recorded exclusions</th>
              {isMoney(metric) && <th scope="col">Pricing</th>}
            </tr>
          </thead>
          <tbody>
            {view.days.map((day) => {
              const facts = usageFacts(day, metric);
              return (
                <tr key={day.date}>
                  <th scope="row">{day.date}</th>
                  <td>{facts.value}</td>
                  {metric === "tokens" && view.query.includeUncertain && (
                    <td>{exact(day.uncertain?.totalTokens ?? 0)}</td>
                  )}
                  <td>{facts.coverage}</td>
                  <td>{facts.exclusions}</td>
                  {facts.pricing && <td>{facts.pricing}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
