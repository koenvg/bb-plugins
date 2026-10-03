import type { ActionResult, RunMergeActionRequest } from "../contract";
import { messageOf } from "./error-message";

type Request = Omit<RunMergeActionRequest, "threadId">;
export type MergeOperationState =
  | { kind: "idle" }
  | ({ kind: "running" } & Request)
  | { kind: "error"; message: string; headOid: string };

const IDLE: MergeOperationState = { kind: "idle" };

export function createMergeOperations() {
  const states = new Map<string, MergeOperationState>();
  const listeners = new Map<string, Set<() => void>>();
  const snapshot = (threadId: string): MergeOperationState => states.get(threadId) ?? IDLE;
  const prune = (threadId: string) => {
    if (!listeners.has(threadId) && snapshot(threadId).kind !== "running") states.delete(threadId);
  };
  function publish(threadId: string, state: MergeOperationState) {
    states.set(threadId, state);
    listeners.get(threadId)?.forEach((notify) => notify());
    prune(threadId);
  }
  function subscribe(threadId: string, notify: () => void) {
    const entries = listeners.get(threadId) ?? new Set();
    entries.add(notify);
    listeners.set(threadId, entries);
    return () => {
      entries.delete(notify);
      if (entries.size === 0) listeners.delete(threadId);
      prune(threadId);
    };
  }
  async function run(threadId: string, request: Request, send: () => Promise<ActionResult>) {
    if (snapshot(threadId).kind === "running") return;
    publish(threadId, { kind: "running", ...request });
    let result: ActionResult;
    try {
      result = await send();
    } catch (error) {
      result = { kind: "error", message: messageOf(error) };
    }
    publish(threadId, result.kind === "error" ? { ...result, headOid: request.expectedHeadOid } : IDLE);
  }
  function dismiss(threadId: string) {
    if (snapshot(threadId).kind === "error") publish(threadId, IDLE);
  }
  return { snapshot, subscribe, run, dismiss };
}

export const mergeOperations = createMergeOperations();
