import { describe, expect, it, vi } from "vitest";
import { planWeeklyCheck, type SetupPorts } from "./setup.ts";

const projectId = "proj_fixture";
const serverHostId = "host_fixture";
const source = { projectId, hostId: serverHostId, path: "/srv/bb-fixture", kind: "project-source" as const, expiresAt: null, durable: true };
function ports() {
  const scheduler = { list: vi.fn(async () => ({ complete: true, records: [] as any[] })), create: vi.fn(), update: vi.fn(), resume: vi.fn(), run: vi.fn(), pause: vi.fn(), delete: vi.fn() };
  const p: SetupPorts = {
    sources: vi.fn(async () => ({ complete: true, records: [source] })),
    inspect: vi.fn(async (root: string) => ({ ready: true as const, root, packageDir: `${root}/bb-plugin-pi-subagents-provider`, sourceRevision: "a".repeat(40) })),
    schedules: scheduler.list,
  };
  return { p, scheduler };
}

  it("never returns a wrapper plan for a thread path even if it is a normal clone", async () => {
    const { p, scheduler } = ports();
    p.sources = async () => ({ complete: true, records: [{ ...source, path: "/srv/thr_owned/source" }] });
    const plan = await planWeeklyCheck({ projectId, serverHostId }, p);
    expect(plan).toMatchObject({ action: "blocked" });
    expect(p.inspect).not.toHaveBeenCalled();
    expect(scheduler.list).not.toHaveBeenCalled();
    expect(scheduler.create).not.toHaveBeenCalled();
  });
describe("inert project-owned weekly setup planning", () => {
  it("plans an explicit Monday UTC script and reuses one exact owned record", async () => {
    const { p, scheduler } = ports();
    const first = await planWeeklyCheck({ projectId, serverHostId }, p);
    expect(first).toMatchObject({ action: "create-after-approval", cron: "0 9 * * 1", timezone: "UTC", projectId, source: source.path });
    if (first.action !== "create-after-approval") throw new Error("expected plan");
    scheduler.list.mockResolvedValue({ complete: true, records: [{ id: "owned-fixture", projectId, name: first.name, script: first.script, cron: first.cron, timezone: first.timezone, mode: "script", interpreter: "bash", workingDirectory: { type: "automation-storage" }, enabled: true }] });
    expect(await planWeeklyCheck({ projectId, serverHostId }, p)).toMatchObject({ action: "reuse", id: "owned-fixture" });
    for (const key of ["create", "update", "resume", "run", "pause", "delete"] as const) expect(scheduler[key]).not.toHaveBeenCalled();
  });
  it.each([
    { records: [] }, { records: [{ ...source, kind: "worktree" }] },
    { records: [{ ...source, expiresAt: "2030-01-01" }] },
    { records: [{ ...source, durable: false }] },
    { records: [{ ...source, hostId: "host_other" }] },
    { records: [source, source] }, { complete: false },
    { records: [{ ...source, path: "/srv/worktrees/worker" }] },
  ])("blocks missing, expiring, or ambiguous source %j", async (patch) => {
    const { p, scheduler } = ports();
    p.sources = vi.fn(async () => ({ complete: true, records: [source], ...patch } as Awaited<ReturnType<SetupPorts["sources"]>>));
    expect(await planWeeklyCheck({ projectId, serverHostId }, p)).toMatchObject({ action: "blocked" });
    expect(scheduler.list).not.toHaveBeenCalled();
    expect(scheduler.create).not.toHaveBeenCalled();
  });

  it("blocks failed prerequisite lookup before consulting schedules", async () => {
    const { p, scheduler } = ports();
    p.inspect = async () => ({ ready: false, reason: "Missing committed checker or baseline" });
    expect(await planWeeklyCheck({ projectId, serverHostId }, p)).toEqual({ action: "blocked", reason: "Missing committed checker or baseline" });
    expect(scheduler.list).not.toHaveBeenCalled();
    expect(scheduler.create).not.toHaveBeenCalled();
  });

  it("preserves paused records and rejects duplicate, damaged, or changed ownership", async () => {
    const { p, scheduler } = ports();
    const plan = await planWeeklyCheck({ projectId, serverHostId }, p);
    if (plan.action !== "create-after-approval") throw new Error("expected plan");
    const record = { id: "fixture", projectId, name: plan.name, script: plan.script, cron: plan.cron, timezone: plan.timezone, mode: "script", interpreter: "bash", workingDirectory: { type: "automation-storage" }, enabled: false };
    scheduler.list.mockResolvedValue({ complete: true, records: [record] });
    expect(await planWeeklyCheck({ projectId, serverHostId }, p)).toMatchObject({ action: "reuse", enabled: false });
    for (const records of [[record, record], [{ ...record, problem: "invalid-stored-data" }], [{ ...record, cron: "0 8 * * 1" }], [{ ...record, script: `${record.script}\nchanged` }], [{ ...record, projectId: "proj_other" }]]) {
      scheduler.list.mockResolvedValue({ complete: true, records });
      expect(await planWeeklyCheck({ projectId, serverHostId }, p)).toMatchObject({ action: "blocked" });
    }
    scheduler.list.mockResolvedValue({ complete: false, records: [] });
    expect(await planWeeklyCheck({ projectId, serverHostId }, p)).toMatchObject({ action: "blocked" });
    for (const key of ["create", "update", "resume", "run", "pause", "delete"] as const) expect(scheduler[key]).not.toHaveBeenCalled();
  });

  it("does not register a schedule on plugin install or reload", async () => {
    const { createFakePluginHost } = await import("@get-bb/plugin-sdk/testing");
    const { default: plugin } = await import("../../server.js");
    const host = createFakePluginHost({ pluginId: "pi-subagents-provider" });
    await plugin(host.bb);
    await host.harness.lifecycle.install();
    await host.harness.lifecycle.reload(plugin);
    expect(host.harness.registrations.schedules).toEqual([]);
    await host.harness.lifecycle.dispose();
  });
});
