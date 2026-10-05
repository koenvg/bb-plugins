import { describe, expect, it } from "vitest";
import { fixture } from "./dispatch-test-fixture";
import { createRunController } from "./run";
import { createDispatcher } from "./dispatch";
import { readEpicStatus } from "./status";

describe("composed dispatch status contract", () => {
  it("projects readiness without leaking dispatch handoff references", async () => {
    const f = await fixture();
    const dispatcher = createDispatcher(f.bb, f.store, createRunController(f.bb, f.store), {
      readHandoffs: () => ({
        state: "ready",
        reason: "Fixture report available",
        references: ["report:fixture"],
      }),
    });
    const result = await readEpicStatus(f.bb, f.store, f.epic.id, dispatcher.readCoordination);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.status.subtasks[0]!.handoff).toEqual({
      state: "ready",
      reason: "Fixture report available",
    });
    expect(result.status.subtasks[0]!.latestOutcome.state).toBe("unknown");
    expect(result.status.acceptance.state).toBe("unknown");
    expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(0);
    expect(f.harness.inspection.sdk.callsTo("threads.send")).toHaveLength(0);
  });
});
