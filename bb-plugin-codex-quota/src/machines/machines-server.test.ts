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
import { comparisonReasons } from "../history/calendar/calendar-comparison.js";

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
      shifted = { ...query, startDate: shiftDate(query.startDate, -1) };
    const result = combineReports(
      await next.reports({ query: shifted, prepare: false, refresh: false }),
      shifted,
    )!;
    expect(result.summary.totalTokens).toBe(1200);
    expect(result.days[15]?.totalTokens).toBe(1200);
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

describe("saved machine observations", () => {
  it("opens durable 1200 tokens and cost 6 after restart without dispatching any host work", async () => {
    const f = fixture(),
      first = f.create();
    expect(
      combineReports(await first.reports({ query, prepare: false, refresh: false }), query)
        ?.summary,
    ).toMatchObject({ totalTokens: 1200, capturedCost: 6 });
    first.dispose();
    f.report.mockClear().mockImplementation(() => new Promise(() => {}));
    f.prepare.mockClear().mockImplementation(() => new Promise(() => {}));
    f.observe.mockClear().mockImplementation(() => new Promise(() => {}));
    const restarted = f.create();
    const saved = reportsSchema.parse(await restarted.lastKnown(query));
    expect(combineReports(saved, query)?.summary).toMatchObject({
      totalTokens: 1200,
      capturedCost: 6,
    });
    expect(
      saved.machines.map((row) => [
        row.cached,
        row.report.state !== "unavailable" && row.report.observedAt,
      ]),
    ).toEqual([
      [true, "2026-10-01T12:00:00.000Z"],
      [true, "2026-10-01T12:00:00.000Z"],
    ]);
    expect([
      f.report.mock.calls.length,
      f.prepare.mock.calls.length,
      f.observe.mock.calls.length,
    ]).toEqual([0, 0, 0]);
    restarted.dispose();
  });

  it("keeps a cold machine unknown and excludes removed enrollment", async () => {
    const f = fixture(),
      service = f.create();
    const cold = await service.lastKnown(query);
    expect(cold.machines.map((row) => row.report)).toEqual([
      { state: "unavailable", reason: "host-offline" },
      { state: "unavailable", reason: "host-offline" },
    ]);
    await service.reports({ query, prepare: false, refresh: false });
    f.setMachines([machineFixture("host_two"), machineFixture("host_cold")]);
    const saved = await service.lastKnown(query);
    expect(saved.machines.map((row) => row.machine.id)).toEqual(["host_two", "host_cold"]);
    expect(saved.machines[1]?.report).toEqual({ state: "unavailable", reason: "host-offline" });
    expect(combineReports(saved, query)?.summary).toMatchObject({
      totalTokens: 600,
      capturedCost: 3,
    });
    service.dispose();
  });

  it("enforces requested retention, future dates and every non-date query dimension", async () => {
    const f = fixture(),
      service = f.create();
    await service.reports({ query, prepare: false, refresh: false });
    for (const changed of [
      { ...query, startDate: shiftDate(query.startDate, 1) },
      { ...query, startDate: "2020-01-01" },
      { ...query, timezone: "Europe/Brussels" },
      { ...query, group: "thread" as const, includeUncertain: false },
      { ...query, includeUncertain: false },
      { ...query, includeUncertain: false, comparison: true },
      { ...query, scope: { kind: "workspace" as const, workspace: "/other" } },
    ])
      expect(combineReports(await service.lastKnown(changed), changed)).toBeNull();
    const overlapping = { ...query, startDate: shiftDate(query.startDate, -1) };
    expect(
      combineReports(await service.lastKnown(overlapping), overlapping)?.summary.totalTokens,
    ).toBe(1200);
    service.dispose();
  });

  it("fails closed during overlapping mutations and does not dispatch after failed initial invalidation", async () => {
    const f = fixture(),
      service = f.create();
    await service.reports({ query, prepare: false, refresh: false });
    let finishOne!: () => void, finishTwo!: () => void;
    const one = service.mutate(
      "host_one",
      () =>
        new Promise<void>((done) => {
          finishOne = done;
        }),
    );
    const two = service.mutate(
      "host_one",
      () =>
        new Promise<void>((done) => {
          finishTwo = done;
        }),
    );
    await vi.waitFor(() =>
      expect([typeof finishOne, typeof finishTwo]).toEqual(["function", "function"]),
    );
    finishOne();
    await one;
    const during = await service.reports({ query, prepare: false, refresh: false });
    expect(during.machines[0]?.report).toEqual({
      state: "unavailable",
      reason: "selection-changed",
    });
    expect(combineReports(await service.lastKnown(query), query)?.summary.totalTokens).toBe(600);
    finishTwo();
    await two;
    const set = f.storage.set;
    f.storage.set = async (key, value) => {
      if (key.startsWith("machine-summary-v1/host_one/")) throw Error("write failure");
      await set(key, value);
    };
    const work = vi.fn(async () => 1);
    await expect(service.mutate("host_one", work)).rejects.toThrow();
    expect(work).not.toHaveBeenCalled();
    const blocked = await service.lastKnown(query);
    expect(blocked.cache).toBe("unavailable");
    expect(combineReports(blocked, query)?.summary.totalTokens).toBe(600);
    f.storage.set = set;
    service.dispose();
  });

  it.each(["storage-incompatible", "range-unavailable"] as const)(
    "durably excludes %s summaries before failed payload deletion",
    async (reason) => {
      const f = fixture(),
        service = f.create();
      await service.reports({ query, prepare: false, refresh: false });
      const overlap = { ...query, startDate: shiftDate(query.startDate, -1) };
      await service.reports({ query: overlap, prepare: false, refresh: false });
      const remove = f.storage.delete;
      f.storage.delete = async (key) => {
        if (key.startsWith("machine-summary-v1/host_one/")) throw Error("delete failure");
        await remove(key);
      };
      f.report.mockImplementation(async (id, q) =>
        id === "host_one" ? calendarUnavailable(reason) : recordedFixture(q, now),
      );
      const invalid = await service.reports({ query, prepare: false, refresh: false });
      expect(invalid.cache).toBe("unavailable");
      expect(invalid.machines[0]?.report).toEqual({ state: "unavailable", reason });
      expect(combineReports(invalid, query)?.summary.totalTokens).toBe(600);
      service.dispose();
      const restarted = f.create();
      const saved = await restarted.lastKnown(query);
      expect(saved.machines[0]?.cached).toBe(false);
      expect(combineReports(saved, query)?.summary).toMatchObject({
        totalTokens: 600,
        capturedCost: 3,
      });
      restarted.dispose();
    },
  );

  it("reports corruption and storage failure as unknown, never zero", async () => {
    const f = fixture(),
      service = f.create();
    await service.reports({ query, prepare: false, refresh: false });
    await f.storage.set("machine-summary-v1/host_one/index", ["not-a-digest"]);
    const corrupt = await service.lastKnown(query);
    expect(corrupt.cache).toBe("unavailable");
    expect(combineReports(corrupt, query)?.summary.totalTokens).toBe(600);
    f.storage.get = async () => {
      throw Error("read failure");
    };
    const failed = await service.lastKnown(query);
    expect(failed.cache).toBe("unavailable");
    expect(failed.machines.map((row) => row.report.state)).toEqual(["unavailable", "unavailable"]);
    service.dispose();
  });
  it.each([false, true])(
    "retires saved results when invalidation arrives during final enrollment verification, failure=%s",
    async (failure) => {
      const f = fixture(),
        service = f.create();
      await service.reports({ query, prepare: false, refresh: false });
      let finish!: () => void;
      const get = f.deps.get;
      f.deps.get = async (id) => {
        if (id === "host_one")
          await new Promise<void>((done) => {
            finish = done;
          });
        return get(id);
      };
      const pending = service.lastKnown(query);
      await vi.waitFor(() => expect(typeof finish).toBe("function"));
      if (failure) {
        const set = f.storage.set;
        f.storage.set = async (key, value) => {
          if (key.startsWith("machine-summary-v1/host_one/")) throw Error("write failure");
          await set(key, value);
        };
        await expect(service.invalidate("host_one")).rejects.toThrow("write failure");
      } else await service.invalidate("host_one");
      finish();
      const saved = await pending;
      expect(saved.cache).toBe(failure ? "unavailable" : "saved");
      expect(saved.machines[0]?.report).toEqual({
        state: "unavailable",
        reason: "selection-changed",
      });
      expect(combineReports(saved, query)?.summary).toMatchObject({
        totalTokens: 600,
        capturedCost: 3,
      });
      service.dispose();
    },
  );

  it("fences an already-started cache save before management host work can begin", async () => {
    const f = fixture(),
      service = f.create();
    await service.reports({ query, prepare: false, refresh: false });
    const get = f.storage.get;
    let hold = false,
      entered!: () => void,
      release!: () => void;
    const waiting = new Promise<void>((done) => {
      entered = done;
    });
    f.report.mockImplementation(async (_id, q) => {
      hold = true;
      return recordedFixture(q, now);
    });
    f.storage.get = async <T>(key: string) => {
      if (hold && key === "machine-summary-v1/host_one/index") {
        hold = false;
        entered();
        await new Promise<void>((done) => {
          release = done;
        });
      }
      return get<T>(key);
    };
    const pending = service.reports({ query, prepare: false, refresh: false });
    await waiting;
    const work = vi.fn(async () => 7);
    const mutation = service.mutate("host_one", work);
    expect(work).not.toHaveBeenCalled();
    release();
    expect(await mutation).toBe(7);
    const retired = await pending;
    expect(retired.machines[0]?.report).toEqual({
      state: "unavailable",
      reason: "selection-changed",
    });
    expect(combineReports(retired, query)?.summary.totalTokens).toBe(600);
    f.storage.get = get;
    expect(combineReports(await service.lastKnown(query), query)?.summary.totalTokens).toBe(600);
    service.dispose();
  });

  it("keeps current comparison totals when prior is unavailable, but rejects starts before snapshot retention", async () => {
    const f = fixture(),
      service = f.create();
    const comparison = { ...query, includeUncertain: false, comparison: true };
    f.report.mockImplementation(async (_id, q) => {
      const value = recordedFixture(q, now);
      value.compactFrom = q.startDate + "T00:00:00.000Z";
      if (value.comparison) {
        value.comparison.prior = { state: "unavailable", reason: "range-unavailable" };
        value.comparison.reasons = comparisonReasons(value, value.comparison.prior);
      }
      return value;
    });
    await service.reports({ query: comparison, prepare: false, refresh: false });
    const saved = await service.lastKnown(comparison);
    expect(combineReports(saved, comparison)?.summary).toMatchObject({
      totalTokens: 1200,
      capturedCost: 6,
    });
    expect(
      saved.machines[0]?.report.state !== "unavailable" &&
        saved.machines[0]?.report.comparison?.prior,
    ).toEqual({ state: "unavailable", reason: "range-unavailable" });
    const earlier = { ...comparison, startDate: shiftDate(comparison.startDate, -1) };
    expect(combineReports(await service.lastKnown(earlier), earlier)).toBeNull();
    service.dispose();
  });
  it("retires an in-flight observation after another response definitively rejects its history", async () => {
    const f = fixture(),
      service = f.create();
    await service.reports({ query, prepare: false, refresh: false });
    let finish!: (value: unknown) => void;
    f.report.mockImplementationOnce(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    );
    const old = service.reports({ query, prepare: false, refresh: false });
    await vi.waitFor(() => expect(typeof finish).toBe("function"));
    f.report.mockImplementation(async (id, q) =>
      id === "host_one" ? calendarUnavailable("storage-incompatible") : recordedFixture(q, now),
    );
    const authoritative = await service.reports({ query, prepare: false, refresh: false });
    expect(authoritative.machines[0]?.report).toEqual({
      state: "unavailable",
      reason: "storage-incompatible",
    });
    expect(combineReports(authoritative, query)?.summary.totalTokens).toBe(600);
    finish(recordedFixture(query, now));
    const retired = await old;
    expect(retired.machines[0]?.report).toEqual({
      state: "unavailable",
      reason: "selection-changed",
    });
    expect(combineReports(await service.lastKnown(query), query)?.summary).toMatchObject({
      totalTokens: 600,
      capturedCost: 3,
    });
    service.dispose();
  });
  it.each([
    ["saved", false],
    ["saved", true],
    ["live", false],
    ["live", true],
  ] as const)(
    "retires completed %s rows when another host delays publication, invalidation failure=%s",
    async (mode, failure) => {
      const f = fixture(),
        service = f.create();
      await service.reports({ query, prepare: false, refresh: false });
      let entered!: () => void,
        finish!: () => void,
        firstHostChecks = 0;
      const waiting = new Promise<void>((done) => {
        entered = done;
      });
      const held = new Promise<void>((done) => {
        finish = done;
      });
      const get = f.deps.get;
      f.deps.get = async (id) => {
        if (id === "host_two") {
          entered();
          await held;
        } else firstHostChecks++;
        return get(id);
      };
      try {
        const pending =
          mode === "saved"
            ? service.lastKnown(query)
            : service.reports({ query, prepare: false, refresh: false });
        await waiting;
        await vi.waitFor(() => expect(firstHostChecks).toBe(mode === "saved" ? 1 : 3));
        await new Promise<void>((done) => setTimeout(done, 0));
        const set = f.storage.set;
        if (failure)
          f.storage.set = async (key, value) => {
            if (key === "machine-summary-v1/host_one/index")
              throw Error("invalidation unavailable");
            return set(key, value);
          };
        if (failure)
          await expect(service.invalidate("host_one")).rejects.toThrow("invalidation unavailable");
        else await service.invalidate("host_one");
        f.storage.set = set;
        f.deps.get = get;
        finish();
        const result = await pending;
        expect(combineReports(result, query)?.summary).toMatchObject({
          totalTokens: 600,
          capturedCost: 3,
        });
        expect(result.machines.find((row) => row.machine.id === "host_one")).toMatchObject({
          cached: false,
          report: { state: "unavailable", reason: "selection-changed" },
        });
        expect(result.cache).toBe(failure ? "unavailable" : "saved");
        expect(combineReports(await service.lastKnown(query), query)?.summary.totalTokens).toBe(
          600,
        );
      } finally {
        finish();
        service.dispose();
      }
    },
  );
});
