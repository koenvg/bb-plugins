import { activityViewSchema, emptyActivity, type ActivityView } from "./activity-contract.js";
import { abortable } from "./activity-cancellation.js";

type Selection = { hostId: string | null; generation: number };
export function createActivityHandler(deps: {
  selection(): Selection;
  enrolled(hostId: string): Promise<{ status: string } | null>;
  activeReads: Set<AbortController>;
  call(hostId: string, refresh: boolean, signal: AbortSignal): Promise<unknown>;
}) {
  return async ({ hostId, generation, refresh }: { hostId: string; generation: number; refresh?: boolean }): Promise<ActivityView> => {
    const selection = deps.selection();
    if (!selection.hostId) return emptyActivity("no-selection");
    if (selection.generation !== generation) return emptyActivity("selection-changed");
    if (selection.hostId !== hostId) return emptyActivity("foreign-host");
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]);
    const changed = () => signal.aborted || deps.selection().hostId !== hostId || deps.selection().generation !== generation;
    deps.activeReads.add(controller);
    try {
      const host = await abortable(deps.enrolled(hostId), signal, null);
      if (changed()) return emptyActivity("selection-changed");
      if (!host || host.status !== "connected") return emptyActivity("host-offline");
      const result = await abortable(deps.call(hostId, refresh === true, signal), signal, null);
      if (changed()) return emptyActivity("selection-changed");
      const current = await abortable(deps.enrolled(hostId), signal, null);
      if (changed()) return emptyActivity("selection-changed");
      if (!current || current.status !== "connected") return emptyActivity("host-offline");
      const parsed = activityViewSchema.safeParse(result);
      return parsed.success ? parsed.data : emptyActivity("unsupported");
    } catch { return emptyActivity(changed() ? "selection-changed" : "host-offline"); }
    finally { deps.activeReads.delete(controller); }
  };
}
