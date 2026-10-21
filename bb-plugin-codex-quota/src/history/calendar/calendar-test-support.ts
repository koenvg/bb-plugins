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
              input: 40,
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

export function calendarModelCostSnapshot(query: CalendarQuery): CalendarSnapshot {
  const view = calendarSnapshot(query);
  const day = view.days[14];
  day.excludedTokens = view.summary.excludedTokens = 0;
  day.money = {
    state: "partial",
    capturedCost: 323.7267296,
    records: 8072,
    pricedRecords: 8053,
    pricedEntities: 3,
    reason: "missing-prices",
  };
  const empty = {
    state: "unavailable" as const,
    capturedCost: null,
    records: 0,
    pricedRecords: 0,
    reason: "missing-prices" as const,
  };
  day.modelCosts = {
    named: [
      { model: "gpt5.5", money: { ...empty, records: 3 } },
      {
        model: "gpt6-astra",
        money: {
          state: "available",
          capturedCost: 55.753468,
          records: 360,
          pricedRecords: 360,
          reason: "ok",
        },
      },
      {
        model: "gpt6-sol",
        money: {
          state: "partial",
          capturedCost: 1.6619412,
          records: 35,
          pricedRecords: 31,
          reason: "missing-prices",
        },
      },
      {
        model: "gpt6.1-sol",
        money: {
          state: "partial",
          capturedCost: 266.3113204,
          records: 7674,
          pricedRecords: 7662,
          reason: "missing-prices",
        },
      },
    ],
    other: empty,
    unknown: empty,
  };
  view.summary.money = { ...day.money };
  return view;
}

// Tiny recorded totals beside a large day, with and without retained detail.
export function calendarMixedMagnitudeSnapshot(query: CalendarQuery): CalendarSnapshot {
  const view = calendarEmptySnapshot(query, "unknown");
  for (const [index, totalTokens] of [
    [14, 1_000_000_000],
    [15, 4],
    [16, 1],
  ] as const) {
    const day = view.days[index];
    day.totalTokens = totalTokens;
    day.activeEntities = 1;
    day.money = { ...day.money, records: 1 };
    day.coverage = { ...day.coverage, state: "observed", zero: false };
    if (index !== 16) {
      day.classes = {
        state: "available",
        input: totalTokens / 4,
        output: totalTokens / 4,
        cacheRead: totalTokens / 4,
        cacheWrite: totalTokens / 4,
        reasoning: 0,
      };
      day.models = {
        named: [
          { model: "gpt-5.3-codex", totalTokens: totalTokens / 4 },
          { model: "gpt-5.4", totalTokens: (totalTokens * 3) / 4 },
        ],
        otherTokens: 0,
      };
    }
  }
  view.days[17].coverage = {
    ...view.days[17].coverage,
    state: "observed-inactivity",
    zero: true,
  };
  if (query.includeUncertain) {
    view.days[18].uncertain = { totalTokens: 10_000_000, records: 1 };
    view.summary.uncertain = { totalTokens: 10_000_000, records: 1 };
  }
  view.state = "partial";
  view.summary.totalTokens = 1_000_000_005;
  view.summary.activeEntities = 3;
  view.summary.money = { ...view.summary.money, records: 3 };
  return view;
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
