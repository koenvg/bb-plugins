import { test, expect, noOverflow, capture, jsonEvidence, reportTheme } from "./fixtures.js";
import { chart, rows, tooltip } from "./calendar-driver.js";

for (const width of [375, 1280])
  for (const theme of ["light", "dark"] as const) {
    test(`scalar model totals ${width}px ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/calendar.html?state=model-totals");
      await reportTheme(page, theme);
      await chart(page);
      const legend = page.getByLabel("Models", { exact: true });
      await expect(legend).toHaveText("gpt-6.1gpt-6.1-sol");
      await expect(legend).not.toContainText(/Default|Fast|Ultrafast/);
      const daily = await rows(page);
      expect(daily[14].slice(-2)).toEqual(["100", "500"]);
      const colors = await legend
        .locator("button > span[aria-hidden]")
        .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
      expect(colors).toHaveLength(2);
      const input = await tooltip(page, "tokens", daily);
      await expect(page.getByLabel("Tokens by model", { exact: true }).locator("li")).toHaveText([
        "gpt-6.1100",
        "gpt-6.1-sol500",
      ]);
      await noOverflow(page);
      await capture(page, info, `model-totals-${width}-${theme}`);
      await jsonEvidence(info, "model-totals.json", { width, theme, daily, input, colors });
    });

    test(`unknown-model scalar attribution ${width}px ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/calendar.html?state=unknown-models");
      await reportTheme(page, theme);
      await chart(page);
      const legend = page.getByLabel("Models", { exact: true });
      await expect(legend).toHaveText("Unknown model");
      const colors = await legend
        .locator("button > span[aria-hidden]")
        .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
      expect(new Set(colors).size).toBe(1);
      const fills = await page
        .locator(".ts-chart__bar rect")
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getBoundingClientRect().height > 0)
            .map((node) => getComputedStyle(node).fill),
        );
      expect(new Set(fills).size).toBe(1);
      const daily = await rows(page);
      expect(daily[14].slice(-1)).toEqual(["600"]);
      const input = await tooltip(page, "tokens", daily);
      await expect(page.getByLabel("Tokens by model", { exact: true })).toHaveCount(0);
      await noOverflow(page);
      await capture(page, info, `unknown-models-${width}-${theme}`);
      await jsonEvidence(info, "unknown-models.json", {
        width,
        theme,
        colors,
        fills,
        daily,
        input,
      });
    });
  }
