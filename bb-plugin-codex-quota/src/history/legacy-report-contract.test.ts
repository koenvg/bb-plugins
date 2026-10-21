import { expect, it } from "vitest";
import { calendarSnapshot } from "./calendar/calendar-test-support.js";
import { calendarReportSchema } from "./calendar/calendar-contract.js";
import { combineReports } from "../machines/combined-report.js";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";

it("publishes scalar totals and rejects obsolete fields on the strict new contract", () => {
  const report = calendarSnapshot({
    startDate: "2026-09-02",
    timezone: "UTC",
    group: "workspace",
    scope: { kind: "host" },
    comparison: true,
  });
  const decoded = calendarReportSchema.parse(report);
  if (decoded.state === "unavailable") throw Error(decoded.reason);
  expect(decoded.summary.totalTokens).toBe(600);
  expect(decoded.days[14].totalTokens).toBe(600);
  if (decoded.comparison?.prior.state === "unavailable") throw Error("Missing comparison");
  expect(decoded.comparison?.prior.summary.totalTokens).toBe(600);
  expect(JSON.stringify(decoded)).not.toMatch(/speedTokens|otherSpeedTokens/);
  for (const speedTokens of [
    { normal: 1, fast: 0, ultrafast: 0 },
    { normal: 600, fast: -1, ultrafast: 1 },
    { normal: 600, fast: 0 },
    null,
  ]) {
    expect(
      calendarReportSchema.safeParse({ ...report, summary: { ...report.summary, speedTokens } })
        .success,
    ).toBe(false);
  }
});

it.each(["day", "model", "overflow", "prior"])(
  "rejects obsolete %s fields on new report writes",
  (target) => {
    const report: any = calendarSnapshot({
      startDate: "2026-09-02",
      timezone: "UTC",
      group: "workspace",
      scope: { kind: "host" },
      comparison: true,
    });
    if (target === "day") report.days[14].speedTokens = { normal: 600, fast: 0, ultrafast: 0 };
    if (target === "model")
      report.days[14].models = {
        named: [
          { model: "named", totalTokens: 600, speedTokens: { normal: 600, fast: 0, ultrafast: 0 } },
        ],
        otherTokens: 0,
      };
    if (target === "overflow")
      report.days[14].models = {
        named: [],
        otherTokens: 600,
        otherSpeedTokens: { normal: 600, fast: 0, ultrafast: 0 },
      };
    if (target === "prior")
      report.comparison.prior.summary.speedTokens = { normal: 600, fast: 0, ultrafast: 0 };
    expect(calendarReportSchema.safeParse(report).success).toBe(false);
  },
);

it("keeps the removed feature API absent from runtime modules", async () => {
  const root = resolve(import.meta.dirname, "..");
  for (const path of ["history/usage-speed.ts", "history/calendar/speed-totals.tsx"])
    await expect(readFile(join(root, path), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  async function inspect(folder: string): Promise<void> {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await inspect(path);
      else if (/\.(?:ts|tsx)$/u.test(path) && !path.includes(".test.")) {
        const source = await readFile(path, "utf8");
        expect(source, path).not.toMatch(
          /\b(?:SpeedMode|SpeedTokens|SpeedEvidence|SpeedTotals|normalizeSpeed|normalTokens|sumSpeed|withSpeed|recordSpeed|jointModels)\b/,
        );
      }
    }
  }
  await inspect(root);
});
it("combines aligned offline dates and does not deduplicate equal reports from separate machines", () => {
  const query = {
    startDate: "2026-09-02",
    timezone: "UTC",
    group: "workspace" as const,
    scope: { kind: "host" as const },
  };
  const report = calendarSnapshot({ ...query, startDate: "2026-09-01" });
  const result = combineReports(
    {
      machines: ["one", "two"].map((id) => ({
        machine: { id, name: id, status: "disconnected" as const },
        cached: true,
        preparation: { state: "settled" as const, progress: "fixture" },
        report,
      })),
      truncated: false,
      cache: "saved",
    },
    query,
  )!;
  expect(result.summary.totalTokens).toBe(1200);
  expect(result.days[13].totalTokens).toBe(1200);
  expect(JSON.stringify(result)).not.toMatch(/speedTokens|otherSpeedTokens/);
});
it("keeps native-private imports inside history", async () => {
  const root = resolve(import.meta.dirname, "..");
  const history = resolve(root, "history");
  async function inspect(folder: string): Promise<void> {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        await inspect(path);
        continue;
      }
      if (!/\.(?:ts|tsx)$/u.test(path) || path.startsWith(history + "/")) continue;
      const source = await readFile(path, "utf8");
      for (const match of source.matchAll(
        /(?:from\s*|import\s*\()?["']([^"']+native\/[^"']+)["']/gu,
      )) {
        const target = resolve(dirname(path), match[1]);
        expect(target.startsWith(join(history, "native")), path).toBe(false);
      }
    }
  }
  await inspect(root);
});
