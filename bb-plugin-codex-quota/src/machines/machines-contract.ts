import { z } from "zod";
import { quotaViewSchema } from "../quota/contract.js";
import { activityViewSchema } from "../activity/activity-contract.js";
import {
  calendarQuerySchema,
  calendarReportSchema,
} from "../history/calendar/calendar-contract.js";
import { preparationSchema } from "../history/report-preparation-contract.js";

export const MAX_MACHINES = 128;
export const machineSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(256),
    status: z.enum(["connected", "disconnected", "unknown"]),
  })
  .strict();
export type Machine = z.infer<typeof machineSchema>;
export { accountObservationInput, accountObservationSchema } from "../quota/contract.js";
export const accountsRequestSchema = z
  .object({ refresh: z.boolean(), includeActivity: z.boolean() })
  .strict();
export const accountsSchema = z
  .object({
    machines: z.array(machineSchema).max(MAX_MACHINES),
    accounts: z
      .array(
        z
          .object({
            key: z.string().min(1).max(256),
            machines: z.array(z.string().min(1).max(128)).max(MAX_MACHINES),
            identity: z.enum(["verified", "unknown"]),
            quota: quotaViewSchema,
            activity: activityViewSchema,
          })
          .strict(),
      )
      .max(MAX_MACHINES),
    truncated: z.boolean(),
  })
  .strict();
export type MachineAccounts = z.infer<typeof accountsSchema>;
export const reportsRequestSchema = z
  .object({
    query: calendarQuerySchema,
    prepare: z.boolean(),
    refresh: z.boolean(),
  })
  .strict();
export const reportsSchema = z
  .object({
    machines: z
      .array(
        z
          .object({
            machine: machineSchema,
            report: calendarReportSchema,
            cached: z.boolean(),
            preparation: preparationSchema,
          })
          .strict(),
      )
      .max(MAX_MACHINES),
    truncated: z.boolean(),
    cache: z.enum(["saved", "unavailable"]),
  })
  .strict();
export type MachineReports = z.infer<typeof reportsSchema>;
