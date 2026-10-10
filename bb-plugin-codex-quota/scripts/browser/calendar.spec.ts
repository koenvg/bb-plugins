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
    "offline",
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
        await expect(page.getByRole("combobox", { name: "Codex host" })).toHaveCount(0);
        await expect(page.getByLabel("Shared account allowance")).toContainText("42%");
        for (const label of ["Report grouping", "Report comparison", "Daily detail"])
          await expect(page.getByLabel(label)).toHaveCount(0);
        expect(await page.locator("body").innerText()).not.toContain(
          "Collection and history management",
        );
        await expect(
          page.getByRole("group", { name: "Chart metric" }).getByRole("button"),
        ).toHaveText(["Tokens", "Estimated cost"]);
        const unavailable = ["unavailable", "loading", "retry"].includes(state);
        if (unavailable) {
          await expect(
            page.getByText(
              state === "loading"
                ? "Loading recorded usage…"
                : "No usable recorded history for this range.",
              { exact: false },
            ),
          ).toBeVisible();
          await expect(page.locator(".recharts-surface")).toHaveCount(0);
        } else await chart(page);
        await expect(
          page.getByRole("group", { name: "Usage grouping" }).getByRole("button"),
        ).toHaveText(["Threads", "Workspaces"]);
        await expect(page.getByRole("button", { name: "Threads", exact: true })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        if (state === "partial") {
          const ranking = page.getByRole("table", { name: "Recorded usage ranking" });
          await expect(ranking.locator("tbody tr")).toHaveCount(10);
          const before = await rows(page);
          const readsBefore = (await calls(page)).filter(
            (call) => call.method === "machineReports" && call.input.query!.group === "workspace",
          ).length;
          await page.getByRole("button", { name: "Workspaces", exact: true }).click();
          await expect(page.getByRole("heading", { name: "Top 10 workspaces" })).toBeVisible();
          await expect(ranking.locator("tbody tr")).toHaveCount(10);
          expect(await rows(page)).toEqual(before);
          expect(
            (await calls(page)).filter(
              (call) => call.method === "machineReports" && call.input.query!.group === "workspace",
            ),
          ).toHaveLength(readsBefore);
          await page.getByRole("button", { name: "Threads", exact: true }).click();
          await expect(page.getByRole("heading", { name: "Top 10 threads" })).toBeVisible();
          expect(await rows(page)).toEqual(before);
        }
        const facts = [];
        const captures = [];
        for (const metric of ["tokens", "cost"] as const) {
          const before = await calls(page);
          await page
            .getByRole("group", { name: "Chart metric" })
            .getByRole("button", {
              name: metric === "tokens" ? "Tokens" : "Estimated cost",
              exact: true,
            })
            .click();
          expect(await calls(page), "Metric switch must not send an RPC").toEqual(before);
          if (!unavailable) {
            await chart(page);
            const dailyRows = await rows(page);
            expect(dailyRows).toHaveLength(30);
            const values: Record<string, Record<string, string>> = {
              tokens: {
                unknown: "Unavailable",
                inactive: "0",
                huge: "9,007,199,254,740,991",
                offline: "1,200",
              },
              cost: {
                partial: "$287.24",
                unknown: "Unavailable",
                inactive: "Unavailable",
                "no-prices": "Unavailable",
                huge: "$9,007,199,254,740,991",
                tiny: "$5e-324",
                offline: "$0.7962632000000001",
              },
            };
            const expected =
              values[metric][state] ?? (metric === "cost" ? "$0.39813160000000003" : "600");
            expect(dailyRows[14][1]).toBe(expected);
            expect(dailyRows[14][metric === "tokens" ? 3 : 2]).toContain(
              state === "inactive" ? "Observed inactivity" : "Partial, coverage gaps",
            );
            if (!["inactive", "unknown"].includes(state)) {
              expect(dailyRows[0][1]).toBe("Unavailable");
              expect(dailyRows[14][metric === "tokens" ? 4 : 3]).toBe(
                state === "offline" ? "4 excluded tokens" : "2 excluded tokens",
              );
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
              (await calls(page))
                .filter(
                  (call) =>
                    call.method === "machineReports" && call.input.query!.group === "workspace",
                )
                .at(-1)!.input.query!.includeUncertain,
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
              "machineAccounts",
              "machinePreparation",
              "machineReports",
              "selection",
              "selectHost",
              "historyReadiness",
              "historicalImport",
            ].includes(call.method),
          ),
        ).toBe(true);
        for (const call of requests.filter((call) => call.method === "machineReports")) {
          expect(call.input.query!.includeUncertain).toBe(call.input.query!.group === "workspace");
          expect(call.input).toMatchObject({ prepare: false, refresh: false });
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
