import { test, expect, noOverflow, capture } from "./fixtures.js";
import { chart } from "./calendar-driver.js";
import { layout } from "./chart-layout.js";

for (const width of [320, 375, 430, 1280]) {
  test(`quota layout ${width} keeps controls readable and axes whole`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/calendar.html?state=huge");
    await chart(page);
    const host = page.getByRole("combobox", { name: "Codex host" });
    await host.evaluate((element) => {
      const select = element as HTMLSelectElement;
      select.selectedOptions[0].textContent = "Koen’s MacBook Pro with a long host name";
    });

    const measure = async () =>
      page.evaluate(() => {
        const rect = (selector: string) => {
          const r = document.querySelector(selector)!.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        };
        return {
          summary: rect('[aria-label="Codex allowance summary"]'),
          host: rect('[aria-label="Codex host"]'),
          previous: rect('[aria-label="Previous 30 days"]'),
          next: rect('[aria-label="Next 30 days"]'),
          metric: rect('[aria-label="Report metric"]'),
          chart: rect(".recharts-surface"),
          plot: rect(".recharts-cartesian-grid"),
        };
      });
    const checkNarrow = async () => {
      const boxes = await measure();
      expect(boxes.host.y).toBeGreaterThanOrEqual(boxes.summary.bottom);
      expect(boxes.host.width).toBeCloseTo(boxes.summary.width, 0);
      expect(boxes.metric.y).toBeGreaterThanOrEqual(boxes.previous.bottom);
      expect(boxes.metric.width).toBeCloseTo(boxes.host.width, 0);
      expect(boxes.plot.width / boxes.chart.width).toBeGreaterThan(0.68);
      await noOverflow(page);
    };
    if (width < 512) await checkNarrow();
    else {
      const boxes = await measure();
      expect(boxes.host.y).toBeCloseTo(boxes.summary.y, 0);
      expect(boxes.metric.y).toBeCloseTo(boxes.previous.y, 0);
      // A narrow BB panel must reflow even on a wide desktop viewport.
      await page.getByRole("main").evaluate((element) => {
        element.style.width = "375px";
      });
      await expect.poll(async () => (await measure()).chart.width).toBe(311);
      await checkNarrow();
    }
    for (const metric of ["tokens", "cost"]) {
      await page.getByRole("combobox", { name: "Report metric" }).selectOption(metric);
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
    page.getByRole("combobox", { name: "Codex host" }),
    page.getByRole("combobox", { name: "Report metric" }),
    page.getByRole("button", { name: "Previous 30 days" }),
    page.getByRole("button", { name: "Next 30 days" }),
    page.getByRole("button", { name: "Refresh allowance" }),
  ]) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByText("Inspect a date", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Inspect / })).toHaveCount(0);
  for (const name of ["Previous 30 days", "Next 30 days"]) {
    const button = page.getByRole("button", { name });
    expect((await button.locator("span").boundingBox())!.width).toBe(32);
    expect((await button.locator("span").boundingBox())!.height).toBe(32);
  }
  const refresh = page.getByRole("button", { name: "Refresh allowance" });
  expect(await refresh.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(
    "rgba(0, 0, 0, 0)",
  );
  await expect(refresh.locator('svg[aria-hidden="true"]')).toBeVisible();
  await refresh.tap();
  await expect
    .poll(() => page.evaluate("calendarFixture.calls.filter(c => c.method === 'read').length"))
    .toBe(2);
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--muted-foreground", "#555555");
    document.documentElement.style.setProperty("--background", "#ffffff");
    document.documentElement.style.setProperty("--foreground", "#292929");
  });
  const previous = page.getByRole("button", { name: "Previous 30 days" });
  expect(await previous.locator("svg").evaluate((e) => getComputedStyle(e).color)).toBe(
    "rgb(85, 85, 85)",
  );
  await previous.tap();
  const next = page.getByRole("button", { name: "Next 30 days" });
  await expect(next).toBeEnabled();
  await next.tap();
  await expect(next).toBeDisabled();
});
