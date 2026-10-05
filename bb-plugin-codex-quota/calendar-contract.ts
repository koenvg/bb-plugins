import { z } from "zod";
import { shiftDate, validDate, validTimezone } from "./calendar-time.js";
import {
  comparisonMetrics,
  comparisonReasonCodes,
  comparisonReasons,
} from "./calendar-comparison.js";
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const path = z
  .string()
  .min(1)
  .max(16_384)
  // oxlint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
  .regex(/^\/[^\u0000-\u001f\u007f]*$/u);
const thread = z.string().regex(/^thr_[A-Za-z0-9_-]{1,124}$/);
export const calendarQuerySchema = z
  .object({
    startDate: z.string().refine(validDate),
    timezone: z.string().refine(validTimezone),
    group: z.enum(["workspace", "thread"]),
    scope: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("host") }).strict(),
      z.object({ kind: z.literal("workspace"), workspace: path }).strict(),
      z.object({ kind: z.literal("thread"), threadId: thread }).strict(),
    ]),
    comparison: z.boolean().optional(),
  })
  .strict()
  .refine((q) => q.scope.kind === "host" || q.scope.kind === q.group);
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
export const calendarCoverageSchema = z
  .object({
    state: z.enum([
      "unavailable",
      "incomplete",
      "observed-inactivity",
      "imported",
      "observed",
      "uncovered",
    ]),
    zero: z.boolean(),
    writerActive: z.boolean(),
    pauses: count,
    omissions: count,
    uncertain: z.boolean(),
    backlog: z.boolean(),
    recoveryGap: z.boolean(),
    truncated: z.boolean(),
  })
  .strict()
  .refine(
    (c) =>
      c.zero
        ? c.state === "observed-inactivity" &&
          c.pauses === 0 &&
          c.omissions === 0 &&
          !c.uncertain &&
          !c.backlog &&
          !c.recoveryGap &&
          !c.truncated
        : c.state !== "observed-inactivity",
    "Calendar coverage zero certificate mismatch",
  );
export const calendarMoneySchema = z
  .object({
    state: z.enum(["available", "partial", "unavailable"]),
    capturedCost: z.number().finite().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
    pricedRecords: count,
    records: count,
    pricedEntities: count,
    reason: z.enum(["ok", "missing-prices", "unsafe-sum"]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const validCounts =
      value.pricedRecords <= value.records &&
      value.pricedEntities <= value.pricedRecords &&
      value.pricedRecords > 0 === value.pricedEntities > 0;
    const validState =
      value.state === "unavailable"
        ? value.capturedCost === null &&
          value.reason !== "ok" &&
          (value.reason === "missing-prices" ? value.pricedRecords === 0 : value.pricedRecords > 0)
        : value.capturedCost !== null &&
          value.pricedRecords > 0 &&
          (value.state === "available"
            ? value.pricedRecords === value.records && value.reason === "ok"
            : value.pricedRecords < value.records && value.reason === "missing-prices");
    if (!validCounts || !validState)
      ctx.addIssue({ code: "custom", message: "Calendar pricing mismatch" });
  });
export type CalendarMoney = z.infer<typeof calendarMoneySchema>;
const classes = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unavailable") }).strict(),
  z
    .object({
      state: z.literal("available"),
      input: count,
      output: count,
      reasoning: count,
      cacheRead: count,
      cacheWrite: count,
    })
    .strict(),
]);
export const calendarDaySchema = z
  .object({
    date: z.string().refine(validDate),
    totalTokens: count,
    activeEntities: count,
    excludedTokens: count,
    coverage: calendarCoverageSchema,
    money: calendarMoneySchema,
    classes,
  })
  .strict()
  .refine(
    (day) =>
      !day.coverage.zero ||
      (day.totalTokens === 0 &&
        day.activeEntities === 0 &&
        day.excludedTokens === 0 &&
        day.money.records === 0),
    "Calendar zero certificate mismatch",
  );
export const calendarSummarySchema = z
  .object({
    totalTokens: count,
    activeEntities: count,
    excludedTokens: count,
    money: calendarMoneySchema,
  })
  .strict();
const unavailableSchema = z
  .object({
    state: z.literal("unavailable"),
    reason: z.enum([
      "no-selection",
      "selection-changed",
      "foreign-host",
      "host-offline",
      "storage-unavailable",
      "storage-incompatible",
      "not-configured",
      "range-unavailable",
      "identity-unavailable",
      "unsupported",
    ]),
  })
  .strict();
