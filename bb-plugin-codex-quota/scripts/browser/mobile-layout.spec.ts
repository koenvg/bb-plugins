import { test, expect, noOverflow, capture } from "./fixtures.js";
import { chart } from "./calendar-driver.js";
import { layout } from "./chart-layout.js";

for (const width of [320, 375, 430, 1280]) {
  test(`quota layout ${width} keeps controls readable and axes whole`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/calendar.html?state=huge");
    await chart(page);
    await expect(page.getByRole("combobox", { name: "Codex host" })).toHaveCount(0);
    const check = async () => {
      const boxes = await page.evaluate(() => {
        const rect = (selector: string) => {
          const r = document.querySelector(selector)!.getBoundingClientRect();
          return { y: r.y, right: r.right, width: r.width };
        };
        return {
          previous: rect('[aria-label="Previous 30 days"]'),
          next: rect('[aria-label="Next 30 days"]'),
          latest: rect('[aria-label="Previous 30 days"] + button + button'),
          chart: rect(".recharts-surface"),
          plot: rect(".recharts-cartesian-grid"),
        };
      });
      expect(boxes.next.y).toBeCloseTo(boxes.previous.y, 0);
      expect(boxes.latest.y).toBeCloseTo(boxes.previous.y, 0);
      expect(boxes.plot.width / boxes.chart.width).toBeGreaterThan(0.68);
      // The panel can scroll internally even when the document does not overflow.
      const main = page.getByRole("main");
      expect(await main.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
      await noOverflow(page);
    };
    await check();
    if (width === 1280) {
      // A narrow BB panel must reflow even on a wide desktop viewport.
      await page.getByRole("main").evaluate((element) => {
        element.style.width = "375px";
      });
      await expect
        .poll(async () => (await page.locator(".recharts-surface").boundingBox())!.width)
        .toBe(311);
      await check();
    }
    for (const metric of ["Tokens", "Estimated cost"]) {
      await page
        .getByRole("group", { name: "Chart metric" })
        .getByRole("button", { name: metric, exact: true })
        .click();
      const measurements = await layout(page);
      expect(measurements.y.every((label) => !label.includes("."))).toBe(true);
      expect(measurements.axisSpacing?.contained).toBe(true);
      expect(measurements.axisSpacing!.gap).toBeGreaterThanOrEqual(8);
    }
    await capture(page, info, `quota-layout-${width}`);
  });
}

test("coarse-pointer controls have 44px touch targets", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/calendar.html?state=partial");
  await chart(page);
  for (const control of [
    ...(await page.getByRole("group", { name: "Chart metric" }).getByRole("button").all()),
    ...(await page.getByRole("group", { name: "Usage grouping" }).getByRole("button").all()),
    page.getByRole("button", { name: "Previous 30 days" }),
    page.getByRole("button", { name: "Next 30 days" }),
    page.getByRole("button", { name: "Latest", exact: true }),
    page.getByRole("button", { name: "Refresh allowance" }),
  ])
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByText("Inspect a date", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Inspect / })).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh allowance" }).tap();
  await expect
    .poll(() =>
      page.evaluate(
        "calendarFixture.calls.filter(c => c.method === 'machineAccounts' && c.input.refresh).length",
      ),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Previous 30 days" }).tap();
  const next = page.getByRole("button", { name: "Next 30 days" });
  await expect(next).toBeEnabled();
  await next.tap();
  await expect(next).toBeDisabled();
});
