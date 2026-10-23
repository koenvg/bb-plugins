import { test, expect, noOverflow, capture, jsonEvidence, reportTheme } from "./fixtures.js";
import { chart, rows, axFacts, tooltip, calls } from "./calendar-driver.js";
import { layout } from "./chart-layout.js";

for (const width of [375, 1280])
  for (const theme of ["light", "dark"] as const) {
    test(`model stacks and exact facts at ${width}px ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/calendar.html?state=models");
      await reportTheme(page, theme);
      await chart(page);
      const legend = page.getByLabel("Models", { exact: true });
      await expect(legend).toHaveText("gpt-5.3-codexgpt-5.4");
      await expect(legend).not.toContainText("Input");
      const table = page.getByRole("table", { name: "Daily recorded usage" });
      await expect(table.locator("thead th").last()).toHaveText("gpt-5.4 tokens");
      const dailyRows = await rows(page);
      expect(dailyRows[14].slice(-2)).toEqual(["240", "360"]);
      expect(dailyRows[0].slice(-2)).toEqual(["Unavailable", "Unavailable"]);
      const accessibility = await axFacts(page, dailyRows, "tokens");
      await capture(page, info, `model-graph-${width}-${theme}`);
      const input = await tooltip(page, "tokens", dailyRows);
      const modelTip = page.getByLabel("Tokens by model", { exact: true });
      await expect(modelTip.locator("li")).toHaveText(["gpt-5.3-codex240", "gpt-5.4360"]);
      await expect(modelTip.locator("[title]").nth(0)).toHaveAttribute("title", "240 tokens");
      await expect(modelTip.locator("[title]").nth(1)).toHaveAttribute("title", "360 tokens");
      const measurements = await layout(page);
      expect(measurements.tooltipContained).toBe(true);
      await noOverflow(page);
      await jsonEvidence(info, "models.json", { width, theme, input, accessibility, measurements });
      await capture(page, info, `models-${width}-${theme}`);
    });
  }

for (const width of [375, 1280])
  for (const theme of ["light", "dark"] as const)
    test(`captured model cost stacks and filters at ${width}px ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/calendar.html?state=model-costs");
      await reportTheme(page, theme);
      await chart(page);
      await expect(page.getByRole("heading", { name: "Top 10 threads" })).toBeVisible();
      const metric = page.getByRole("group", { name: "Chart metric" });
      const legend = page.getByRole("group", { name: "Models", exact: true });
      await legend.getByRole("button", { name: "A", exact: true }).click();
      const requests = await calls(page);
      await metric.getByRole("button", { name: "Estimated cost", exact: true }).click();
      await expect(legend.getByRole("button")).toHaveText(["A", "B"]);
      const a = legend.getByRole("button", { name: "A", exact: true });
      const b = legend.getByRole("button", { name: "B", exact: true });
      await expect(a).toHaveAttribute("aria-pressed", "true");
      const daily = await rows(page);
      expect(daily[14][1]).toBe("$10.00");
      expect(daily[14].slice(-2)).toEqual([
        "$4.00 · 1 of 59 records priced · pricing partial",
        "$6.00 · 1 of 1 records priced · pricing available",
      ]);
      const fullBars = async () =>
        page.locator(".ts-chart__bar rect").evaluateAll((nodes) =>
          nodes
            .filter((node) => Number(node.getAttribute("height")) > 0)
            .map((node) => ({
              height: Number(node.getAttribute("height")),
              y: Number(node.getAttribute("y")),
              fill: getComputedStyle(node).fill,
            })),
        );
      const initial = await fullBars();
      expect(initial).toHaveLength(2);
      expect(initial[0].height / initial[1].height).toBeCloseTo(4 / 6, 2);
      const bounds = await page.locator(".ts-chart__grid line").evaluateAll((lines) => {
        const positions = lines.map((line) => Number(line.getAttribute("y1")));
        return { top: Math.min(...positions), bottom: Math.max(...positions) };
      });
      const plotHeight = Math.round((bounds.bottom - bounds.top) * 100) / 100;
      const ticks = await page.locator("[data-ts-key^='y-tick-label:']").allTextContents();
      expect(ticks).toEqual(["$0", "$3", "$5", "$8", "$10"]);
      const facts = await axFacts(page, daily, "cost");
      await tooltip(page, "cost", daily);
      const costTip = page.getByLabel("Captured cost by model", { exact: true });
      await expect(costTip.locator("li")).toHaveText(["APartial$4.00", "B$6.00"]);
      await a.focus();
      await page.keyboard.press("Space");
      await expect(a).toHaveAttribute("aria-pressed", "false");
      await expect(a).toBeFocused();
      expect(await fullBars()).toEqual([{ ...initial[1], height: plotHeight, y: bounds.top }]);
      expect(await rows(page)).toEqual(daily);
      expect(await page.locator("[data-ts-key^='y-tick-label:']").allTextContents()).toEqual([
        "$0",
        "$2",
        "$3",
        "$5",
        "$6",
      ]);
      await expect(page.getByLabel("Captured cost subtotal")).toHaveText("$10.00");
      await tooltip(page, "cost", daily);
      await expect(costTip.locator("li")).toHaveCount(2);
      await b.click();
      expect(await fullBars()).toEqual([]);
      expect(await page.locator("[data-ts-key^='y-tick-label:']").allTextContents()).toEqual([
        "$0",
      ]);
      await expect(
        page.getByRole("status").filter({ hasText: "All model cost series hidden" }),
      ).toHaveText("All model cost series hidden. Recorded usage is not zero.");
      await page.getByRole("button", { name: "Restore all series", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(b).toBeFocused();
      expect(await fullBars()).toEqual(initial);
      expect(await page.locator("[data-ts-key^='y-tick-label:']").allTextContents()).toEqual(ticks);
      await metric.getByRole("button", { name: "Tokens", exact: true }).click();
      await expect(legend.getByRole("button", { name: "A", exact: true })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await metric.getByRole("button", { name: "Estimated cost", exact: true }).click();
      await expect(a).toHaveAttribute("aria-pressed", "true");
      expect(await calls(page)).toEqual(requests);
      await tooltip(page, "cost", daily);
      const measurements = await layout(page);
      expect(measurements.tooltipContained).toBe(true);
      await noOverflow(page);
      await jsonEvidence(info, "model-costs.json", {
        width,
        theme,
        daily,
        initial,
        ticks,
        facts,
        measurements,
      });
      await capture(page, info, `model-costs-${width}-${theme}`);
    });

for (const width of [375, 1280])
  for (const theme of ["light", "dark"] as const)
    test(`distilled captured model prices at ${width}px ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/calendar.html?state=cost-distilled");
      await reportTheme(page, theme);
      await chart(page);
      await page
        .getByRole("group", { name: "Chart metric" })
        .getByRole("button", { name: "Estimated cost", exact: true })
        .click();
      const daily = await rows(page);
      expect(daily[14][1]).toBe("$323.73");
      expect(daily[14].slice(-4)).toEqual([
        "Unavailable · 0 of 3 records priced · pricing unavailable",
        "$55.75 · 360 of 360 records priced · pricing available",
        "$1.66 · 31 of 35 records priced · pricing partial",
        "$266.31 · 7662 of 7674 records priced · pricing partial",
      ]);
      const facts = await axFacts(page, daily, "cost");
      await tooltip(page, "cost", daily);
      const card = page.getByRole("tooltip");
      await expect(card.locator("dl dd").first()).toHaveText("$323.73");
      await expect(card.locator("dl dd").first()).toHaveAttribute("title", "USD 323.7267296");
      const models = card.getByRole("list", { name: "Captured cost by model", exact: true });
      await expect(models.locator("li")).toHaveText([
        "gpt5.5No price",
        "gpt6-astra$55.75",
        "gpt6-solPartial$1.66",
        "gpt6.1-solPartial$266.31",
      ]);
      await expect(models.locator("li").nth(1)).toHaveAttribute(
        "title",
        "$55.75 · 360 of 360 records priced · pricing available; captured USD 55.753468",
      );
      await expect(card).not.toContainText("records priced");
      const priceEdges = await models
        .locator("li > span:last-child")
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().right));
      expect(new Set(priceEdges).size).toBe(1);
      const measurements = await layout(page);
      expect(measurements.tooltipContained).toBe(true);
      await noOverflow(page);
      await jsonEvidence(info, "distilled-prices.json", { daily, facts, measurements, priceEdges });
      await capture(page, info, `distilled-prices-${width}-${theme}`);
    });
