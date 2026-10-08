import { expect, it, vi } from "vitest";
import { PiSessionInputs } from "./session-inputs.js";

function deferredStreaming() {
  let resolve!: (streaming: boolean) => void;
  const promise = new Promise<boolean>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

it("consumes duplicate text one input at a time without mixing queues", async () => {
  const inputs = new PiSessionInputs(() => null);
  const first = inputs.track("followUp");
  const second = inputs.track("followUp");
  const steer = inputs.track("steering");
  const secondConsumed = vi.fn();
  const steerConsumed = vi.fn();
  void second.consumed.then(secondConsumed);
  void steer.consumed.then(steerConsumed);
  inputs.observe({ type: "queue_update", followUp: ["same", "same"], steering: ["same"] });
  expect(first.wasQueued).toBe(true);
  expect(second.wasQueued).toBe(true);
  inputs.observe({ type: "queue_update", followUp: ["same"], steering: ["same"] });
  await first.consumed;
  expect(secondConsumed).not.toHaveBeenCalled();
  expect(steerConsumed).not.toHaveBeenCalled();
  // Repeated snapshots must not consume another copy.
  inputs.observe({ type: "queue_update", followUp: ["same"], steering: ["same"] });
  await Promise.resolve();
  expect(secondConsumed).not.toHaveBeenCalled();
  inputs.observe({ type: "queue_update", followUp: [], steering: ["same"] });
  await second.consumed;
  expect(steerConsumed).not.toHaveBeenCalled();
  inputs.observe({ type: "queue_update", followUp: [], steering: [] });
  await steer.consumed;
  expect(first.wasQueued).toBe(true);
});

it("acknowledges only the tracked input and ignores repeated acknowledgements", async () => {
  const inputs = new PiSessionInputs(() => null);
  const failed = inputs.track("followUp");
  const accepted = inputs.track("followUp");
  const failure = expect(failed.consumed).rejects.toThrow("prompt failed");
  failed.acknowledge(new Error("prompt failed"));
  failed.acknowledge();
  accepted.acknowledge();
  await failure;
  await accepted.consumed;
  expect(accepted.wasQueued).toBe(false);
});

it("drops terminal steering only after an idle state probe, leaving follow-ups pending", async () => {
  const probe = deferredStreaming();
  const readStreaming = vi.fn(() => probe.promise);
  const inputs = new PiSessionInputs(readStreaming);
  const steer = inputs.track("steering");
  const followUp = inputs.track("followUp");
  const dropped = expect(steer.consumed).rejects.toThrow("Pi turn ended before steer was consumed");
  inputs.observe({ type: "agent_end", willRetry: true });
  expect(readStreaming).not.toHaveBeenCalled();
  inputs.observe({ type: "agent_end" });
  inputs.observe({ type: "agent_end" });
  expect(readStreaming).toHaveBeenCalledTimes(1);
  probe.resolve(false);
  await dropped;
  followUp.acknowledge();
  await followUp.consumed;
});

it("keeps terminal steering pending while the child is streaming", async () => {
  const inputs = new PiSessionInputs(async () => true);
  const steer = inputs.track("steering");
  inputs.observe({ type: "agent_end" });
  await Promise.resolve();
  await Promise.resolve();
  steer.acknowledge();
  await steer.consumed;
});

it("invalidates a terminal probe on auto retry and rejects steering if retry fails", async () => {
  const probe = deferredStreaming();
  const inputs = new PiSessionInputs(() => probe.promise);
  const steer = inputs.track("steering");
  const dropped = expect(steer.consumed).rejects.toThrow(
    "Pi auto retry ended before steer was consumed",
  );
  inputs.observe({ type: "agent_end" });
  inputs.observe({ type: "auto_retry_start" });
  probe.resolve(false);
  await probe.promise;
  await Promise.resolve();
  inputs.observe({ type: "auto_retry_end", success: false });
  await dropped;
});

it("does not let an old terminal probe reject input tracked after disposal", async () => {
  const probe = deferredStreaming();
  const inputs = new PiSessionInputs(() => probe.promise);
  const old = inputs.track("steering");
  const exited = expect(old.consumed).rejects.toThrow("child exited");
  inputs.observe({ type: "agent_end" });
  inputs.rejectPending("child exited");
  const current = inputs.track("steering");
  probe.resolve(false);
  await exited;
  await probe.promise;
  await Promise.resolve();
  current.acknowledge();
  await current.consumed;
});

it("keeps a consumed steer accepted if a terminal probe completes later", async () => {
  const probe = deferredStreaming();
  const inputs = new PiSessionInputs(() => probe.promise);
  const steer = inputs.track("steering");
  inputs.observe({ type: "queue_update", steering: ["steer"] });
  inputs.observe({ type: "agent_end" });
  inputs.observe({ type: "queue_update", steering: [] });
  await steer.consumed;
  probe.resolve(false);
  await probe.promise;
  await expect(steer.consumed).resolves.toBeUndefined();
});
