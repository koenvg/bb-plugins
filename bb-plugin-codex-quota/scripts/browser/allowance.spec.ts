import { capture, expect, noOverflow, reportTheme, test, viewport } from "./fixtures.js";

for (const { state, cards, amount } of [
  { state: "allowance-zero", cards: 2, amount: "0" },
  { state: "allowance-weekly", cards: 3, amount: "40\u202f247" },
  {
    state: "allowance-large",
    cards: 4,
    amount:
      "12\u202f345\u202f678\u202f901\u202f234\u202f567\u202f890\u202f123\u202f456\u202f789\u202f012",
  },
]) {
  test(`${state} fills the row and stacks without clipping the balance`, async ({ page }, info) => {
    await viewport(page, 1280);
    await page.goto(`/calendar.html?state=${state}`);
    if (cards === 3) await reportTheme(page, "light");
    const account = page.getByRole("region", { name: "Shared account allowance" });
    const readings = account.locator("dl").first();
    const balance = readings.locator("dd").first();
    await expect(balance).toBeVisible();
    expect(await balance.textContent()).toBe(`${amount} credits left`);

    for (const width of [1280, 375]) {
      await viewport(page, width);
      await noOverflow(page);
      if (cards === 4) {
        const label = readings.locator("dt").filter({ hasText: "W" + "w".repeat(23) });
        expect(await label.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
      }
      const boxes = await readings.evaluate((list) => {
        const { left, right } = list.getBoundingClientRect();
        return Array.from(list.children, (card) => {
          const box = card.getBoundingClientRect();
          return {
            left: box.left - left,
            right: right - box.right,
            top: box.top,
            bottom: box.bottom,
          };
        });
      });
      expect(boxes).toHaveLength(cards);
      if (width === 1280) {
        expect(boxes[0]!.left).toBeCloseTo(0, 0);
        expect(boxes.at(-1)!.right).toBeCloseTo(0, 0);
        for (const [index, box] of boxes.entries()) {
          expect(box.top).toBeCloseTo(boxes[0]!.top, 0);
          if (index > 0) expect(box.left).toBeGreaterThan(boxes[index - 1]!.left);
        }
      } else {
        for (const [index, box] of boxes.entries()) {
          expect(box.left).toBeCloseTo(0, 0);
          expect(box.right).toBeCloseTo(0, 0);
          if (index > 0) expect(box.top).toBeGreaterThan(boxes[index - 1]!.bottom);
        }
      }
      const { lines, fits } = await balance.evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const range = new Range();
        const rows = new Map<number, string>();
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          for (const [offset, char] of [...(node.textContent ?? "")].entries()) {
            if (!/[<\d\u202f]/.test(char)) continue;
            range.setStart(node, offset);
            range.setEnd(node, offset + 1);
            const { top } = range.getBoundingClientRect();
            rows.set(top, (rows.get(top) ?? "") + char);
          }
        }
        return { lines: [...rows.values()], fits: element.scrollWidth <= element.clientWidth };
      });
      expect(fits).toBe(true);
      expect(lines.map((line) => line.trim()).join("\u202f")).toBe(amount);
      if (cards === 4) expect(lines.length).toBeGreaterThan(1);
      else expect(lines).toHaveLength(1);
      if (cards !== 2) await capture(page, info, `${state}-${width}`);
    }
  });
}
