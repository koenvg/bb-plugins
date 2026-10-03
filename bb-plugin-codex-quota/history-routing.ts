import { historyReadinessSchema, historyUnavailable, type HistoryRequest } from "./history-contract.js";

type Dependencies = {
  selection(): { hostId: string | null; generation: number };
  enrolled(hostId: string): Promise<{ status: string } | null>;
  call(hostId: string, signal: AbortSignal): Promise<unknown>;
  activeReads: Set<AbortController>;
};

export function createHistoryReader(deps: Dependencies) {
  return async ({ hostId, generation }: HistoryRequest) => {
    const selected = deps.selection();
    if (!selected.hostId) return historyUnavailable("no-selection");
    if (generation !== selected.generation) return historyUnavailable("selection-changed");
    if (hostId !== selected.hostId) return historyUnavailable("foreign-host");
    const controller = new AbortController();
    deps.activeReads.add(controller);
    const changed = () => controller.signal.aborted || deps.selection().hostId !== hostId || deps.selection().generation !== generation;
    try {
      const host = await deps.enrolled(hostId);
      if (changed()) return historyUnavailable("selection-changed");
      if (!host || host.status !== "connected") return historyUnavailable("host-offline");
      const result = await deps.call(hostId, controller.signal);
      if (changed()) return historyUnavailable("selection-changed");
      const current = await deps.enrolled(hostId);
      if (changed()) return historyUnavailable("selection-changed");
      if (!current || current.status !== "connected") return historyUnavailable("host-offline");
      const parsed = historyReadinessSchema.safeParse(result);
      return parsed.success ? parsed.data : historyUnavailable("unsupported");
    } catch { return historyUnavailable(changed() ? "selection-changed" : "unsupported"); }
    finally { deps.activeReads.delete(controller); }
  };
}
