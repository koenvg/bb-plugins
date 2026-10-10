import type {
  CalendarQuery,
  CalendarSnapshot,
  CalendarMoney,
} from "../history/calendar/calendar-contract.js";
import { checkedCount } from "../history/calendar/calendar-aggregation.js";
import { safeCapturedSum } from "../history/calendar/calendar-money.js";
import { shiftDate } from "../history/calendar/calendar-time.js";
import type { MachineReports } from "./machines-contract.js";

type Day = CalendarSnapshot["days"][number];
const sum = (values: number[]) =>
  checkedCount(values.reduce((total, value) => checkedCount(total + value), 0));
const emptyMoney: CalendarMoney = {
  state: "unavailable",
  capturedCost: null,
  pricedRecords: 0,
  records: 0,
  pricedEntities: 0,
  reason: "missing-prices",
};
const uncovered: Day["coverage"] = {
  state: "uncovered",
  zero: false,
  writerActive: false,
  pauses: 0,
  omissions: 0,
  uncertain: false,
  backlog: false,
  recoveryGap: false,
  truncated: false,
};
function money(values: CalendarMoney[]): CalendarMoney {
  const records = sum(values.map((value) => value.records)),
    pricedRecords = sum(values.map((value) => value.pricedRecords));
  const cost =
    values.some((value) => value.reason === "unsafe-sum") || !pricedRecords
      ? null
      : safeCapturedSum(values.reduce((total, value) => total + (value.capturedCost ?? 0), 0));
  return {
    records,
    pricedRecords,
    pricedEntities: sum(values.map((value) => value.pricedEntities)),
    capturedCost: cost,
    state: cost === null ? "unavailable" : pricedRecords === records ? "available" : "partial",
    reason:
      pricedRecords && cost === null
        ? "unsafe-sum"
        : pricedRecords < records || !records
          ? "missing-prices"
          : "ok",
  };
}
function coverage(values: Day["coverage"][], incomplete: boolean): Day["coverage"] {
  const zero = !incomplete && values.length > 0 && values.every((value) => value.zero);
  return {
    state: zero
      ? "observed-inactivity"
      : incomplete ||
          values.some((value) => ["incomplete", "uncovered", "unavailable"].includes(value.state))
        ? "incomplete"
        : "observed",
    zero,
    writerActive: !incomplete && values.every((value) => value.writerActive),
    pauses: sum(values.map((value) => value.pauses)),
    omissions: sum(values.map((value) => value.omissions)),
    uncertain: values.some((value) => value.uncertain),
    backlog: incomplete || values.some((value) => value.backlog),
    recoveryGap: values.some((value) => value.recoveryGap),
    truncated: values.some((value) => value.truncated),
  };
}
export type CombinedReport = {
  query: CalendarQuery;
  days: Day[];
  observedAt: string;
  previous: boolean;
  next: boolean;
  summary: {
    totalTokens: number;
    capturedCost: number | null;
    pricedRecords: number;
    records: number;
    uncertainTokens: number;
    excludedTokens: number;
  };
  ranking: (CalendarSnapshot["ranking"][number] & { machineId: string; machineName: string })[];
  truncated: boolean;
  incomplete: boolean;
  adjusted: boolean;
};
/** Merge only recorded machine usage. Account feeds never enter these totals.
 * Cached dates are aligned by their actual calendar date, not array position.
 * Period rankings are omitted when their cached date range no longer matches.
 */
