import { describe, expect, it } from "vitest";
import plugin from "../server";
import { fixture, historicalOwner } from "./dispatch-test-fixture";
import { createDispatchStore } from "./dispatch-store";
import { expectNoAgentInput } from "./dispatch-test-fixture";

describe("manual-first startup and reload", () => {
  it("registers no new input admission or execution callback and preserves historical attempts", async () => {
    const f = await fixture();
    const original = historicalOwner(f);
    expectNoAgentInput(f.harness);
    const loaded = await f.harness.lifecycle.reload(plugin);
    try {
      expectNoAgentInput(loaded.harness);
      expect(await loaded.harness.behavior.callRpc("orchestrateDispatch", f.input)).toMatchObject({ outcome: "deferred" });
      expect(createDispatchStore(loaded.bb.storage.database()).get(original.id)).toEqual(original);
      expectNoAgentInput(loaded.harness);
    } finally { await loaded.harness.lifecycle.dispose(); }
  });
});
