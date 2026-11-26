import { test, expect, noOverflow, jsonEvidence } from "./fixtures.js";
import { chart, rows, axFacts } from "./calendar-driver.js";
import { layout } from "./chart-layout.js";

for (const width of [375, 1280]) {
  test(`full-word token subtotal and tooltip at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto("/calendar.html?state=cache-heavy");
    await chart(page);
    await expect(page.getByLabel("Recorded token subtotal")).toHaveText("4.63 billion");
    await expect(page.getByLabel("Recorded token subtotal")).toHaveAttribute(
      "title",
      "4,625,000,000 tokens",
    );

    const surface = page.locator('.ts-chart[role="img"]');
    await surface.focus();
    const date = page.locator(".calendar-tooltip time");
    for (let step = 0; step < 30; step += 1) {
      if ((await date.count()) && (await date.getAttribute("datetime")) === "2026-09-26") {
        break;
      }
      await page.keyboard.press("ArrowRight");
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    }
    await expect(date).toHaveAttribute("datetime", "2026-09-26");
    const tip = page.getByRole("tooltip");
    await expect(tip.locator("dt")).toHaveText(["Recorded tokens"]);
    await expect(tip.locator("dd")).toHaveText(["1.04 billion"]);
    await expect(tip.locator("dd").first()).toHaveAttribute("title", "1,040,000,000 tokens");
    const dailyRows = await rows(page);
    expect(dailyRows[24].slice(1, 9)).toEqual([
      "1,040,000,000",
      "33,280,000",
      "8,320,000",
      "997,880,000",
      "520,000",
      "3,328,000",
      "0",
      "0",
    ]);
    const accessibility = await axFacts(page, dailyRows, "tokens");
    const measurements = await layout(page);
    expect(measurements.tooltipContained).toBe(true);
    expect(measurements.y.join(" ")).toMatch(/M|B/);
    expect(measurements.y.join(" ")).not.toMatch(/million|billion/);
    await noOverflow(page);
    await expect(tip).toBeVisible();
    const tooltipCapture = `token-tooltip-${width}.png`;
    const tooltipPath = info.outputPath(tooltipCapture);
    await page.screenshot({ path: tooltipPath });
    await info.attach(tooltipCapture, { path: tooltipPath, contentType: "image/png" });
    await jsonEvidence(info, "token-counts.json", {
      width,
      tooltipCapture,
      accessibility,
      measurements,
    });
  });
}
