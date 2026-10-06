import type { HistoryDatabaseFactory } from "../storage/history-storage.js";
import { withRetainedHistory, retainedHistoryReason } from "../storage/retained-history.js";
import {
  calendarQuerySchema,
  calendarUnavailable,
  type CalendarQuery,
  type CalendarReport,
} from "./calendar-contract.js";
import { readCalendarReport } from "./calendar-report.js";
/** Read-only report path. Validates control but changes no collector assets/control, metadata discovery, imports or account calls. */
export async function readHostCalendar(
  context: { signal: AbortSignal; dataDir: string; calendar: CalendarQuery },
  deps: { storage?: () => Promise<HistoryDatabaseFactory | null>; now?: () => number },
): Promise<CalendarReport> {
  const { signal } = context;
  if (signal.aborted) return calendarUnavailable("selection-changed");
  try {
    const query = calendarQuerySchema.parse(context.calendar);
    return await withRetainedHistory(context, deps, true, (db) => {
      // A deferred read transaction holds one SQLite snapshot without a writer reservation.
      db.exec("BEGIN");
      try {
        const report = readCalendarReport(db, query, (deps.now ?? Date.now)());
        db.exec("COMMIT");
        return report;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    });
  } catch (error) {
    return calendarUnavailable(retainedHistoryReason(error, signal));
  }
}
