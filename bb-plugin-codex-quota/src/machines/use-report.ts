import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarQuery } from "../history/calendar/calendar-contract.js";
import { reportsSchema, type MachineReports } from "./machines-contract.js";
import { combineReports } from "./combined-report.js";

export type ReportReader = (input: {
  query: CalendarQuery;
  prepare: boolean;
  refresh: boolean;
}) => Promise<unknown>;
/** Keep responses tied to their query, including during navigation and scope changes. */
export function useMachineReport(
  query: CalendarQuery | null,
  revision: number,
  read: ReportReader,
) {
  const key = JSON.stringify(query),
    reader = useRef(read);
  reader.current = read;
  const [source, setSource] = useState<{ key: string; value: MachineReports } | null>(null);
  const [attempt, retry] = useState(0);
  const [loading, setLoading] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!query) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void Promise.resolve()
      .then(() => (active ? reader.current({ query, prepare: false, refresh: false }) : null))
      .then((raw) => {
        if (!active) return;
        const value = reportsSchema.parse(raw);
        combineReports(value, query);
        setSource({ key, value });
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, attempt, revision]);
  const current = source?.key === key && query ? source.value : null;
  const view = useMemo(
    () => (current && query ? combineReports(current, query) : null),
    [current, key],
  );
  return { current, view, loading, failed, retry: () => retry((value) => value + 1) };
}
