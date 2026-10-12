import { expect, it } from "vitest";
import { normalizeSpeed, normalTokens, speedModes } from "./usage-speed.js";
import { calendarSnapshot } from "./calendar/calendar-test-support.js";
import { calendarReportSchema } from "./calendar/calendar-contract.js";
import { combineReports } from "../machines/combined-report.js";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";

it("uses exactly three speeds and puts absent and unknown tiers in Normal", () => {
  expect(speedModes.map((value) => value.mode)).toEqual(["normal", "fast", "ultrafast"]);
  for (const value of [undefined, null, "default", "normal", "unknown", "FAST", 17])
    expect(normalizeSpeed(value)).toBe("normal");
  expect(normalizeSpeed("priority")).toBe("fast");
  expect(normalizeSpeed("fast")).toBe("fast");
  expect(normalizeSpeed("ultrafast")).toBe("ultrafast");
});
it("decodes old day, summary and comparison totals, but rejects malformed present buckets", () => {
  const report = calendarSnapshot({
    startDate: "2026-09-02",
    timezone: "UTC",
    group: "workspace",
    scope: { kind: "host" },
    comparison: true,
  });
  const decoded = calendarReportSchema.parse(report);
  if (decoded.state === "unavailable") throw Error(decoded.reason);
  expect(decoded.summary.speedTokens).toEqual(normalTokens(600));
  expect(decoded.days[14].speedTokens).toEqual(normalTokens(600));
  if (decoded.comparison?.prior.state === "unavailable") throw Error("Missing comparison");
  expect(decoded.comparison?.prior.summary.speedTokens).toEqual(normalTokens(600));
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
it("combines aligned offline dates and does not deduplicate equal reports from separate machines", () => {
  const query = {
    startDate: "2026-09-02",
    timezone: "UTC",
    group: "workspace" as const,
    scope: { kind: "host" as const },
  };
  const report = calendarSnapshot({ ...query, startDate: "2026-09-01" });
  report.days[14].speedTokens = { normal: 100, fast: 200, ultrafast: 300 };
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
  expect(result.summary.speedTokens).toEqual({ normal: 200, fast: 400, ultrafast: 600 });
  expect(result.days[13].speedTokens).toEqual(result.summary.speedTokens);
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
