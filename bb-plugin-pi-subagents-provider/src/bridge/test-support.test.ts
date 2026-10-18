import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import { PI_BRIDGE_ARGS_ENV } from "./rpc-child.js";
import { fakePiPath, startFakePiBridge } from "./test-support.js";

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function traceFixture(phase: string, pids: number[], workspaceDir: string): void {
  process.stderr.write(
    `${JSON.stringify({
      phase,
      pids,
      alive: pids.map(isAlive),
      workspaceExists: existsSync(workspaceDir),
    })}\n`,
  );
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
    traceFixture("teardown returned", pids, harness.workspaceDir);
    expect(pids.map(isAlive)).toEqual([false]);
    expect(existsSync(harness.workspaceDir)).toBe(false);
  } finally {
    for (const pid of pids) {
      if (isAlive(pid)) process.kill(pid, "SIGKILL");
    }
    await harness.teardown();
  }
}, 30_000);

it("settles interrupted startup before removing launch files and preserves the startup error", async () => {
  const harness = await startFakePiBridge({
    prefix: "bb-pi-startup-teardown-",
    initialize: true,
    processLog: true,
  });
  const preload = join(harness.workspaceDir, "hold-startup.mjs");
  writeFileSync(
    preload,
    `
    import { appendFileSync } from "node:fs";
    if (!process.argv.includes("--version")) {
      process.on("SIGTERM", () => undefined);
      setInterval(() => undefined, 60_000);
      appendFileSync(process.env.FAKE_PI_PROCESS_LOG, \`spawn:\${process.pid}:\${process.ppid}\\n\`);
      await new Promise(() => undefined);
    }
  `,
  );
  vi.stubEnv(
    PI_BRIDGE_ARGS_ENV,
    JSON.stringify(["--import", pathToFileURL(preload).href, fakePiPath]),
  );
  const starting = harness.startThread("thr_interrupted_startup");
  let pids: number[] = [];
  try {
    await harness.waitFor(() => harness.readProcessLog().spawned.length === 1, "fixture preload");
    pids = harness.readProcessLog().spawned;
    traceFixture("startup blocked", pids, harness.workspaceDir);
    await harness.teardown();
    traceFixture("startup teardown returned", pids, harness.workspaceDir);
    expect(pids.map(isAlive)).toEqual([false]);
    expect(existsSync(harness.workspaceDir)).toBe(false);
    const response = await starting;
    expect(response.error).toMatchObject({
      code: -32000,
      message: expect.stringContaining("pi exited"),
    });
    expect(response.error?.message).toContain("signal SIGKILL");
  } finally {
    for (const pid of pids) {
      if (isAlive(pid)) process.kill(pid, "SIGKILL");
    }
    await starting;
    await harness.teardown();
  }
}, 30_000);
