import { describe, expect, it, vi } from "vitest";
import { createMachineCoordinator } from "./machines-server.js";
import { accountsSchema, reportsSchema } from "./machines-contract.js";
import { combineReports } from "./combined-report.js";
import { footerAllowance } from "./accounts-store.js";
import {
  memorySummaries,
  machineFixture,
  quotaFixture,
  recordedFixture,
} from "./machines.test-support.js";
import { emptyActivity } from "../activity/activity-contract.js";
import { calendarUnavailable, type CalendarQuery } from "../history/calendar/calendar-contract.js";
import { latestStart, shiftDate } from "../history/calendar/calendar-time.js";
import { preparationUnavailable } from "../history/report-preparation-contract.js";

const now = Date.UTC(2026, 9, 1, 12);
const query: CalendarQuery = {
  startDate: latestStart(now, "UTC"),
  timezone: "UTC",
  group: "workspace",
  scope: { kind: "host" },
  includeUncertain: true,
};
function fixture(storage = memorySummaries()) {
  let machines = [machineFixture(), machineFixture("host_two")];
  const observe = vi.fn(
    async (_id: string, _input: unknown, _signal: AbortSignal): Promise<unknown> => ({
      proof: "a".repeat(64),
      quota: quotaFixture(now),
      activity: emptyActivity("unavailable"),
    }),
  );
  const report = vi.fn(
    async (_id: string, input: CalendarQuery, _signal: AbortSignal): Promise<unknown> =>
      recordedFixture(input, now),
  );
  const prepare = vi.fn(async (_id: string, _signal: AbortSignal, _refresh: boolean) =>
    preparationUnavailable("not-configured"),
  );
  const deps = {
    storage,
    now: () => now,
    list: async () => machines,
    get: async (id: string) => machines.find((row) => row.id === id) ?? null,
    observe,
    report,
    prepare,
  };
  return {
    storage,
    deps,
    observe,
    report,
    prepare,
    setMachines: (next: typeof machines) => {
      machines = next;
    },
    create: () => createMachineCoordinator(deps),
  };
}
describe("all-machine public reports", () => {
  it("reads every enrolled machine, adds only recorded history, and keeps shared paths separate", async () => {
    const f = fixture(),
      service = f.create();
    const accounts = accountsSchema.parse(
      await service.accounts({ refresh: false, includeActivity: false }),
    );
    expect(accounts.accounts).toHaveLength(1);
    expect(accounts.accounts[0]?.machines).toEqual(["host_one", "host_two"]);
    expect(JSON.stringify(accounts)).not.toContain("a".repeat(64));
    expect(footerAllowance(accounts, now).label).toBe("63%");
    const input = reportsSchema.parse(
      await service.reports({ query, prepare: false, refresh: false }),
    );
    const result = combineReports(input, query);
    expect(result?.summary).toMatchObject({ totalTokens: 1200, capturedCost: 6, records: 2 });
    expect(result?.ranking.map((row) => row.key)).toEqual([
      "host_one:/synthetic/workspace-1",
      "host_two:/synthetic/workspace-1",
    ]);
    expect(f.report.mock.calls.map((call) => call[0])).toEqual(["host_one", "host_two"]);
    expect(f.prepare).not.toHaveBeenCalled();
    service.dispose();
  });
  it("groups distinct accounts without adding quota percentages or duplicating account-wide activity", async () => {
    const f = fixture();
    f.observe.mockImplementation(async (id) => ({
      proof: (id === "host_one" ? "a" : "b").repeat(64),
      quota: quotaFixture(now, id === "host_one" ? 63 : 38),
      activity: emptyActivity("unavailable"),
    }));
    const service = f.create();
    const result = await service.accounts({ refresh: true, includeActivity: false });
    expect(result.accounts).toHaveLength(2);
    expect(footerAllowance(result, now)).toMatchObject({ label: "38%", known: false });
    expect(
      f.observe.mock.calls.every(
        (call) => (call[1] as { includeActivity: boolean }).includeActivity === false,
      ),
    ).toBe(true);
    service.dispose();
  });
  it("retains validated offline history and associations across coordinator restart, without persisting quota", async () => {
    const f = fixture();
    const first = f.create();
    await first.accounts({ refresh: false, includeActivity: false });
    await first.reports({ query, prepare: false, refresh: false });
    first.dispose();
    f.setMachines([
      machineFixture("host_one", "disconnected"),
      machineFixture("host_two", "disconnected"),
    ]);
    const restarted = f.create();
    const data = await restarted.reports({ query, prepare: false, refresh: false });
    expect(data.machines.every((row) => row.cached)).toBe(true);
    expect(combineReports(data, query)?.summary.totalTokens).toBe(1200);
    const accounts = await restarted.accounts({ refresh: false, includeActivity: false });
    expect(accounts.accounts).toHaveLength(1);
    expect(footerAllowance(accounts, now).label).toBe("—");
    expect(f.observe).toHaveBeenCalledTimes(2);
    const persisted = await Promise.all((await f.storage.list()).map((key) => f.storage.get(key)));
    expect(JSON.stringify(persisted)).not.toMatch(
      /remainingPercent|access_token|transcript|account-shared/,
    );
    restarted.dispose();
  });
  it("aligns cached dates after restart rather than shifting old totals into the new range", async () => {
    const f = fixture(),
      first = f.create();
    await first.reports({ query, prepare: false, refresh: false });
    first.dispose();
    f.setMachines([
      machineFixture("host_one", "disconnected"),
      machineFixture("host_two", "disconnected"),
    ]);
    const next = f.create(),
      shifted = { ...query, startDate: shiftDate(query.startDate, 1) };
    const result = combineReports(
      await next.reports({ query: shifted, prepare: false, refresh: false }),
      shifted,
    )!;
    expect(result.summary.totalTokens).toBe(1200);
    expect(result.days[13]?.totalTokens).toBe(1200);
    expect(result.days[14]?.totalTokens).toBe(0);
    expect(result.days[29]?.coverage.zero).toBe(false);
    expect(result.ranking).toHaveLength(0);
    expect(result).toMatchObject({ incomplete: true, adjusted: true, truncated: true });
    const far = { ...query, startDate: shiftDate(query.startDate, 200) };
    expect(
      combineReports(await next.reports({ query: far, prepare: false, refresh: false }), far),
    ).toBeNull();
    next.dispose();
  });
  it("clears old summaries when a machine explicitly reports incompatible history", async () => {
    const f = fixture(),
      service = f.create();
    await service.reports({ query, prepare: false, refresh: false });
    f.report.mockResolvedValue(calendarUnavailable("storage-incompatible"));
    expect(
      (await service.reports({ query, prepare: false, refresh: false })).machines.every(
        (row) => row.report.state === "unavailable" && !row.cached,
      ),
    ).toBe(true);
    f.setMachines([
      machineFixture("host_one", "disconnected"),
      machineFixture("host_two", "disconnected"),
    ]);
    expect(
      combineReports(await service.reports({ query, prepare: false, refresh: false }), query),
    ).toBeNull();
    service.dispose();
  });
  it("marks absent history as unknown instead of a certified zero or fresh quota", async () => {
    const f = fixture();
    f.setMachines([machineFixture("host_one", "disconnected"), machineFixture("host_two")]);
    const service = f.create();
    const accounts = await service.accounts({ refresh: false, includeActivity: false });
    expect(footerAllowance(accounts, now)).toMatchObject({ label: "63%", known: true });
    const result = combineReports(
      await service.reports({ query, prepare: false, refresh: false }),
      query,
    )!;
    expect(result.summary.totalTokens).toBe(600);
    expect(result.incomplete).toBe(true);
    expect(result.days.every((day) => day.coverage.zero === false)).toBe(true);
    service.dispose();
  });
  it("does not publish results or cached summaries after enrollment removal", async () => {
    const f = fixture(),
      service = f.create();
    await service.reports({ query, prepare: false, refresh: false });
    let resolve!: (value: unknown) => void;
    f.report.mockImplementation(
      async () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    f.setMachines([machineFixture()]);
    const pending = service.reports({ query, prepare: false, refresh: false });
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    f.setMachines([]);
    resolve(recordedFixture(query, now));
    expect((await pending).machines).toHaveLength(0);
    expect(
      (await service.accounts({ refresh: false, includeActivity: false })).machines,
    ).toHaveLength(0);
    expect((await f.storage.list("machine-summary-v1/")).length).toBe(0);
    service.dispose();
  });
  it("does not retain credentials or invalid host fields, and signals failed summary persistence", async () => {
    const f = fixture();
    f.observe.mockResolvedValue({
      proof: "a".repeat(64),
      quota: quotaFixture(now),
      activity: emptyActivity("unavailable"),
      access_token: "secret-token",
    });
    const service = f.create();
    expect(
      (await service.accounts({ refresh: false, includeActivity: false })).accounts.every(
        (row) => row.quota.snapshot === null && row.identity === "unknown",
      ),
    ).toBe(true);
    f.storage.set = async () => {
      throw new Error("storage unavailable");
    };
    const result = await service.reports({ query, prepare: false, refresh: false });
    expect(result.cache).toBe("unavailable");
    expect(combineReports(result, query)?.summary.totalTokens).toBe(1200);
    service.dispose();
  });
  it("rejects unsafe cumulative counts rather than silently losing token precision", () => {
    const input = {
      machines: [machineFixture(), machineFixture("host_two")].map((machine) => ({
        machine,
        cached: false,
        preparation: preparationUnavailable("not-configured"),
        report: recordedFixture(query, now),
      })),
      truncated: false,
      cache: "saved" as const,
    };
    input.machines[0]!.report.days[14]!.totalTokens = Number.MAX_SAFE_INTEGER;
    expect(() => combineReports(input, query)).toThrow();
  });
});
