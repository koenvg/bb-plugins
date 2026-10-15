import { historyReadinessSchema } from "./history-contract.js";
import {
  maintenanceRequestSchema,
  maintenanceUnavailable,
  repairResultSchema,
  type MaintenanceRequest,
  type MaintenanceResult,
} from "./collector-maintenance-contract.js";

type Dependencies = {
  get(
    hostId: string,
  ): Promise<{ id: string; type: string; lifecycle: { phase: string }; status: string } | null>;
  readiness(
    hostId: string,
    signal: AbortSignal,
    beforeDispatch: () => Promise<void>,
  ): Promise<unknown>;
  repair(hostId: string, signal: AbortSignal): Promise<unknown>;
  mutate<T>(hostId: string, work: () => Promise<T>): Promise<T>;
};
export function createCollectorMaintenance(deps: Dependencies) {
  const lifetime = new AbortController();
  async function eligibility(hostId: string) {
    try {
      const host = await deps.get(hostId);
      if (
        !host ||
        host.id !== hostId ||
        host.type !== "persistent" ||
        host.lifecycle.phase !== "active"
      )
        return "host-unapproved" as const;
      return host.status === "connected" ? null : ("host-offline" as const);
    } catch {
      return "host-unapproved" as const;
    }
  }
  return {
    dispose: () => lifetime.abort(),
    async run(request: MaintenanceRequest, cancellation?: AbortSignal): Promise<MaintenanceResult> {
      const { hostId, operation } = maintenanceRequestSchema.parse(request);
      const signal = AbortSignal.any([
        lifetime.signal,
        AbortSignal.timeout(12_000),
        ...(cancellation ? [cancellation] : []),
      ]);
      let dispatched = false;
      let dispatchFailure: "host-unapproved" | "host-offline" | null = null;
      const beforeDispatch = async () => {
        signal.throwIfAborted();
        dispatchFailure = await eligibility(hostId);
        signal.throwIfAborted();
        if (dispatchFailure) throw Error("Collector maintenance target unavailable");
        dispatched = true;
      };
      const unavailable = (reason: Parameters<typeof maintenanceUnavailable>[0]) =>
        maintenanceUnavailable(reason, dispatched ? "may-have-run" : "not-started");
      const work = (async (): Promise<MaintenanceResult> => {
        try {
          if (signal.aborted) return unavailable("canceled");
          const denied = await eligibility(hostId);
          if (signal.aborted) return unavailable("canceled");
          if (denied) return unavailable(denied);
          const result = await deps.mutate(hostId, async (): Promise<MaintenanceResult> => {
            if (signal.aborted) return unavailable("canceled");
            if (operation === "repair-existing") {
              await beforeDispatch();
              signal.throwIfAborted();
            }
            const raw =
              operation === "readiness"
                ? await deps.readiness(hostId, signal, beforeDispatch)
                : await deps.repair(hostId, signal);
            if (operation === "readiness") {
              const parsed = historyReadinessSchema.safeParse(raw);
              return parsed.success
                ? { kind: "checked", readiness: parsed.data }
                : unavailable("unsupported");
            }
            const parsed = repairResultSchema.safeParse(raw);
            return parsed.success ? parsed.data : unavailable("unsupported");
          });
          if (signal.aborted) return unavailable("canceled");
          const lost = await eligibility(hostId);
          if (signal.aborted) return unavailable("canceled");
          if (lost) return unavailable(lost);
          return result;
        } catch {
          return unavailable(signal.aborted ? "canceled" : (dispatchFailure ?? "unsupported"));
        }
      })();
      // The cancellation result samples dispatch state at settlement, not request creation.
      return new Promise((resolve) => {
        const canceled = () => resolve(unavailable("canceled"));
        signal.addEventListener("abort", canceled, { once: true });
        void work.then((result) => {
          signal.removeEventListener("abort", canceled);
          resolve(result);
        });
        if (signal.aborted) canceled();
      });
    },
  };
}
