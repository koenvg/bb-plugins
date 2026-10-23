import { test, expect } from "./fixtures.js";
import { chart, rows } from "./calendar-driver.js";

for (const width of [375, 1280]) {
  for (const theme of ["light", "dark"] as const) {
    test(`filtered small-day markers ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/calendar.html?state=mixed-magnitude");
      await chart(page);
      const daily = await rows(page);
      const markers = page.locator(".calendar-positive-usage");
      const ticks = page.locator("[data-ts-key^='y-tick-label:']");
      const legend = page.getByRole("group", { name: "Models", exact: true });
      await expect(ticks).toHaveText(["0", "250M", "500M", "750M", "1B"]);
      await expect(markers).toHaveCount(2);
      const markerGeometry = await markers.evaluateAll((nodes) =>
        nodes.map((node) => ({
          width: node.getAttribute("width"),
          height: node.getAttribute("height"),
          hidden: node.getAttribute("aria-hidden"),
        })),
      );
      expect(markerGeometry).toEqual([
        { width: "6", height: "2", hidden: "true" },
        { width: "6", height: "2", hidden: "true" },
      ]);
      await legend.getByRole("button", { name: "gpt-5.3-codex", exact: true }).click();
      await expect(ticks).toHaveText(["0", "188M", "375M", "563M", "750M"]);
      await expect(markers).toHaveCount(2);
      await legend.getByRole("button", { name: "gpt-5.4", exact: true }).click();
      await expect(ticks).toHaveText(["0", "3M", "5M", "8M", "10M"]);
      await expect(markers).toHaveCount(1);
      await expect(markers).toHaveAttribute("data-ts-key", `positive:${daily[16][0]}`);
      await legend.getByRole("button", { name: "Unknown model", exact: true }).click();
      await expect(ticks).toHaveText(["0", "3M", "5M", "8M", "10M"]);
      await expect(markers).toHaveCount(0);
      expect(await rows(page)).toEqual(daily);
      await page.getByRole("button", { name: "Restore all series", exact: true }).click();
      await expect(ticks).toHaveText(["0", "250M", "500M", "750M", "1B"]);
      await expect(markers).toHaveCount(2);
      expect(
        await markers.evaluateAll((nodes) =>
          nodes.map((node) => ({
            width: node.getAttribute("width"),
            height: node.getAttribute("height"),
            hidden: node.getAttribute("aria-hidden"),
          })),
        ),
      ).toEqual(markerGeometry);
      await expect(page.getByRole("img")).toHaveAttribute(
        "aria-label",
        "Daily usage chart: Tokens",
      );
      expect(await rows(page)).toEqual(daily);
    });
  }
}
