import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarQuery } from "../history/calendar/calendar-contract.js";
import { reportsSchema, type MachineReports } from "./machines-contract.js";
import { combineReports } from "./combined-report.js";

export type ReportReader = (input: {
  query: CalendarQuery;
  prepare: boolean;
  refresh: boolean;
}) => Promise<unknown>;
export type SnapshotReader = (input: { query: CalendarQuery }) => Promise<unknown>;
const lastKnown = (value: MachineReports): MachineReports => ({
  ...value,
  machines: value.machines.map((row) => ({ ...row, cached: row.report.state !== "unavailable" })),
});
/** Keep responses tied to their query, including during navigation and scope changes. */
export function useMachineReport(
  query: CalendarQuery | null,
  revision: number,
  read: ReportReader,
  snapshot?: SnapshotReader,
) {
  const key = JSON.stringify(query);
  const readers = useRef({ read, snapshot });
  readers.current = { read, snapshot };
  const [source, setSource] = useState<{ key: string; value: MachineReports } | null>(null);
  const [attempt, retry] = useState(0);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const schedule = useRef<(() => void) | null>(null);
  const trigger = JSON.stringify([key, revision, attempt]);
  const scheduled = useRef(trigger);
  useEffect(() => {
    scheduled.current = trigger;
    if (!query) {
      schedule.current = null;
      setPending(false);
      return;
    }
    let active = true,
      livePublished = false,
      running = false,
      trailing = false;
    const validate = (raw: unknown) => {
      const value = reportsSchema.parse(raw);
      combineReports(value, query);
      return value;
    };
    const request = () => {
      if (!active) return;
      if (running) {
        trailing = true;
        return;
      }
      running = true;
      setPending(true);
      void Promise.resolve()
        .then(() =>
          active ? readers.current.read({ query, prepare: false, refresh: false }) : null,
        )
        .then((raw) => {
          if (!active) return;
          const value = validate(raw);
          livePublished = true;
          setSource({ key, value });
          setFailed(false);
        })
        .catch(() => {
          if (active) {
            setFailed(true);
            setSource((old) => (old?.key === key ? { key, value: lastKnown(old.value) } : old));
          }
        })
        .finally(() => {
          if (!active) return;
          running = false;
          if (trailing) {
            trailing = false;
            request();
          } else setPending(false);
        });
    };
    schedule.current = request;
    setFailed(false);
    // Neither optional storage nor remote collection can hold the other's first result.
    if (readers.current.snapshot)
      void Promise.resolve()
        .then(() => (active ? readers.current.snapshot!({ query }) : null))
        .then((raw) => {
          if (!active || livePublished) return;
          const value = lastKnown(validate(raw));
          setSource((old) =>
            old?.key === key && combineReports(old.value, query) ? old : { key, value },
          );
        })
        .catch(() => undefined);
    request();
    return () => {
      active = false;
      schedule.current = null;
    };
  }, [key]);
  useEffect(() => {
    if (scheduled.current === trigger) return;
    scheduled.current = trigger;
    schedule.current?.();
  }, [trigger]);
  const current = source?.key === key && query ? source.value : null;
  const view = useMemo(
    () => (current && query ? combineReports(current, query) : null),
    [current, key],
  );
  return {
    current,
    view,
    loading: pending && !view,
    refreshing: pending && !!view,
    failed,
    retry: () => retry((value) => value + 1),
  };
}
