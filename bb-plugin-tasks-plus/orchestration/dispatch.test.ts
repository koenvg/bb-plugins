import { describe, expect, it } from "vitest";
import { fixture } from "./dispatch-test-fixture";
import { createDispatchStore } from "./dispatch-store";
import { expectNoAgentInput } from "./dispatch-test-fixture";

describe("deferred dispatch public contracts", () => {
  it.each(["implementation", "orchestrator", "integration"])(
    "defers %s RPC and CLI before any claim or ownership side effect",
    async (role) => {
      const f = await fixture();
      const requests = [
        () => f.harness.behavior.callRpc("orchestrateDispatch", { ...f.input, role }),
        () =>
          f.harness.behavior.callRpc("orchestrateAdopt", {
            ...f.input,
            role,
            associationId: "missing",
          }),
        () =>
          f.harness.behavior
            .runCli(
              [
                "orchestrate",
                "dispatch",
                f.task.key,
                "--run",
                f.input.runId,
                "--role",
                role,
                "--json",
              ],
              { threadId: "thr_coordinator" },
            )
            .then((r) => JSON.parse(r.stdout!)),
        () =>
          f.harness.behavior
            .runCli(
              [
                "orchestrate",
                "adopt",
                f.task.key,
                "--association",
                "missing",
                "--run",
                f.input.runId,
                "--role",
                role,
                "--json",
              ],
              { threadId: "thr_coordinator" },
            )
            .then((r) => JSON.parse(r.stdout!)),
      ];
      for (const request of requests)
        expect(await request()).toMatchObject({ outcome: "deferred", claim: null, threadId: null });
      expectNoAgentInput(f.harness);
      const claims = createDispatchStore(f.bb.storage.database());
      expect(claims.claims(f.task.id)).toEqual([]);
      expect(claims.owners(f.task.id)).toEqual([]);
      expect(f.store.tasks.getTask(f.task.id)?.status).toBe("backlog");
    },
  );
  it("still defers with a paused or changed scope instead of attempting execution validation", async () => {
    const f = await fixture();
    await f.pause();
    f.setCoordinatorProject("changed");
    expect(await f.dispatch()).toMatchObject({ outcome: "deferred", claim: null });
    expectNoAgentInput(f.harness);
  });
});
