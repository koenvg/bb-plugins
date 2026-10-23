import { useMemo } from "react";
import { barY, createMark, defineChart, stack, type SceneRect } from "@tanstack/charts";
import { decorative } from "@tanstack/charts/mark/decorative";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { Chart } from "@tanstack/charts/react/tooltip";
import { tooltip } from "@tanstack/charts/tooltip";
import { portal } from "@tanstack/charts/tooltip/portal";
import { UsageTooltip, displayValue } from "./calendar-tooltip.js";
import {
  axisValue,
  dateTick,
  weekdayTick,
  metricName,
  type chartData,
  type TokenMetric,
} from "./calendar-chart-data.js";

type ChartData = ReturnType<typeof chartData>;
type DailyRow = ChartData["rows"][number];
type DrawingRow = {
  date: string;
  series: string;
  height: number;
  color: string;
  uncertain: boolean;
};

function dailyInspection(
  rows: DailyRow[],
  models: Array<ChartData["models"][number]>,
  metric: TokenMetric,
) {
  return createMark<DailyRow, string, number>(() => ({
    id: "calendar-days",
    channels: { x: { scale: "x", values: rows.map((row) => row.date) } },
    render: ({ scales, chart }) => {
      const nodes: SceneRect[] = [];
      const points = rows.map((row, datumIndex) => {
        const x = scales.x.map(row.date);
        const y = scales.y.map(0);
        const height =
          metric === "tokens" || metric === "cost"
            ? models.reduce((sum, series) => sum + (row.modelHeights[series.key] ?? 0), 0) +
              row.uncertainHeight
            : (row.height ?? 0);
        const positive =
          metric === "tokens" || metric === "cost"
            ? (metric !== "cost" || row.value !== null) &&
              (models.some((series) => (row.modelFacts[series.key] ?? 0) > 0) ||
                row.uncertainHeight > 0)
            : (row.value ?? 0) > 0;
        if (positive && height * chart.height < 2)
          nodes.push({
            kind: "rect",
            key: `positive:${row.date}`,
            className: "calendar-positive-usage",
            x: x - 3,
            y: y - 2,
            width: 6,
            height: 2,
            ariaHidden: true,
            style: { fill: "currentColor" },
          });
        return {
          key: row.date,
          markId: "calendar-days",
          datum: row,
          datumIndex,
          group: null,
          groupLabel: row.date,
          xValue: row.date,
          yValue: 0,
          x,
          y,
          color: "currentColor",
        };
      });
      return { nodes, points };
    },
  }));
}

