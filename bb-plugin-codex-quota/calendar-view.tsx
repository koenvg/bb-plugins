import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CalendarSnapshot } from "./calendar-contract.js";
import { capturedEstimate, pricingLabel } from "./calendar-money-view.js";
import {
  axisValue,
  chartData,
  coverageLabel,
  dateTick,
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
export function UsageTooltip({ day, metric }: { day: CalendarDay; metric: TokenMetric }) {
  const facts = usageFacts(day, metric);
  return (
    <div className="max-w-64 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md [overflow-wrap:anywhere]">
      <p className="font-medium">{day.date}</p>
      <p className="mt-1 tabular-nums">
        {metricName(metric)}: {facts.value}
      </p>
      <p className="mt-1 text-muted-foreground">{facts.coverage}</p>
      {facts.pricing && (
        <>
          <p className="mt-1">{facts.pricing}</p>
          <p>{billingLimit}</p>
        </>
      )}
      {!!day.excludedTokens && <p className="mt-1">{facts.exclusions}</p>}
    </div>
  );
}
export function CalendarValues({ view, metric }: { view: CalendarSnapshot; metric: TokenMetric }) {
  const { rows, maximum } = chartData(view.days, metric);
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
        width="100%"
        height={280}
        minWidth={0}
        initialDimension={{ width: 320, height: 280 }}
      >
        <BarChart data={rows} margin={{ top: 14, right: 8, bottom: 8, left: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.16} />
          <XAxis
            dataKey="date"
            tickFormatter={dateTick}
            interval="preserveStartEnd"
            minTickGap={36}
            tickLine={false}
            axisLine={{ stroke: "currentColor", strokeOpacity: 0.3 }}
            tick={{ fill: "currentColor", fontSize: 12 }}
            tickMargin={10}
          />
          <YAxis
            domain={[0, 1]}
            ticks={ticks}
            width={62}
            tickFormatter={(value) => axisValue(value * maximum, metric)}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "currentColor", fontSize: 12 }}
            label={{
              value: metricName(metric),
              angle: -90,
              position: "insideLeft",
              fill: "currentColor",
              fontSize: 11,
            }}
          />
          <Tooltip
            filterNull={false}
            cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
            content={({ active, label }) => {
              const day = active ? view.days.find((day) => day.date === label) : null;
              return day ? <UsageTooltip day={day} metric={metric} /> : null;
            }}
          />
          <Bar
            dataKey="height"
            className="fill-primary"
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
            minPointSize={(_value, index) => ((rows[index]?.value ?? 0) > 0 ? 2 : 0)}
          />
        </BarChart>
      </ResponsiveContainer>
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