export function combineReports(input: MachineReports, query: CalendarQuery): CombinedReport | null {
  for (const row of input.machines) {
    if (row.report.state === "unavailable") continue;
    const actual = row.report.query;
    if (
      actual.group !== query.group ||
      actual.timezone !== query.timezone ||
      actual.includeUncertain !== query.includeUncertain ||
      JSON.stringify(actual.scope) !== JSON.stringify(query.scope) ||
      (!row.cached && actual.startDate !== query.startDate)
    )
      throw new Error("Report query mismatch");
  }
  const available = input.machines.flatMap((row) =>
    row.report.state === "unavailable" ? [] : [{ ...row, report: row.report }],
  );
  if (!available.length) return null;
  const incomplete =
    input.truncated ||
    available.length !== input.machines.length ||
    available.some((row) => row.cached || row.preparation.state === "pending");
  const adjusted = available.some((row) => row.report.query.startDate !== query.startDate);
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = shiftDate(query.startDate, index);
    const values = available.map(
      (row) =>
        row.report.days.find((day) => day.date === date) ?? {
          date,
          totalTokens: 0,
          activeEntities: 0,
          excludedTokens: 0,
          money: emptyMoney,
          coverage: uncovered,
          classes: { state: "unavailable" as const },
        },
    );
    const classes = values.every((value) => value.classes.state === "available")
      ? {
          state: "available" as const,
          input: sum(
            values.map((value) => (value.classes.state === "available" ? value.classes.input : 0)),
          ),
          output: sum(
            values.map((value) => (value.classes.state === "available" ? value.classes.output : 0)),
          ),
          reasoning: sum(
            values.map((value) =>
              value.classes.state === "available" ? value.classes.reasoning : 0,
            ),
          ),
          cacheRead: sum(
            values.map((value) =>
              value.classes.state === "available" ? value.classes.cacheRead : 0,
            ),
          ),
          cacheWrite: sum(
            values.map((value) =>
              value.classes.state === "available" ? value.classes.cacheWrite : 0,
            ),
          ),
        }
      : { state: "unavailable" as const };
    return {
      date,
      totalTokens: sum(values.map((value) => value.totalTokens)),
      activeEntities: sum(values.map((value) => value.activeEntities)),
      excludedTokens: sum(values.map((value) => value.excludedTokens)),
      classes,
      money: money(values.map((value) => value.money)),
      ...(query.includeUncertain
        ? {
            uncertain: {
              totalTokens: sum(
                values.map((value) =>
                  "uncertain" in value ? (value.uncertain?.totalTokens ?? 0) : 0,
                ),
              ),
              records: sum(
                values.map((value) => ("uncertain" in value ? (value.uncertain?.records ?? 0) : 0)),
              ),
            },
          }
        : {}),
      coverage: coverage(
        values.map((value) => value.coverage),
        incomplete,
      ),
    };
  });
  for (const day of days) sum([day.totalTokens, day.uncertain?.totalTokens ?? 0]);
  sum(days.flatMap((day) => [day.totalTokens, day.uncertain?.totalTokens ?? 0]));
  const ranking = available
    .filter((row) => row.report.query.startDate === query.startDate)
    .flatMap(({ machine, report }) =>
      report.ranking.map((row) => ({
        ...row,
        key: `${machine.id}:${row.key}`,
        machineId: machine.id,
        machineName: machine.name,
      })),
    )
    .sort((a, b) => b.totalTokens - a.totalTokens || a.key.localeCompare(b.key));
  const totalMoney = money(days.map((day) => day.money));
  return {
    query,
    days,
    observedAt: available.map((row) => row.report.observedAt).sort()[0]!,
    previous: available.some((row) => row.report.previous),
    next: available.some((row) => row.report.next),
    summary: {
      totalTokens: sum(days.map((day) => day.totalTokens)),
      capturedCost: totalMoney.capturedCost,
      pricedRecords: totalMoney.pricedRecords,
      records: totalMoney.records,
      uncertainTokens: sum(days.map((day) => day.uncertain?.totalTokens ?? 0)),
      excludedTokens: sum(days.map((day) => day.excludedTokens)),
    },
    ranking: ranking.slice(0, 50),
    truncated:
      adjusted ||
      input.truncated ||
      ranking.length > 50 ||
      available.some((row) => row.report.truncated),
    incomplete,
    adjusted,
  };
}
