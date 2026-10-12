import { test, expect, noOverflow, capture, jsonEvidence } from "./fixtures.js";
import { chart, rows, axFacts, tooltip } from "./calendar-driver.js";
import { layout } from "./chart-layout.js";

for (const width of [375, 1280])
  for (const theme of ["light", "dark"] as const) {
    test(`model stacks and exact facts at ${width}px ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/calendar.html?state=models");
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
