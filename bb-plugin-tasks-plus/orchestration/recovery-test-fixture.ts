import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { fixture, historicalOwner, type NativeHistoryReads } from "./dispatch-test-fixture";
import { createDispatchStore } from "./dispatch-store";

type Fixture = Awaited<ReturnType<typeof fixture>>;

// Recovery tests can vary native history reads without simulating worker creation.
export async function recoveryFixture() {
  const history: NativeHistoryReads = {};
  const f = await fixture(1, undefined, history);
  return {
    ...f,
    setListing: (read: NonNullable<NativeHistoryReads["list"]>) => {
      history.list = read;
    },
    setReadInterruptions: (read: NonNullable<NativeHistoryReads["interruptions"]>) => {
      history.interruptions = read;
    },
  };
}

// Import old creation history into isolated storage. Never invoke worker APIs.
export function historicalAttempt(f: Fixture) {
  const claim = historicalOwner(f);
  return { claim, threadId: claim.threadId };
}

export function historicalUnknown(f: Fixture, threadId?: string) {
  const claims = createDispatchStore(f.bb.storage.database());
  const reserved = claims.reserve(f.input);
  const claim = claims.update(reserved.id, {
    phase: "creation_unknown",
    reason: "Historical creation unknown after transport loss",
  });
  if (threadId) {
    f.workers.set(
      threadId,
      makeThreadResponse({
        id: threadId,
        projectId: "proj_fixture",
        parentThreadId: "thr_coordinator",
        originPluginId: f.bb.pluginId,
        status: "active",
        createdAt: Date.parse(claim.createdAt),
      }),
    );
    f.metadata.set(threadId, {
      orchestration: {
        version: 1,
        attemptId: claim.id,
        taskId: claim.taskId,
        role: claim.role,
        runId: claim.runId,
        coordinatorThreadId: claim.coordinatorThreadId,
        bbProjectId: "proj_fixture",
      },
    });
  }
  return { claim, threadId: threadId ?? null };
}
