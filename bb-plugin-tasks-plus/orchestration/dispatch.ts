import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { TasksApiStore } from "../api";
import type { RunController } from "./run";
import { createDispatchStore } from "./dispatch-store";
import { dispatchRpcContract, type DispatchResult } from "./dispatch-contract";
import type { HandoffReader } from "./dispatch-eligibility";
import { coordinationReader } from "./dispatch-coordination";

export const MANUAL_FIRST_DISPATCH_REASON =
  "Manual-first release: orchestrator dispatch, adoption and execution are deferred. No claim or agent input was created. Operator worker controls are separate from scope approval.";

export function createDispatcher(
  bb: BbPluginApi,
  store: TasksApiStore,
  runs: RunController,
  options: { readHandoffs?: HandoffReader } = {},
) {
  const claims = createDispatchStore(bb.storage.database());
  const deferred = async (_input: unknown): Promise<DispatchResult> => ({
    outcome: "deferred",
    reason: MANUAL_FIRST_DISPATCH_REASON,
    threadId: null,
    claim: null,
    candidates: [],
  });
  return {
    dispatch: deferred,
    adopt: deferred,
    claims,
    readCoordination: coordinationReader(store, runs, claims, options.readHandoffs),
    register() {
      bb.rpc.register(dispatchRpcContract, {
        orchestrateDispatch: deferred,
        orchestrateAdopt: deferred,
      });
    },
  };
}
export type Dispatcher = ReturnType<typeof createDispatcher>;
