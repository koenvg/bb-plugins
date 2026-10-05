import { describe, expect, it } from "vitest";
import { fixture, historicalOwner } from "./dispatch-test-fixture";
import { createDispatchStore } from "./dispatch-store";
import { expectNoAgentInput } from "./dispatch-test-fixture";

describe("manual-first ownership history", () => {
  it("keeps the original claim and owner on retries, detach and deferred adoption", async () => {
    const f = await fixture();
    const original = historicalOwner(f);
    const claims = createDispatchStore(f.bb.storage.database());
    const owners = claims.owners(f.task.id);
    for (let n = 0; n < 2; n++)
      expect(await f.dispatch()).toMatchObject({ outcome: "deferred", claim: null });
    await f.harness.behavior.callRpc("taskThreadsDetach", {
      taskId: f.task.id,
      threadId: original.threadId,
    });
    expect(
      await f.harness.behavior.callRpc("orchestrateAdopt", {
        ...f.input,
        associationId: original.associationId,
      }),
    ).toMatchObject({ outcome: "deferred" });
    expect(claims.get(original.id)).toEqual(original);
    expect(claims.owners(f.task.id)).toEqual(owners);
    expectNoAgentInput(f.harness);
  });
});
