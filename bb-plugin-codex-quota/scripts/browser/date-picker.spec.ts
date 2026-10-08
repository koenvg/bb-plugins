import { test, expect, sizes, viewport, noOverflow, capture, jsonEvidence } from "./fixtures.js";
import { rows, chart, calls } from "./calendar-driver.js";

type InputReceipt = {
  type: string;
  trusted: boolean;
  label: string | null;
  key?: string;
  pointer?: string;
};
for (const width of sizes)
  for (const state of ["partial", "unknown", "inactive", "no-prices", "tiny", "huge"]) {
    test(`date picker ${width} ${state} trusted input and targets`, async ({ page }, info) => {
      await viewport(page, width);
      await page.goto(`/calendar.html?state=${state}`);
      await expect(page.locator('table[aria-label="Daily recorded usage"] tbody tr')).toHaveCount(
        30,
      );
      await chart(page);
      await page.evaluate(
        `window.inputEvents=[]; for(const t of ['pointerdown','touchstart','click','keydown']) document.addEventListener(t,e=>inputEvents.push({type:e.type,trusted:e.isTrusted,label:e.target.getAttribute('aria-label'),key:e.key,pointer:e.pointerType}),true)`,
      );
      const summary = page.locator('[aria-label="Daily recorded values"] summary');
      if (state === "partial") await capture(page, info, `calendar-${width}-collapsed`);
      if (width === 375) await summary.tap();
      else {
        await summary.focus();
        await page.keyboard.press("Enter");
      }
      await expect(page.locator('[aria-label="Daily recorded values"] details')).toHaveAttribute(
        "open",
      );
      const targets = await page.locator('button[aria-label^="Inspect "]').evaluateAll((elements) =>
        elements.map((e) => {
          const bounds = e.getBoundingClientRect();
          return {
            date: e.getAttribute("aria-label")!.replace("Inspect ", ""),
            width: bounds.width,
            height: bounds.height,
          };
        }),
      );
      expect(targets).toHaveLength(30);
      expect(targets.every((target) => target.width >= 24 && target.height >= 24)).toBe(true);
      const summarySize = await summary.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return { width: r.width, height: r.height };
      });
      expect(summarySize.width).toBeGreaterThanOrEqual(24);
      expect(summarySize.height).toBeGreaterThanOrEqual(24);
      const dates = targets.map((target) => target.date);
      const inspect = (index: number) =>
        page.getByRole("button", { name: `Inspect ${dates[index]}`, exact: true });
      const selected = async (index: number) => {
        await expect(inspect(index)).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator('[aria-label="Selected date"] time')).toHaveAttribute(
          "datetime",
          dates[index],
        );
      };
      await inspect(14).click();
      await selected(14);
      const detail = await page.getByLabel("Selected date", { exact: true }).textContent();
      const facts = await page
        .locator('[aria-label="Selected date"] dt')
        .evaluateAll((elements) =>
          Object.fromEntries(
            elements.map((e) => [e.textContent, e.nextElementSibling!.textContent]),
          ),
        );
      const coverage =
        state === "unknown"
          ? "Unknown, uncovered gap"
          : state === "inactive"
            ? "Observed inactivity"
            : "Partial, recorded usage";
      // The baseline component contract keeps coverage in the exact dated table row,
      // not selected detail. See calendar-date-picker.test.tsx.
      expect((await rows(page))[14][0]).toBe(dates[14]);
      expect((await rows(page))[14][3]).toContain(coverage);
      expect(detail).not.toContain(coverage);
      if (state === "unknown") expect(facts["Recorded tokens"]).toBe("Unavailable");
      else if (state === "inactive") expect(facts["Recorded tokens"]).toBe("0");
      else if (state === "huge") expect(facts["Recorded tokens"]).toBe("9,007,199,254,740,991");
      else expect(facts["Recorded tokens"]).toBe("600");
      if (state === "partial") {
        await summary.focus();
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe(
          `Inspect ${dates[0]}`,
        );
        await page.keyboard.press("Enter");
        await selected(0);
        await page.keyboard.press("Tab");
        await page.keyboard.press("Space");
        await selected(1);
        await inspect(29).tap();
        await selected(29);
        await inspect(14).tap();
        await selected(14);
      }
      await capture(page, info, `calendar-${width}-${state === "partial" ? "tokens" : state}`);
      expect((await calls(page)).filter((call) => call.method === "calendarReport")).toHaveLength(
        1,
      );
      await noOverflow(page);
      const events: InputReceipt[] = await page.evaluate("inputEvents");
      expect(
        events.some(
          (e) =>
            e.type === "click" &&
            e.trusted &&
            e.pointer === "mouse" &&
            e.label === `Inspect ${dates[14]}`,
        ),
      ).toBe(true);
      if (state === "partial") {
        expect(
          events.some(
            (e) =>
              e.type === "click" &&
              e.trusted &&
              e.pointer === "touch" &&
              e.label === `Inspect ${dates[29]}`,
          ),
        ).toBe(true);
        for (const key of ["Enter", " "])
          expect(
            events.some(
              (e) =>
                e.type === "keydown" &&
                e.trusted &&
                e.key === key &&
                dates.some((date) => e.label === `Inspect ${date}`),
            ),
          ).toBe(true);
      }
      expect((await rows(page)).map((row) => row[0])).toEqual(dates);
      await jsonEvidence(info, "measurements.json", {
        width,
        height: page.viewportSize()!.height,
        state,
        targets,
        summary: summarySize,
        inputEvents: events,
        reportCalls: 1,
        overflow: false,
        touchChecked: true,
        facts,
      });
    });
  }
