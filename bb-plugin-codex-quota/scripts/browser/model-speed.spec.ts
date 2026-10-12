import { test, expect, noOverflow, capture, jsonEvidence, reportTheme } from "./fixtures.js";
import { chart, rows, tooltip } from "./calendar-driver.js";

for (const width of [375, 1280])
  for (const theme of ["light", "dark"] as const)
    test(`model-speed combinations ${width}px ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/calendar.html?state=model-speeds");
      await reportTheme(page, theme);
      await chart(page);
      const legend = page.getByLabel("Models", { exact: true });
      await expect(legend).toHaveText("gpt-6.1 Defaultgpt-6.1-sol Defaultgpt-6.1-sol Fast");
      await expect(legend).not.toContainText("Ultrafast");
      await expect(legend).not.toContainText("gpt-6.1 Fast");
      const daily = await rows(page);
      expect(daily[14].slice(-3)).toEqual(["100", "100", "400"]);
      const colors = await legend
        .locator("span > span[aria-hidden]")
        .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
      expect(colors).toHaveLength(3);
      expect(colors[1]).not.toBe(colors[2]);
      const input = await tooltip(page, "tokens", daily);
      const detail = page.getByLabel("Tokens by model and speed", { exact: true });
      await expect(detail.locator("li")).toHaveText([
        "gpt-6.1 Default100",
        "gpt-6.1-sol Default100",
        "gpt-6.1-sol Fast400",
      ]);
      await noOverflow(page);
      await capture(page, info, `model-speeds-${width}-${theme}`);
      await jsonEvidence(info, "model-speeds.json", { width, theme, daily, input });
    });

for (const width of [375, 1280])
  for (const theme of ["light", "dark"] as const)
    test(`unknown-model speed styles ${width}px ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/calendar.html?state=unknown-model-speeds");
      await reportTheme(page, theme);
      await chart(page);
      const legend = page.getByLabel("Models", { exact: true });
      await expect(legend).toHaveText(
        "Unknown model DefaultUnknown model FastUnknown model Ultrafast",
      );
      const colors = await legend
        .locator("span > span[aria-hidden]")
        .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
      expect(new Set(colors).size).toBe(3);
      const fills = await page
        .locator(".recharts-bar-rectangle path")
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getBoundingClientRect().height > 0)
            .map((node) => getComputedStyle(node).fill),
        );
      expect(new Set(fills).size).toBe(3);
      const daily = await rows(page);
      expect(daily[14].slice(-3)).toEqual(["100", "200", "300"]);
      const input = await tooltip(page, "tokens", daily);
      await expect(
        page.getByLabel("Tokens by model and speed", { exact: true }).locator("li"),
      ).toHaveText([
        "Unknown model Default100",
        "Unknown model Fast200",
        "Unknown model Ultrafast300",
      ]);
      await noOverflow(page);
      await capture(page, info, `unknown-speeds-${width}-${theme}`);
      await jsonEvidence(info, "unknown-speeds.json", {
        width,
        theme,
        colors,
        fills,
        daily,
        input,
      });
    });
