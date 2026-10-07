import type { CalendarQuery, CalendarSnapshot } from "./calendar-contract.js";
import { shiftDate } from "./calendar-time.js";
import { comparisonReasons } from "./calendar-comparison.js";
// Synthetic inputs for public RPC/React tests only. No source or account data.
export function calendarSnapshot(
  query: CalendarQuery,
  now = Date.parse("2026-10-01T12:00:00Z"),
): CalendarSnapshot {
  const uncovered = {
    state: "uncovered" as const,
    zero: false,
    writerActive: false,
    pauses: 0,
    omissions: 0,
    uncertain: false,
    backlog: false,
    recoveryGap: false,
    truncated: false,
  };
  const recorded = { ...uncovered, state: "observed" as const };
  const emptyMoney = {
    state: "unavailable" as const,
    capturedCost: null,
    pricedRecords: 0,
    records: 0,
    pricedEntities: 0,
    reason: "missing-prices" as const,
  };
  const value: CalendarSnapshot = {
    state: "partial",
    reason: "ok",
    query,
    observedAt: new Date(now).toISOString(),
    compactFrom: "2026-06-22T00:00:00.000Z",
    capture: "observed",
    previous: true,
    next: query.startDate < "2026-09-02",
    summary: {
      totalTokens: 600,
      activeEntities: 60,
      excludedTokens: 2,
      money: { ...emptyMoney, records: 60 },
    },
    days: Array.from({ length: 30 }, (_, n) => ({
      date: shiftDate(query.startDate, n),
      totalTokens: n === 14 ? 600 : 0,
      activeEntities: n === 14 ? 60 : 0,
      excludedTokens: n === 14 ? 2 : 0,
      coverage: n === 14 ? recorded : uncovered,
      money: { ...emptyMoney, records: n === 14 ? 60 : 0 },
      classes:
        n === 14
          ? {
              state: "available",
              input: 240,
              output: 360,
              reasoning: 100,
              cacheRead: 200,
              cacheWrite: 0,
            }
          : { state: "unavailable" },
    })),
    ranking: Array.from({ length: 50 }, (_, n) => ({
      key: query.group === "workspace" ? `/synthetic/workspace-${n + 1}` : `thr_synthetic_${n + 1}`,
      label:
        query.group === "workspace" ? `/synthetic/workspace-${n + 1}` : `Synthetic thread ${n + 1}`,
      metadata: query.group === "workspace" ? "recorded-workspace" : "available",
      totalTokens: 10,
      attribution: query.group === "workspace" ? "workspace-only" : "exact-thread",
      coverage: recorded,
      money: { ...emptyMoney, records: 1 },
    })),
    truncated: true,
    identity: "complete",
    identityPending: false,
  };
  if (query.includeUncertain) {
    value.summary.uncertain = { totalTokens: 0, records: 0 };
    value.days.forEach((day) => {
      day.uncertain = { totalTokens: 0, records: 0 };
    });
  }
  if (query.comparison) {
    const priorQuery = { ...query, startDate: shiftDate(query.startDate, -30) },
      range = calendarSnapshot({ ...priorQuery, comparison: false }, now);
    const prior = {
      state: range.state,
      summary: range.summary,
      coverage: range.days[14].coverage,
      capture: range.capture,
      identity: range.identity,
      identityPending: range.identityPending,
    };
    value.comparison = {
      query: priorQuery,
      observedAt: value.observedAt,
      prior,
      percentage: null,
      reasons: comparisonReasons(value, prior),
    };
  }
  return value;
}

// Empty unknown history is not zero. Inactivity fixtures contain no accepted usage.
export function calendarEmptySnapshot(
  query: CalendarQuery,
  state: "unknown" | "observed-inactivity",
): CalendarSnapshot {
  const value = calendarSnapshot(query),
    money = {
      state: "unavailable" as const,
      capturedCost: null,
      records: 0,
      pricedRecords: 0,
      pricedEntities: 0,
      reason: "missing-prices" as const,
    };
  const coverage = {
    ...value.days[0].coverage,
    state:
      state === "observed-inactivity" ? ("observed-inactivity" as const) : ("uncovered" as const),
    zero: state === "observed-inactivity",
  };
  value.state = state;
  value.summary = {
    ...(query.includeUncertain ? { uncertain: { totalTokens: 0, records: 0 } } : {}),
    totalTokens: 0,
    activeEntities: 0,
    excludedTokens: 0,
    money,
  };
  value.ranking = [];
  value.truncated = false;
  value.days = value.days.map((day) => ({
    ...day,
    totalTokens: 0,
    activeEntities: 0,
    excludedTokens: 0,
    money,
    coverage,
    classes: { state: "unavailable" },
  }));
  if (value.comparison) {
    value.comparison.prior = {
      state,
      summary: value.summary,
      coverage,
      capture: value.capture,
      identity: value.identity,
      identityPending: false,
    };
    value.comparison.reasons = comparisonReasons(value, value.comparison.prior);
  }
  return value;
}
