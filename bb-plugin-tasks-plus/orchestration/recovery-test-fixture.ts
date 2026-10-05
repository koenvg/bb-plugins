import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { fixture, historicalOwner } from "./dispatch-test-fixture";
import { createDispatchStore } from "./dispatch-store";

type Fixture = Awaited<ReturnType<typeof fixture>>;

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
