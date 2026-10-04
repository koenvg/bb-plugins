import { z } from "zod";
import { shiftDate, validDate, validTimezone } from "./calendar-time.js";
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const path = z.string().min(1).max(16_384).regex(/^\/[^\u0000-\u001f\u007f]*$/u);
const thread = z.string().regex(/^thr_[A-Za-z0-9_-]{1,124}$/);
export const calendarQuerySchema = z.object({
  startDate: z.string().refine(validDate), timezone: z.string().refine(validTimezone), group: z.enum(["workspace", "thread"]),
  scope: z.discriminatedUnion("kind", [z.object({kind:z.literal("host")}).strict(), z.object({kind:z.literal("workspace"),workspace:path}).strict(), z.object({kind:z.literal("thread"),threadId:thread}).strict()]),
}).strict().refine(q => q.scope.kind === "host" || q.scope.kind === q.group);
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
export const calendarCoverageSchema = z.object({
  state: z.enum(["unavailable", "incomplete", "observed-inactivity", "imported", "observed", "uncovered"]),
  zero: z.boolean(), writerActive: z.boolean(), pauses: count, omissions: count, uncertain: z.boolean(), backlog: z.boolean(), recoveryGap: z.boolean(), truncated: z.boolean(),
}).strict();
const classes = z.discriminatedUnion("state", [z.object({ state:z.literal("unavailable") }).strict(), z.object({state:z.literal("available"),input:count,output:count,reasoning:count,cacheRead:count,cacheWrite:count}).strict()]);
export const calendarDaySchema = z.object({date:z.string().refine(validDate),totalTokens:count,activeEntities:count,excludedTokens:count,coverage:calendarCoverageSchema,classes}).strict();
export const calendarReportSchema = z.discriminatedUnion("state", [
  z.object({state:z.literal("unavailable"),reason:z.enum(["no-selection","selection-changed","foreign-host","host-offline","storage-unavailable","storage-incompatible","not-configured","range-unavailable","identity-unavailable","unsupported"])}).strict(),
  z.object({state:z.enum(["partial","unknown","observed-inactivity"]),reason:z.literal("ok"),query:calendarQuerySchema,observedAt:z.iso.datetime(),compactFrom:z.iso.datetime(),capture:z.enum(["observed","unconfirmed"]),previous:z.boolean(),next:z.boolean(),
    summary:z.object({totalTokens:count,activeEntities:count,excludedTokens:count}).strict(),
    days:z.array(calendarDaySchema).length(30),
    ranking:z.array(z.object({key:z.string().min(1).max(16384),label:z.string().min(1).max(16384),metadata:z.enum(["recorded-workspace","available","archived","deleted","missing"]),totalTokens:count,attribution:z.enum(["exact-thread","workspace-only","mixed","ambiguous","unknown"]),coverage:calendarCoverageSchema}).strict()).max(50),
    truncated:z.boolean(),identity:z.enum(["complete","partial","unknown"]),identityPending:z.boolean(),
  }).strict(),
]).superRefine((value,ctx)=>{
  if(value.state!=="unavailable"&&value.days.some((day,n)=>day.date!==shiftDate(value.query.startDate,n)))ctx.addIssue({code:"custom",message:"Calendar response range mismatch"});
});
export type CalendarReport = z.infer<typeof calendarReportSchema>;
export type CalendarSnapshot = Exclude<CalendarReport, {state:"unavailable"}>;
export function calendarUnavailable(reason: Extract<CalendarReport,{state:"unavailable"}>["reason"]): CalendarReport { return {state:"unavailable",reason}; }
