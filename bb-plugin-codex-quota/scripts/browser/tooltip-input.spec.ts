import { test, expect, jsonEvidence } from "./fixtures.js";
import { chart, rows, tooltip } from "./calendar-driver.js";

declare global {
  interface Window {
    tooltipFrameCounts: number[];
  }
}
test("metric switch waits for keyboard frames before proving hover", async ({ page }, info) => {
  await page.goto("/calendar.html?state=partial");
  await chart(page);
  await tooltip(page, "tokens", await rows(page));
  await page.getByRole("combobox", { name: "Report metric" }).selectOption("cost");
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
