import { existsSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { startFakePiBridge } from "./test-support.js";

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

it("reaps an uncooperative fixture before removing its workspace", async () => {
  const harness = await startFakePiBridge({
    prefix: "bb-pi-teardown-",
    initialize: true,
    processLog: true,
  });
  vi.stubEnv("FAKE_PI_HANG_ON_CLOSE", "1");
  let pids: number[] = [];
  try {
    const started = await harness.startThread("thr_teardown");
    expect(started.result).toMatchObject({ providerThreadId: expect.stringMatching(/^pi_/) });
    pids = harness.readProcessLog().spawned;
    expect(pids).toHaveLength(1);
    expect(pids.map(isAlive)).toEqual([true]);
    await harness.teardown();
    expect(pids.map(isAlive)).toEqual([false]);
    expect(existsSync(harness.workspaceDir)).toBe(false);
  } finally {
    for (const pid of pids) {
      if (isAlive(pid)) process.kill(pid, "SIGKILL");
    }
    await harness.teardown();
  }
}, 30_000);
