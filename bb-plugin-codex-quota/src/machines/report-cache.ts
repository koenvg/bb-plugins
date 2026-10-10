import { createHash } from "node:crypto";
import { z } from "zod";
import {
  calendarReportSchema,
  type CalendarQuery,
  type CalendarSnapshot,
} from "../history/calendar/calendar-contract.js";
import { dayBoundary, shiftDate } from "../history/calendar/calendar-time.js";
import { retentionCutoffs } from "../history/storage/history-retention.js";

export type SummaryStorage = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
};
const prefix = "machine-summary-v1/";
const indexSchema = z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(8);
const digest = (query: CalendarQuery) =>
  createHash("sha256").update(JSON.stringify(query)).digest("hex");

/** Serialized ownership includes physical expiry, not only filtering expired reads. */
export function createReportCache(storage: SummaryStorage, now = Date.now) {
  let writes = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const run = writes.then(work);
    writes = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  const pruneHost = async (hostId: string) => {
    const root = `${prefix}${hostId}/`;
    const keys = indexSchema.parse((await storage.get<unknown>(root + "index")) ?? []);
    const retained: { key: string; report: CalendarSnapshot }[] = [];
    const clock = now(),
      cutoff = retentionCutoffs(clock).compact;
    for (const key of keys) {
      const parsed = calendarReportSchema.safeParse(await storage.get<unknown>(root + key));
      const report = parsed.success && parsed.data.state !== "unavailable" ? parsed.data : null;
      if (
        !report ||
        Date.parse(report.observedAt) > clock + 60_000 ||
        dayBoundary(report.query.startDate, report.query.timezone) <
          (report.compactFrom > cutoff ? report.compactFrom : cutoff)
      ) {
        await storage.delete(root + key);
      } else retained.push({ key, report });
    }
    if (retained.length)
      await storage.set(
        root + "index",
        retained.map((value) => value.key),
      );
    else await storage.delete(root + "index");
    return retained;
  };
  return {
    read(hostId: string, query: CalendarQuery): Promise<CalendarSnapshot | null> {
      return serial(async () => {
        const values = await pruneHost(hostId),
          exact = digest(query);
        const scope = ({ startDate: _start, ...rest }: CalendarQuery) => JSON.stringify(rest);
        values.sort((a, b) => Number(b.key === exact) - Number(a.key === exact));
        return (
          values.find(
            ({ report }) =>
              scope(report.query) === scope(query) &&
              report.days.some(
                (day) => day.date >= query.startDate && day.date <= shiftDate(query.startDate, 29),
              ),
          )?.report ?? null
        );
      });
    },
    save(hostId: string, report: CalendarSnapshot) {
      return serial(async () => {
        const parsed = calendarReportSchema.parse(report);
        if (parsed.state === "unavailable") return;
        const root = `${prefix}${hostId}/`,
          key = digest(parsed.query);
        const old = (await pruneHost(hostId)).map((value) => value.key);
        const keys = [key, ...old.filter((entry) => entry !== key)].slice(0, 8);
        // Ranking names can be long. Preserve daily totals within KV's 256KB bound.
        const saved =
          Buffer.byteLength(JSON.stringify(parsed)) <= 200_000
            ? parsed
            : { ...parsed, ranking: [], truncated: true };
        await storage.set(root + key, saved);
        await storage.set(root + "index", keys);
        for (const remove of old.filter((entry) => !keys.includes(entry)))
          await storage.delete(root + remove);
        await pruneHost(hostId);
      });
    },
    removeQuery(hostId: string, query: CalendarQuery) {
      return serial(async () => {
        const root = `${prefix}${hostId}/`,
          key = digest(query);
        const keys = indexSchema.parse((await storage.get<unknown>(root + "index")) ?? []);
        await storage.delete(root + key);
        const next = keys.filter((value) => value !== key);
        if (next.length) await storage.set(root + "index", next);
        else await storage.delete(root + "index");
      });
    },
    remove(hostId: string) {
      return serial(async () => {
        for (const key of await storage.list(`${prefix}${hostId}/`)) await storage.delete(key);
      });
    },
    pruneMachines(ids: Set<string>) {
      return serial(async () => {
        for (const key of await storage.list(prefix)) {
          const hostId = key.slice(prefix.length).split("/")[0]!;
          if (!ids.has(hostId)) await storage.delete(key);
        }
        for (const hostId of ids) await pruneHost(hostId);
      });
    },
  };
}
