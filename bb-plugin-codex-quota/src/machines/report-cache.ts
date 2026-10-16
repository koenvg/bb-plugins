import { createHash } from "node:crypto";
import { z } from "zod";
import {
  calendarReportSchema,
  type CalendarQuery,
  type CalendarSnapshot,
} from "../history/calendar/calendar-contract.js";
import { dayBoundary, latestStart, shiftDate } from "../history/calendar/calendar-time.js";
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
const sameScope = (a: CalendarQuery, b: CalendarQuery) =>
  a.timezone === b.timezone &&
  a.group === b.group &&
  !!a.comparison === !!b.comparison &&
  a.includeUncertain === b.includeUncertain &&
  JSON.stringify(a.scope) === JSON.stringify(b.scope);
const eligible = (report: CalendarSnapshot, query: CalendarQuery, clock: number) =>
  sameScope(report.query, query) &&
  query.startDate <= latestStart(clock, query.timezone) &&
  dayBoundary(query.startDate, query.timezone) >= retentionCutoffs(clock).compact &&
  dayBoundary(query.startDate, query.timezone) >= report.compactFrom &&
  report.days.some(
    (day) => day.date >= query.startDate && day.date <= shiftDate(query.startDate, 29),
  );

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
  const removeHost = async (hostId: string) => {
    const root = `${prefix}${hostId}/`;
    // The index is the durable reachability boundary when body deletion fails.
    await storage.set(root + "index", []);
    for (const key of await storage.list(root)) {
      if (key !== root + "index") await storage.delete(key);
    }
    await storage.delete(root + "index");
  };
  return {
    read(hostId: string, query: CalendarQuery): Promise<CalendarSnapshot | null> {
      return serial(async () => {
        const values = await pruneHost(hostId),
          exact = digest(query);
        values.sort((a, b) => Number(b.key === exact) - Number(a.key === exact));
        return values.find(({ report }) => eligible(report, query, now()))?.report ?? null;
      });
    },
    save(hostId: string, report: CalendarSnapshot, admit = () => true) {
      return serial(async () => {
        if (!admit()) return;
        const parsed = calendarReportSchema.parse(report);
        if (parsed.state === "unavailable") return;
        const root = `${prefix}${hostId}/`,
          key = digest(parsed.query);
        const old = (await pruneHost(hostId)).map((value) => value.key);
        if (!admit()) return;
        const keys = [key, ...old.filter((entry) => entry !== key)].slice(0, 8);
        // Ranking names can be long. Preserve daily totals within KV's 256KB bound.
        const saved =
          Buffer.byteLength(JSON.stringify(parsed)) <= 200_000
            ? parsed
            : { ...parsed, ranking: [], truncated: true };
        await storage.set(root + key, saved);
        if (!admit()) return;
        await storage.set(root + "index", keys);
        for (const remove of old.filter((entry) => !keys.includes(entry)))
          await storage.delete(root + remove);
        await pruneHost(hostId);
      });
    },
    removeQuery(hostId: string, query: CalendarQuery, admit = () => true) {
      return serial(async () => {
        if (!admit()) return;
        const root = `${prefix}${hostId}/`;
        const keys = indexSchema.parse((await storage.get<unknown>(root + "index")) ?? []);
        const remove: string[] = [];
        for (const key of keys) {
          const parsed = calendarReportSchema.safeParse(await storage.get<unknown>(root + key));
          if (
            !parsed.success ||
            parsed.data.state === "unavailable" ||
            eligible(parsed.data, query, now())
          )
            remove.push(key);
        }
        if (!admit()) return;
        // Exclude invalid summaries durably even if deleting their bodies fails.
        await storage.set(
          root + "index",
          keys.filter((key) => !remove.includes(key)),
        );
        for (const key of remove) await storage.delete(root + key);
      });
    },
    remove(hostId: string, admit = () => true) {
      return serial(async () => {
        if (!admit()) return;
        await removeHost(hostId);
      });
    },
    pruneMachines(ids: Set<string>) {
      return serial(async () => {
        const hosts = new Set(
          (await storage.list(prefix)).map((key) => key.slice(prefix.length).split("/")[0]!),
        );
        for (const hostId of hosts) if (!ids.has(hostId)) await removeHost(hostId);
        for (const hostId of ids) await pruneHost(hostId);
      });
    },
  };
}
