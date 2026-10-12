import { test, expect, noOverflow, capture, jsonEvidence } from "./fixtures.js";
import { chart, rows, axFacts } from "./calendar-driver.js";
import { layout } from "./chart-layout.js";

for (const width of [375, 1280]) {
  test(`full-word token rankings and tooltip at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto("/calendar.html?state=cache-heavy");
    await chart(page);
    await expect(page.getByLabel("Recorded token subtotal")).toHaveText("4.63 billion");
    await expect(page.getByLabel("Recorded token subtotal")).toHaveAttribute(
      "title",
      "4,625,000,000 tokens",
    );
    const ranking = page.getByRole("table", { name: "Recorded usage ranking" });
    await expect(ranking.locator("tbody td:last-child")).toHaveText([
      "745.92 million",
      "301.55 million",
      "301.55 million",
    ]);
    await expect(ranking.locator("tbody td:last-child").nth(1)).toHaveAttribute(
      "title",
      "301,550,002 tokens",
    );
    await expect(ranking.locator("tbody td:last-child").nth(2)).toHaveAttribute(
      "title",
      "301,550,001 tokens",
    );
    await noOverflow(page);
    const rankingCapture = await capture(page, info, `token-rankings-${width}`);
    const rankingBoxes = await ranking.locator("tbody td").evaluateAll((cells) =>
      cells.map((cell) => {
        const box = cell.getBoundingClientRect();
        return {
          text: cell.textContent,
          x: box.x,
          right: box.right,
          height: box.height,
          width: box.width,
        };
      }),
    );
    expect(rankingBoxes.every((box) => box.x >= 0 && box.right <= width)).toBe(true);

    const surface = page.locator('.recharts-surface[role="application"]');
    await surface.focus();
    const date = page.locator(".recharts-tooltip-wrapper time");
    for (let step = 0; step < 30; step++) {
      if ((await date.count()) && (await date.getAttribute("datetime")) === "2026-09-26") break;
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
    await expect(tip.locator("dd")).toHaveText([
      "1.04 billion",
      "33.28 million",
      "8.32 million",
      "997.88 million",
      "520 thousand",
      "3.33 million",
    ]);
    await expect(tip.locator("dd").first()).toHaveAttribute("title", "1,040,000,000 tokens");
    await expect(tip.locator("dd").last()).toHaveAttribute("title", "3,328,000 tokens");
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
      rankingBoxes,
      rankingCapture,
      tooltipCapture,
      accessibility,
      measurements,
    });
  });
}
