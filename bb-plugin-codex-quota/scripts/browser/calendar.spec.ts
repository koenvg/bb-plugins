import {
  test,
  expect,
  sizes,
  viewport,
  noOverflow,
  officialLink,
  capture,
  jsonEvidence,
} from "./fixtures.js";
import { chart, calls, rows, tooltip, axFacts, interactions } from "./calendar-driver.js";
import { layout } from "./chart-layout.js";

const matrices = {
  calendar: [
    "partial",
    "unknown",
    "inactive",
    "expired",
    "huge",
    "stale",
    "unavailable",
    "loading",
    "retry",
    "latest",
    "selection",
    "cancel",
    "settings",
  ],
  money: [
    "partial",
    "no-prices",
    "tiny",
    "huge",
    "expired",
    "unknown",
    "inactive",
    "stale",
    "unavailable",
    "loading",
  ],
};
for (const [suite, states] of Object.entries(matrices))
  for (const width of sizes)
    for (const state of states) {
      test(`${suite} ${width} ${state} tokens and cost`, async ({ page }, info) => {
        await viewport(page, width);
        await page.goto(`/calendar.html?state=${state}`);
        await expect(page.getByRole("combobox", { name: "Codex host" })).toBeVisible();
        await expect(page.getByText("42% remaining", { exact: true })).toBeVisible();
        for (const label of ["Report grouping", "Report comparison", "Daily detail"])
          await expect(page.getByLabel(label)).toHaveCount(0);
        expect(await page.locator("body").innerText()).not.toContain(
          "Collection and history management",
        );
        expect(
          await page
            .locator('select[aria-label="Report metric"] option')
            .evaluateAll((options) => options.map((e) => (e as HTMLOptionElement).value)),
        ).toEqual(["tokens", "cost"]);
        const unavailable = ["unavailable", "loading", "retry"].includes(state);
        if (unavailable) {
          const message = {
            unavailable: "History storage is incompatible or unsafe.",
            loading: "Loading chart…",
            retry: "Selected host is offline.",
          }[state]!;
          await expect(page.getByText(message, { exact: false })).toBeVisible();
          await expect(page.locator(".recharts-surface")).toHaveCount(0);
        } else await chart(page);
        const facts = [];
        const captures = [];
        for (const metric of ["tokens", "cost"] as const) {
          const before = await calls(page);
          await page.getByRole("combobox", { name: "Report metric" }).selectOption(metric);
          expect(await calls(page), "Metric switch must not send an RPC").toEqual(before);
          if (!unavailable) {
            await chart(page);
            const dailyRows = await rows(page);
            expect(dailyRows).toHaveLength(30);
            const values: Record<string, Record<string, string>> = {
              tokens: { unknown: "Unavailable", inactive: "0", huge: "9,007,199,254,740,991" },
              cost: {
                partial: "$287.24",
                unknown: "Unavailable",
                inactive: "Unavailable",
                "no-prices": "Unavailable",
                huge: "$9,007,199,254,740,991",
                tiny: "$5e-324",
              },
            };
            const expected =
              values[metric][state] ?? (metric === "cost" ? "$0.39813160000000003" : "600");
            expect(dailyRows[14][1]).toBe(expected);
            expect(dailyRows[14][metric === "tokens" ? 3 : 2]).toContain(
              state === "inactive"
                ? "Observed inactivity"
                : state === "unknown"
                  ? "Unknown, uncovered gap"
                  : "Partial, recorded usage",
            );
            if (!["inactive", "unknown"].includes(state)) {
              expect(dailyRows[0][1]).toBe("Unavailable");
              expect(dailyRows[14][metric === "tokens" ? 4 : 3]).toBe("2 excluded tokens");
            }
            const tip = await tooltip(page, metric, dailyRows);
            const accessibility = await axFacts(page, dailyRows, metric);
            const measurements = await layout(page);
            expect(measurements.x.length).toBeGreaterThanOrEqual(2);
            expect(measurements.axisSpacing).not.toBeNull();
            expect(measurements.axisSpacing!.gap).toBeGreaterThanOrEqual(8);
            expect(
              measurements.x.every((label) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(label)),
            ).toBe(true);
            expect(measurements.axisSpacing!.contained).toBe(true);
            expect(measurements.tooltipContained).toBe(true);
            const theme = measurements.tooltipTheme;
            expect(theme.backgroundAlpha).toBe(1);
            expect(theme.opacity).toBe(1);
            expect(theme.textContrast.length).toBeGreaterThan(0);
            expect(theme.textContrast.every((text) => text.ratio >= 4.5)).toBe(true);
            if (!["Unavailable", "0"].includes(expected))
              expect(measurements.y.length).toBeGreaterThanOrEqual(2);
            await expect(page.locator(".recharts-yAxis")).toHaveCount(1);
            expect(await page.locator(".recharts-label").allTextContents()).toContain(
              metric === "cost" ? "USD estimate" : "Tokens",
            );
            await expect(
              page.getByRole("button", { name: "Next 30 days", exact: true }),
            ).toBeDisabled();
            facts.push({ ...tip, accessibility, theme, layout: measurements });
          }
          await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
          await expect(page.getByLabel("Estimated token summary")).toHaveCount(0);
          expect(await page.locator("body").innerText()).not.toContain(
            "Preparing history. The chart remains available.",
          );
          if (state === "partial" && metric === "tokens") {
            expect(
              (await calls(page)).filter((call) => call.method === "calendarReport").at(-1)!.input
                .query!.includeUncertain,
            ).toBe(true);
            expect((await rows(page))[14][2]).toBe("300");
            expect(
              await page.locator(".recharts-bar-rectangle path[stroke-dasharray]").count(),
            ).toBeGreaterThan(0);
          }
          await noOverflow(page);
          captures.push(await capture(page, info, `${suite}-${width}-${state}-${metric}`, false));
        }
        await interactions(page, state, suite);
        await officialLink(page);
        const requests = await calls(page);
        expect(
          requests.every((call) =>
            [
              "selection",
              "selectHost",
              "read",
              "calendarReport",
              "activity",
              "historyReadiness",
              "historicalImport",
            ].includes(call.method),
          ),
        ).toBe(true);
        for (const call of requests.filter((call) => call.method === "calendarReport")) {
          expect(call.input.query!.group).toBe("workspace");
          expect(call.input.query!.scope).toEqual({ kind: "host" });
          expect(call.input.query!.comparison).toBeFalsy();
        }
        expect(await page.evaluate("calendarFixture.errors")).toEqual([]);
        await jsonEvidence(info, "result.json", {
          suite,
          width,
          states: [state],
          status: "passed",
          captures,
          native:
            "Synthetic Chromium only. Not installed BB, screen-reader speech, real collection or billing proof.",
        });
        await jsonEvidence(info, "checks.json", {
          width,
          state,
          facts,
          calls: requests,
          layout: await layout(page),
        });
      });
    }
