import { test, expect, jsonEvidence } from "./fixtures.js";
import { chart, rows, tooltip } from "./calendar-driver.js";

declare global {
  interface Window {
    tooltipFrameCounts: number[];
    tooltipLayoutShift?: { before: number; after: number; trusted: boolean };
  }
}
test("metric switch waits for keyboard frames before proving hover", async ({ page }, info) => {
  await page.goto("/calendar.html?state=partial");
  await chart(page);
  await tooltip(page, "tokens", await rows(page));
  await page
    .getByRole("group", { name: "Chart metric" })
    .getByRole("button", { name: "Estimated cost", exact: true })
    .click();
  await chart(page);
  const dailyRows = await rows(page);

  // Keep real input and rendering, but defer frames to expose the CI input race.
  await page.evaluate(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const frames = new Map<number, { timer?: number; frame?: number }>();
    let nextId = 0;
    window.tooltipFrameCounts = [];
    document.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") window.tooltipFrameCounts.push(frames.size);
    });
    window.requestAnimationFrame = (callback) => {
      const id = ++nextId;
      const pending: { timer?: number; frame?: number } = {};
      pending.timer = window.setTimeout(() => {
        delete pending.timer;
        pending.frame = request((time) => {
          frames.delete(id);
          callback(time);
        });
      }, 500);
      frames.set(id, pending);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      const pending = frames.get(id);
      if (!pending) return cancel(id);
      if (pending.timer !== undefined) window.clearTimeout(pending.timer);
      if (pending.frame !== undefined) cancel(pending.frame);
      frames.delete(id);
    };
  });
  await page.locator(".recharts-bar-rectangle path").filter({ visible: true }).first().hover();

  const facts = await tooltip(page, "cost", dailyRows);
  const keyboardFrames = await page.evaluate(() => window.tooltipFrameCounts);
  expect(keyboardFrames.length).toBeGreaterThan(0);
  expect(keyboardFrames.every((pending) => pending === 0)).toBe(true);
  expect(facts.pointer).not.toBeNull();
  expect(facts.pointer!.fromDate).toBe(dailyRows[13][0]);
  await jsonEvidence(info, "deferred-frame-tooltip.json", facts);
});

for (const metric of ["tokens", "cost"] as const) {
  test(`${metric} hover follows the bar after a keyboard-time layout shift`, async ({
    page,
  }, info) => {
    await page.goto("/calendar.html?state=stale");
    await chart(page);
    await expect(
      page.getByText("History preparation stopped. Known recorded values remain available.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("group", { name: "Chart metric" })
      .getByRole("button", { name: metric === "tokens" ? "Tokens" : "Estimated cost", exact: true })
      .click();
    await chart(page);
    const dailyRows = await rows(page);

    // Reproduce the CI banner's 60px shift after the old driver caches bar coordinates.
    await page.evaluate((targetDate) => {
      const shift = (event: KeyboardEvent) => {
        if (
          event.key !== "ArrowLeft" ||
          document.querySelector(".recharts-tooltip-wrapper time")?.getAttribute("datetime") !==
            targetDate
        )
          return;
        const container = document.querySelector<HTMLElement>(".recharts-responsive-container")!;
        const before = container.getBoundingClientRect().top;
        container.parentElement!.style.paddingTop = "60px";
        window.tooltipLayoutShift = {
          before,
          after: container.getBoundingClientRect().top,
          trusted: event.isTrusted,
        };
        document.removeEventListener("keydown", shift, true);
      };
      document.addEventListener("keydown", shift, true);
    }, dailyRows[14][0]);

    const facts = await tooltip(page, metric, dailyRows);
    const shift = await page.evaluate(() => window.tooltipLayoutShift);
    expect(shift).toBeDefined();
    expect(shift!.after - shift!.before).toBe(60);
    expect(shift!.trusted).toBe(true);
    expect(facts.pointer).not.toBeNull();
    expect(facts.pointer!.fromDate).toBe(dailyRows[13][0]);
    await expect(page.locator(".recharts-tooltip-wrapper time")).toHaveAttribute(
      "datetime",
      dailyRows[14][0],
    );
    await jsonEvidence(info, "layout-shift-tooltip.json", { metric, shift, facts });
  });
}
