import { readHostCalendar } from "./calendar-host.js";
import {
  calendarUnavailable,
  type CalendarQuery,
  type CalendarReport,
} from "./calendar-contract.js";
import {
  historyUnavailable,
  type HistoryReadiness,
  type CollectorAction,
  type LegacyConfirmation,
} from "./history-contract.js";
import { createImportOperation, type ImportContext } from "./import-host.js";
import { importUnavailable, type ImportCommand, type ImportView } from "./import-contract.js";
import {
  createHistoryMaintenance,
  type HistoryDependencies,
  type HistoryReadContext,
} from "./history-maintenance.js";
import { abortable } from "./activity-cancellation.js";
export type { HistoryReadContext } from "./history-maintenance.js";

export interface HostHistory {
  read(context: HistoryReadContext): Promise<HistoryReadiness>;
  report(query: CalendarQuery, context: HistoryReadContext): Promise<CalendarReport>;
  control(
    action: CollectorAction,
    context: HistoryReadContext,
    confirmation?: LegacyConfirmation,
  ): Promise<HistoryReadiness>;
  controlImport(command: ImportCommand, context: ImportContext): Promise<ImportView>;
  dispose(): void;
}

/** Own the history queue, cancellation and import epochs, not the caller. */
export function createHostHistory(deps: HistoryDependencies = {}): HostHistory {
  let queue = Promise.resolve<unknown>(null);
  const lifecycle = new AbortController();
  const maintenance = createHistoryMaintenance(deps);
  const importOperation = createImportOperation({
    storage: deps.storage,
    now: deps.now,
    bodyRead: deps.bodyRead,
  });
  const importControllers = new Map<string, AbortController>();
  const importEpochs = new Map<string, number>();
  const serialize = <T, C extends { signal: AbortSignal }>(
    context: C,
    work: (context: C) => Promise<T>,
    canceled: T,
    drain = false,
  ): Promise<T> => {
    const signal = AbortSignal.any([context.signal, lifecycle.signal]);
    const scoped = { ...context, signal };
    const result = queue.then(() => (signal.aborted ? canceled : work(scoped)));
    // Cancellation releases the caller, not the database queue. Even an uncooperative
    // adapter must finish before another operation can enter storage.
    queue = result.catch(() => null);
    // Import callers hold worker leases and must wait for actual database cleanup.
    return drain ? result : abortable(result, signal, canceled);
  };
  return {
    read: (context) =>
      serialize(context, (scoped) => maintenance(scoped), historyUnavailable("selection-changed")),
    report: (query, context) =>
      serialize(
        context,
        (scoped) => readHostCalendar({ ...scoped, calendar: query }, deps),
        calendarUnavailable("selection-changed"),
      ),
    control: (action, context, confirmation) =>
      serialize(
        context,
        (scoped) => maintenance(scoped, action, confirmation),
        historyUnavailable("selection-changed"),
      ),
    controlImport: (command, context) => {
      if (command.action === "cancel" && !context.signal.aborted && !lifecycle.signal.aborted) {
        importEpochs.set(context.hostId, (importEpochs.get(context.hostId) ?? 0) + 1);
        importControllers.get(context.hostId)?.abort();
      }
      const epoch = importEpochs.get(context.hostId) ?? 0;
      return serialize(
        context,
        async (scoped) => {
          const controller = new AbortController();
          if ((importEpochs.get(scoped.hostId) ?? 0) !== epoch) controller.abort();
          const signal = AbortSignal.any([scoped.signal, controller.signal]);
          importControllers.set(scoped.hostId, controller);
          try {
            return await importOperation(command, { ...scoped, signal });
          } finally {
            if (importControllers.get(scoped.hostId) === controller)
              importControllers.delete(scoped.hostId);
          }
        },
        importUnavailable("selection-changed"),
        true,
      );
    },
    dispose() {
      lifecycle.abort();
    },
  };
}
