import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { chart, rows } from "./calendar-driver.js";

const bars = (page: Page) =>
  page.locator(".ts-chart__bar rect").evaluateAll((nodes) =>
    nodes
      .filter((node) => Number(node.getAttribute("height")) > 0)
      .map((node) => ({
        key: node.getAttribute("data-ts-key"),
        height: Number(node.getAttribute("height")),
      })),
  );

for (const scenario of [
  {
    metric: "Tokens",
    state: "model-totals",
    hide: "gpt-6.1-sol",
    subtotal: "Recorded token subtotal",
    total: "600",
    modelFacts: ["100", "500"],
    fullTicks: ["0", "150", "300", "450", "600"],
    filteredTicks: ["0", "25", "50", "75", "100"],
    growth: 6,
  },
  {
    metric: "Estimated cost",
    state: "model-costs",
    hide: "B",
    subtotal: "Captured cost subtotal",
    total: "$10.00",
    modelFacts: [
      "$4.00 · 1 of 59 records priced · pricing partial",
      "$6.00 · 1 of 1 records priced · pricing available",
    ],
    fullTicks: ["$0", "$3", "$5", "$8", "$10"],
    filteredTicks: ["$0", "$1", "$2", "$3", "$4"],
    growth: 2.5,
  },
]) {
  test(`model filtering rescales and restores ${scenario.metric}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1100 });
    await page.goto(`/calendar.html?state=${scenario.state}`);
    await chart(page);
    await page
      .getByRole("group", { name: "Chart metric" })
      .getByRole("button", { name: scenario.metric, exact: true })
      .click();
    const ticks = page.locator("[data-ts-key^='y-tick-label:']");
    await expect(ticks).toHaveText(scenario.fullTicks);
    const daily = await rows(page);
    expect(daily[14].slice(-2)).toEqual(scenario.modelFacts);
    const subtotal = page.getByLabel(scenario.subtotal, { exact: true });
    await expect(subtotal).toHaveText(scenario.total);
    const initial = await bars(page);
    expect(initial).toHaveLength(2);

    const model = page
      .getByRole("group", { name: "Models", exact: true })
      .getByRole("button", { name: scenario.hide, exact: true });
    await model.click();
    await expect(model).toHaveAttribute("aria-pressed", "false");
    await expect(ticks).toHaveText(scenario.filteredTicks);
    await expect.poll(async () => (await bars(page)).length).toBe(1);
    const remaining = (await bars(page))[0];
    expect(remaining.key).toBe(initial[0].key);
    expect(remaining.height / initial[0].height).toBeCloseTo(scenario.growth, 2);
    expect(await rows(page)).toEqual(daily);
    await expect(subtotal).toHaveText(scenario.total);

    await page.getByRole("button", { name: "Restore all series", exact: true }).click();
    await expect(model).toHaveAttribute("aria-pressed", "true");
    await expect(ticks).toHaveText(scenario.fullTicks);
    await expect.poll(() => bars(page)).toEqual(initial);
    expect(await rows(page)).toEqual(daily);
    await expect(subtotal).toHaveText(scenario.total);
  });
}