export function CalendarChart({
  data,
  visibleModels,
  metric,
  includeUncertain,
  helpId,
}: {
  data: ChartData;
  visibleModels: Array<ChartData["models"][number]>;
  metric: TokenMetric;
  includeUncertain: boolean;
  helpId?: string;
}) {
  const definition = useMemo(() => {
    const modelMetric = metric === "tokens" || metric === "cost";
    const maximum = modelMetric
      ? Math.max(
          0,
          ...data.rows.map(
            (row) =>
              (metric === "cost" && row.value === null
                ? 0
                : visibleModels.reduce(
                    (sum, series) => sum + (row.modelFacts[series.key] ?? 0),
                    0,
                  )) +
              (includeUncertain && metric === "tokens" ? (row.day.uncertain?.totalTokens ?? 0) : 0),
          ),
        )
      : data.maximum;
    // Rebuild coordinates from facts; an all-model ratio may already have underflowed.
    const rows = modelMetric
      ? data.rows.map((row) => ({
          ...row,
          modelHeights: Object.fromEntries(
            visibleModels.map(({ key }) => [
              key,
              row.modelHeights[key] == null
                ? null
                : maximum
                  ? (row.modelFacts[key] ?? 0) / maximum
                  : 0,
            ]),
          ),
          uncertainHeight:
            includeUncertain && metric === "tokens" && maximum
              ? (row.day.uncertain?.totalTokens ?? 0) / maximum
              : 0,
        }))
      : data.rows;
    const drawing: DrawingRow[] = rows.flatMap((row) => {
      const recorded: DrawingRow[] =
        metric === "tokens" || metric === "cost"
          ? visibleModels.flatMap((series) => {
              const height = row.modelHeights[series.key];
              return height == null
                ? []
                : [
                    {
                      date: row.date,
                      series: series.key,
                      height,
                      color: series.color,
                      uncertain: false,
                    },
                  ];
            })
          : row.height == null
            ? []
            : [
                {
                  date: row.date,
                  series: "recorded",
                  height: row.height,
                  color: "var(--primary)",
                  uncertain: false,
                },
              ];
      return includeUncertain && metric === "tokens" && row.uncertainHeight > 0
        ? [
            ...recorded,
            {
              date: row.date,
              series: "uncertain",
              height: row.uncertainHeight,
              color: "var(--muted)",
              uncertain: true,
            },
          ]
        : recorded;
    });
    return defineChart({
      marks: [
        decorative(
          barY(drawing, {
            id: "calendar-bars",
            x: "date",
            y: "height",
            z: "series",
            key: (row) => JSON.stringify([row.date, row.series]),
            fill: (row) => row.color,
            stroke: (row) => (row.uncertain ? "var(--muted-foreground)" : "none"),
            strokeDasharray: (row) => (row.uncertain ? "3 2" : ""),
            maxThickness: 28,
            radius: metric === "tokens" || metric === "cost" ? 0 : { end: 3 },
            layout: stack({
              order: [...data.models.map((series) => series.key), "recorded", "uncertain"],
            }),
          }),
        ),
        dailyInspection(rows, visibleModels, metric),
      ],
      scales: {
        x: {
          scale: scaleBand<string>()
            .domain(data.rows.map((row) => row.date))
            .padding(0.2),
          axis: {
            line: { stroke: "currentColor", strokeOpacity: 0.3 },
            ticks: {
              line: false,
              padding: 8,
              format: (date) => `${weekdayTick(date)} ${dateTick(date)}`,
            },
            tickLabels: {
              fontSize: 11,
              opacity: 1,
              anchor: ({ index }) =>
                index === 0 ? "start" : index === data.rows.length - 1 ? "end" : "middle",
              thin: { minGap: 12, priority: "ends" },
            },
          },
        },
        y: {
          scale: scaleLinear().domain([0, 1]),
          grid: { stroke: "currentColor", strokeOpacity: 0.16 },
          axis: {
            line: false,
            ticks: {
              values:
                modelMetric && maximum === 0 ? [0] : maximum < 4 ? [0, 1] : [0, 0.25, 0.5, 0.75, 1],
              line: false,
              format: (value) => axisValue(value * maximum, metric),
            },
            tickLabels: { fontSize: 12, opacity: 1 },
            label: { text: metricName(metric), fontSize: 11, offset: 64 },
          },
        },
      },
      margin: { top: 14, right: 8, bottom: 46 },
      theme: { foreground: "currentColor", muted: "currentColor", background: "var(--background)" },
      focus: "nearest-x",
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: {
        use: tooltip,
        portal,
        className: "calendar-tooltip",
        unstyled: true,
        placement: "top",
        format: (point) => `${point.datum.date}: ${displayValue(point.datum.day, metric)}`,
      },
    });
  }, [data, visibleModels, metric, includeUncertain]);
  return (
    <Chart
      definition={definition}
      height={280}
      initialWidth={320}
      ariaLabel={`Daily usage chart: ${metricName(metric)}`}
      ariaDescription={
        helpId
          ? "Graph filters affect bars only. Recorded totals and table include all series."
          : undefined
      }
      renderTooltipBody={({ primaryPoint, pinned }) => {
        const row = primaryPoint
          ? data.rows.find((candidate) => candidate.date === primaryPoint.datum.date)
          : undefined;
        if (!row) return null;
        return (
          <div data-bb-plugin="codex-quota">
            <UsageTooltip
              day={row.day}
              pinned={pinned}
              metric={metric}
              modelView={{
                series: data.models,
                values: row.modelFacts,
                costFacts: row.costFacts,
              }}
            />
          </div>
        );
      }}
    />
  );
}