const priorSchema = z.discriminatedUnion("state", [
  unavailableSchema,
  z
    .object({
      state: z.enum(["partial", "unknown", "observed-inactivity"]),
      summary: calendarSummarySchema,
      coverage: calendarCoverageSchema,
      capture: z.enum(["observed", "unconfirmed"]),
      identity: z.enum(["complete", "partial", "unknown"]),
      identityPending: z.boolean(),
    })
    .strict(),
]);
const comparisonSchema = z
  .object({
    query: calendarQuerySchema,
    observedAt: z.iso.datetime(),
    prior: priorSchema,
    percentage: z.null(),
    reasons: z
      .object({
        tokens: z.enum(comparisonReasonCodes),
        entities: z.enum(comparisonReasonCodes),
        "per-entity": z.enum(comparisonReasonCodes),
        cost: z.enum(comparisonReasonCodes),
        "cost-per-entity": z.enum(comparisonReasonCodes),
      })
      .strict(),
  })
  .strict();
export const calendarReportSchema = z
  .discriminatedUnion("state", [
    unavailableSchema,
    z
      .object({
        state: z.enum(["partial", "unknown", "observed-inactivity"]),
        reason: z.literal("ok"),
        query: calendarQuerySchema,
        observedAt: z.iso.datetime(),
        compactFrom: z.iso.datetime(),
        capture: z.enum(["observed", "unconfirmed"]),
        previous: z.boolean(),
        next: z.boolean(),
        summary: calendarSummarySchema,
        comparison: comparisonSchema.optional(),
        days: z.array(calendarDaySchema).length(30),
        ranking: z
          .array(
            z
              .object({
                key: z.string().min(1).max(16384),
                label: z.string().min(1).max(16384),
                metadata: z.enum([
                  "recorded-workspace",
                  "available",
                  "archived",
                  "deleted",
                  "missing",
                ]),
                totalTokens: count,
                attribution: z.enum([
                  "exact-thread",
                  "workspace-only",
                  "mixed",
                  "ambiguous",
                  "unknown",
                ]),
                coverage: calendarCoverageSchema,
                money: calendarMoneySchema,
              })
              .strict(),
          )
          .max(50),
        truncated: z.boolean(),
        identity: z.enum(["complete", "partial", "unknown"]),
        identityPending: z.boolean(),
      })
      .strict(),
  ])
  .superRefine((value, ctx) => {
    if (
      value.state !== "unavailable" &&
      value.days.some((day, n) => day.date !== shiftDate(value.query.startDate, n))
    )
      ctx.addIssue({ code: "custom", message: "Calendar response range mismatch" });
    if (value.state !== "unavailable") {
      const totals = [value.summary, ...value.days];
      if (
        totals.some(
          (total) =>
            total.money.pricedEntities > total.activeEntities ||
            total.activeEntities > total.money.records,
        ) ||
        value.ranking.some((row) => row.money.pricedEntities > 1)
      )
        ctx.addIssue({ code: "custom", message: "Calendar entity denominator mismatch" });
      const comparison = value.comparison;
      if (!!value.query.comparison !== !!comparison)
        ctx.addIssue({ code: "custom", message: "Calendar comparison presence mismatch" });
      if (
        value.state === "observed-inactivity" &&
        (value.summary.money.records !== 0 ||
          value.summary.totalTokens !== 0 ||
          value.summary.activeEntities !== 0 ||
          value.summary.excludedTokens !== 0 ||
          value.days.some((day) => !day.coverage.zero))
      )
        ctx.addIssue({ code: "custom", message: "Calendar inactivity mismatch" });
      if (comparison) {
        const expected = { ...value.query, startDate: shiftDate(value.query.startDate, -30) };
        if (
          JSON.stringify(comparison.query) !== JSON.stringify(expected) ||
          comparison.observedAt !== value.observedAt
        )
          ctx.addIssue({ code: "custom", message: "Calendar prior identity mismatch" });
        if (
          comparisonMetrics.some(
            (metric) =>
              comparison.reasons[metric] !== comparisonReasons(value, comparison.prior)[metric],
          )
        )
          ctx.addIssue({ code: "custom", message: "Calendar comparison reason mismatch" });
        if (comparison.prior.state !== "unavailable") {
          const prior = comparison.prior,
            summary = prior.summary;
          if (
            summary.money.pricedEntities > summary.activeEntities ||
            summary.activeEntities > summary.money.records
          )
            ctx.addIssue({ code: "custom", message: "Calendar prior denominator mismatch" });
          if (
            (prior.state === "observed-inactivity") !== prior.coverage.zero ||
            (prior.coverage.zero &&
              (summary.totalTokens !== 0 ||
                summary.activeEntities !== 0 ||
                summary.excludedTokens !== 0 ||
                summary.money.records !== 0))
          )
            ctx.addIssue({ code: "custom", message: "Calendar prior inactivity mismatch" });
        }
      }
    }
  });
export type CalendarReport = z.infer<typeof calendarReportSchema>;
export type CalendarSnapshot = Exclude<CalendarReport, { state: "unavailable" }>;
export function calendarUnavailable(
  reason: Extract<CalendarReport, { state: "unavailable" }>["reason"],
): CalendarReport {
  return { state: "unavailable", reason };
}
