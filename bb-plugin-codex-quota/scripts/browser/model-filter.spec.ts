import type { Page } from "@playwright/test";
import { test, expect, noOverflow, capture, jsonEvidence, reportTheme } from "./fixtures.js";
import { chart, rows, calls, tooltip } from "./calendar-driver.js";

const series = (page: Page, name: string) =>
  page
    .getByRole("group", { name: "Models", exact: true })
    .getByRole("button", { name, exact: true });
const restore = (page: Page) =>
  page.getByRole("button", { name: "Restore all series", exact: true });
const bars = (page: Page) =>
  page.locator(".recharts-bar").evaluateAll((groups) =>
    groups
      .map((group) =>
        Array.from(group.querySelectorAll(".recharts-bar-rectangle path"), (node) => ({
          height: Number(node.getAttribute("height")),
          y: Number(node.getAttribute("y")),
          fill: getComputedStyle(node).fill,
          uncertain: node.hasAttribute("stroke-dasharray"),
        })).filter((bar) => bar.height > 0),
      )
      .filter((group) => group.length)
      .sort((left, right) => right[0].y - left[0].y),
  );
const axis = (page: Page) => page.locator(".recharts-yAxis-tick-labels text").allTextContents();
async function settled(page: Page) {
  await chart(page);
  await expect(page.getByRole("heading", { name: "Top 10 threads" })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
for (const width of [375, 1280])
  for (const theme of ["light", "dark"] as const)
    test(`exact-series filtering ${width}px ${theme}`, async ({ page }, info) => {
      const writes: unknown[] = [];
      await page.exposeFunction("recordFilterStorageWrite", (...args: unknown[]) =>
        writes.push(args),
      );
      await page.addInitScript(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          void (
            window as unknown as { recordFilterStorageWrite(...args: unknown[]): void }
          ).recordFilterStorageWrite(key, value);
          return original.call(this, key, value);
        };
      });
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/calendar.html?state=model-speeds");
      await reportTheme(page, theme);
      await settled(page);
      const names = ["gpt-6.1 Default", "gpt-6.1-sol Default", "gpt-6.1-sol Fast"];
      const daily = await rows(page);
      expect(daily[14].slice(-3)).toEqual(["100", "100", "400"]);
      const initial = await bars(page);
      const initialBarBox = (await page
        .locator(".recharts-bar-rectangle path")
        .first()
        .boundingBox())!;
      expect(initial.map((group) => group.length)).toEqual([1, 1, 1]);
      const ticks = await axis(page);
      expect(ticks).toEqual(["0", "150", "300", "450", "600"]);
      const fullTip = await tooltip(page, "tokens", daily);
      const requests = await calls(page);
      const stored = [...writes];
      const allowance = await page.getByLabel("Shared account allowance").textContent();
      const summary = await page.getByLabel("Recorded token subtotal").textContent();
      const legend = page.getByRole("group", { name: "Models", exact: true });
      expect(
        await legend.evaluate((node) => ({
          column: getComputedStyle(node).columnGap,
          row: getComputedStyle(node).rowGap,
          margin: getComputedStyle(node).marginTop,
        })),
      ).toEqual({ column: "16px", row: "4px", margin: "0px" });
      for (const node of [
        page.getByRole("group", { name: "Daily recorded values" }).getByRole("status"),
        page.locator(`[id="${await legend.getAttribute("aria-describedby")}"]`),
      ]) {
        expect(
          await node.evaluate((node) => ({
            position: getComputedStyle(node).position,
            width: getComputedStyle(node).width,
            height: getComputedStyle(node).height,
          })),
        ).toEqual({ position: "absolute", width: "1px", height: "1px" });
      }
      const fast = series(page, names[2]);
      await fast.focus();
      await expect(restore(page)).toHaveCount(0);
      const application = await page.getByRole("application").elementHandle();
      const plot = await page.locator(".recharts-responsive-container").boundingBox();
      for (const name of names) {
        expect(
          await series(page, name).evaluate((node) => {
            const style = getComputedStyle(node);
            const swatch = getComputedStyle(node.querySelector("span")!);
            return {
              border: style.borderWidth,
              background: style.backgroundColor,
              padding: style.padding,
              margin: style.margin,
              font: style.fontSize,
              lineHeight: style.lineHeight,
              gap: style.gap,
              swatchWidth: swatch.width,
              swatchHeight: swatch.height,
            };
          }),
        ).toEqual({
          border: "0px",
          background: "rgba(0, 0, 0, 0)",
          padding: "0px",
          margin: "0px",
          font: "12px",
          lineHeight: "16px",
          gap: "8px",
          swatchWidth: "10px",
          swatchHeight: "10px",
        });
      }
      await capture(page, info, `compact-default-${width}-${theme}`);
      await page.keyboard.press("Space");
      await expect(fast).toHaveAttribute("aria-pressed", "false");
      await expect(fast).toBeFocused();
      await expect(fast).toHaveText(names[2]);
      expect(
        await fast
          .locator("span")
          .last()
          .evaluate((node) => getComputedStyle(node).textDecorationLine),
      ).toBe("line-through");
      expect(
        await application!.evaluate(
          (node) => node === document.querySelector('[role="application"]'),
        ),
      ).toBe(true);
      expect(await page.locator(".recharts-responsive-container").boundingBox()).toEqual(plot);
      expect(
        await fast.evaluate((node) => ({
          visible: node.matches(":focus-visible"),
          outline: getComputedStyle(node).outlineWidth,
        })),
      ).toEqual({ visible: true, outline: "2px" });
      await expect.poll(() => bars(page)).toEqual(initial.slice(0, 2));
      expect(await axis(page)).toEqual(ticks);
      expect(await rows(page)).toEqual(daily);
      await tooltip(page, "tokens", daily);
      await expect(
        page.getByLabel("Tokens by model and speed", { exact: true }).locator("li"),
      ).toHaveText(["gpt-6.1 Default100", "gpt-6.1-sol Default100", "gpt-6.1-sol Fast400"]);
      await fast.focus();
      await page.keyboard.press("Enter");
      await expect.poll(() => bars(page)).toEqual(initial);
      await expect(restore(page)).toHaveCount(0);
      await expect(fast).toBeFocused();
      for (const hiddenIndex of [0, 1]) {
        await series(page, names[hiddenIndex]).click();
        const remaining = await bars(page);
        const expected = initial.filter((_group, index) => index !== hiddenIndex);
        expect(remaining.map((group) => group.map(({ y: _y, ...bar }) => bar))).toEqual(
          expected.map((group) => group.map(({ y: _y, ...bar }) => bar)),
        );
        for (let index = 0; index < remaining.length; index++)
          expect(remaining[index][0].y).toBeCloseTo(
            expected[index][0].y + (index >= hiddenIndex ? initial[hiddenIndex][0].height : 0),
            3,
          );
        expect(await axis(page)).toEqual(ticks);
        expect(await page.locator(".recharts-responsive-container").boundingBox()).toEqual(plot);
        await restore(page).click();
        expect(await bars(page)).toEqual(initial);
        expect(
          await application!.evaluate(
            (node) => node === document.querySelector('[role="application"]'),
          ),
        ).toBe(true);
      }
      await fast.focus();
      await page.keyboard.press("Space");
      await page.keyboard.press("Tab");
      await expect(restore(page)).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(fast).toBeFocused();
      await page
        .getByRole("group", { name: "Chart metric" })
        .getByRole("button", { name: "Estimated cost", exact: true })
        .click();
      const cost = await bars(page);
      const costFacts = await rows(page);
      await page
        .getByRole("group", { name: "Chart metric" })
        .getByRole("button", { name: "Tokens", exact: true })
        .click();
      await expect(fast).toHaveAttribute("aria-pressed", "false");
      await restore(page).click();
      await page
        .getByRole("group", { name: "Chart metric" })
        .getByRole("button", { name: "Estimated cost", exact: true })
        .click();
      expect(await bars(page)).toEqual(cost);
      expect(await rows(page)).toEqual(costFacts);
      await page
        .getByRole("group", { name: "Chart metric" })
        .getByRole("button", { name: "Tokens", exact: true })
        .click();
      for (let cycle = 0; cycle < 2; cycle++) {
        for (const name of names) await series(page, name).click();
        await expect(
          page.getByRole("group", { name: "Daily recorded values" }).getByRole("status"),
        ).toHaveText("All model/speed series hidden. Recorded usage is not zero.");
        expect(await bars(page)).toEqual([]);
        expect(await rows(page)).toEqual(daily);
        expect(await axis(page)).toEqual(ticks);
        const allHiddenTip = await tooltip(page, "tokens", daily);
        expect(allHiddenTip.definitions).toEqual(fullTip.definitions);
        expect(allHiddenTip.tooltip).toBe(fullTip.tooltip);
        await page.mouse.move(0, 0);
        await page.mouse.move(
          initialBarBox.x + initialBarBox.width / 2,
          initialBarBox.y + initialBarBox.height / 2,
        );
        await expect(page.getByRole("tooltip").locator("time")).toHaveAttribute(
          "datetime",
          daily[14][0],
        );
        await expect(page.getByRole("tooltip")).toHaveText(fullTip.tooltip!);
        await restore(page).focus();
        await page.keyboard.press("Enter");
        await expect.poll(() => bars(page)).toEqual(initial);
        await expect(series(page, names[2])).toBeFocused();
        await expect(restore(page)).toHaveCount(0);
      }
      expect(await calls(page)).toEqual(requests);
      expect(writes).toEqual(stored);
      expect(await page.getByLabel("Shared account allowance").textContent()).toBe(allowance);
      expect(await page.getByLabel("Recorded token subtotal").textContent()).toBe(summary);
      await series(page, names[2]).click();
      await page.getByRole("button", { name: "Workspaces", exact: true }).click();
      await expect(series(page, names[2])).toHaveAttribute("aria-pressed", "false");
      await noOverflow(page);
      await capture(page, info, `filtered-${width}-${theme}`);
      await jsonEvidence(info, "filter-geometry.json", {
        initial,
        filtered: await bars(page),
        ticks,
        daily,
        fullTip,
        requests,
        stored,
      });
      await page.reload();
      await settled(page);
      await expect(series(page, names[2])).toHaveAttribute("aria-pressed", "true");
    });

test("uncertainty restacks unfiltered on the unchanged full scale", async ({ page }, info) => {
  await page.goto("/calendar.html?state=partial");
  await settled(page);
  const daily = await rows(page);
  const initial = await bars(page);
  expect(initial.map((group) => group[0].uncertain)).toEqual([false, true]);
  const ticks = await axis(page);
  expect(ticks).toEqual(["0", "225", "450", "675", "900"]);
  const uncertainty = initial[1][0];
  expect(initial[0][0].height / uncertainty.height).toBeCloseTo(2, 5);
  await series(page, "Unknown model Default").click();
  const filtered = await bars(page);
  expect(filtered).toEqual([[{ ...uncertainty, y: uncertainty.y + initial[0][0].height }]]);
  expect(await axis(page)).toEqual(ticks);
  expect(await rows(page)).toEqual(daily);
  await tooltip(page, "tokens", daily);
  await expect(page.getByRole("tooltip")).toContainText("Recorded tokens600");
  await expect(page.getByRole("tooltip")).toContainText("Uncertain estimate300 tokens");
  await restore(page).click();
  expect(await bars(page)).toEqual(initial);
  await jsonEvidence(info, "uncertainty.json", { initial, filtered, ticks, daily });
});

test("unknown speed filters keep independent complete attribution", async ({ page }) => {
  await page.goto("/calendar.html?state=unknown-model-speeds");
  await settled(page);
  const daily = await rows(page);
  expect(daily[14].slice(-3)).toEqual(["100", "200", "300"]);
  const initial = await bars(page);
  await series(page, "Unknown model Fast").click();
  expect(await bars(page)).toEqual([
    initial[0],
    [{ ...initial[2][0], y: initial[2][0].y + initial[1][0].height }],
  ]);
  await expect(series(page, "Unknown model Default")).toHaveAttribute("aria-pressed", "true");
  await expect(series(page, "Unknown model Ultrafast")).toHaveAttribute("aria-pressed", "true");
  expect(await rows(page)).toEqual(daily);
  await tooltip(page, "tokens", daily);
  await expect(
    page.getByLabel("Tokens by model and speed", { exact: true }).locator("li"),
  ).toHaveText(["Unknown model Default100", "Unknown model Fast200", "Unknown model Ultrafast300"]);
});

test("failed same-query refresh keeps selection, range navigation resets it", async ({ page }) => {
  await page.goto("/calendar.html?state=stale");
  await settled(page);
  await series(page, "Unknown model Default").click();
  await page.getByRole("button", { name: "Refresh chart", exact: true }).click();
  await expect(page.getByText("Recorded values are out of date.", { exact: false })).toBeVisible();
  await expect(series(page, "Unknown model Default")).toHaveAttribute("aria-pressed", "false");
  await page.goto("/calendar.html?state=model-speeds");
  await settled(page);
  await series(page, "gpt-6.1-sol Fast").click();
  const previous = page.getByRole("button", { name: "Previous 30 days" });
  await previous.click();
  await expect(series(page, "gpt-6.1-sol Fast")).toHaveAttribute("aria-pressed", "true");
  await expect(previous).toBeFocused();
});

for (const width of [375, 1280])
  for (const theme of ["light", "dark"] as const)
    test(`tiny and reserved-name series ${width}px ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/calendar.html?state=filter-edges");
      await reportTheme(page, theme);
      await settled(page);
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const names = [
        "Other models Default named model",
        "Unknown model Default named model",
        "long-model." + "x".repeat(117) + " Default",
        "tiny.[model] Default",
        "unknown Default",
        "Other models Default",
        "Unknown model Default",
      ];
      const legend = page.getByRole("group", { name: "Models", exact: true });
      await expect(legend.getByRole("button")).toHaveCount(7);
      const daily = await rows(page);
      expect(daily[14].slice(-7)).toEqual(["100", "100", "199", "1", "100", "50", "50"]);
      expect(daily[0][1]).toBe("0");
      expect(daily[1][1]).toBe("Unavailable");
      expect(daily[0][9]).toBe("Observed inactivity");
      expect(daily[14][10]).toBe("2 excluded tokens");
      const initial = await bars(page);
      expect(initial.map((group) => group.length)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
      expect(initial[3][0].height / initial[7][0].height).toBeCloseTo(1 / 300, 5);
      expect(initial[3][0].height).toBeLessThan(1);
      const long = series(page, names[2]);
      const box = (await long.boundingBox())!;
      expect(box.height).toBe(width === 375 ? 64 : 16);
      expect(await long.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      for (let index = 0; index < names.length; index++) {
        await series(page, names[index]).click();
        await expect(series(page, names[index])).toHaveAttribute("aria-pressed", "false");
        for (let sibling = index + 1; sibling < names.length; sibling++)
          await expect(series(page, names[sibling])).toHaveAttribute("aria-pressed", "true");
        expect(await rows(page)).toEqual(daily);
      }
      const filtered = await bars(page);
      expect(filtered.map((group) => group[0].uncertain)).toEqual([true]);
      expect(filtered[0][0].height).toBe(initial[7][0].height);
      expect(filtered[0][0].y + filtered[0][0].height).toBe(initial[0][0].y + initial[0][0].height);
      await tooltip(page, "tokens", daily);
      await expect(
        page.getByLabel("Tokens by model and speed", { exact: true }).locator("li"),
      ).toHaveCount(7);
      await expect(page.getByRole("tooltip")).toContainText("tiny.[model] Default1");
      await restore(page).focus();
      await page.keyboard.press("Space");
      expect(await bars(page)).toEqual(initial);
      await expect(series(page, names[6])).toBeFocused();
      await expect(restore(page)).toHaveCount(0);
      const labelBox = (await long.locator("span").last().boundingBox())!;
      await page.touchscreen.tap(labelBox.x + labelBox.width - 1, labelBox.y + labelBox.height - 1);
      await expect(long).toHaveAttribute("aria-pressed", "false");
      for (const name of names.filter((name) => name !== names[2]))
        await expect(series(page, name)).toHaveAttribute("aria-pressed", "true");
      await long.click();
      const swatchBox = (await series(page, names[0]).locator("span").first().boundingBox())!;
      await page.touchscreen.tap(swatchBox.x + 5, swatchBox.y + 5);
      await expect(series(page, names[0])).toHaveAttribute("aria-pressed", "false");
      for (const name of names.slice(1))
        await expect(series(page, name)).toHaveAttribute("aria-pressed", "true");
      await series(page, names[0]).click();
      await noOverflow(page);
      expect(
        await page.getByRole("main").evaluate((node) => node.scrollWidth - node.clientWidth),
      ).toBe(0);
      await capture(page, info, `filter-edges-${width}-${theme}`);
      await jsonEvidence(info, "tiny-series.json", { initial, filtered, daily, long: box });
    });

for (const state of ["unknown", "inactive", "filter-uncertain-only"])
  test(`no recorded series stays honest and recoverable: ${state}`, async ({ page }) => {
    await page.goto(`/calendar.html?state=${state}`);
    await settled(page);
    const daily = await rows(page);
    expect(daily[14][1]).toBe(state === "inactive" ? "0" : "Unavailable");
    await expect(
      page.getByRole("group", { name: "Models", exact: true }).getByRole("button"),
    ).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "Daily recorded values" }).getByRole("status"),
    ).toHaveText("No recorded model/speed series.");
    await expect(restore(page)).toHaveCount(0);
    expect(await rows(page)).toEqual(daily);
    if (state === "filter-uncertain-only") {
      expect(daily[14][8]).toBe("300");
      expect(await axis(page)).toEqual(["0", "75", "150", "225", "300"]);
      expect((await bars(page)).map((group) => group.map((bar) => bar.uncertain))).toEqual([
        [true],
      ]);
      await tooltip(page, "tokens", daily);
      await expect(page.getByRole("tooltip")).toContainText("Recorded tokensUnavailable");
      await expect(page.getByRole("tooltip")).toContainText("Uncertain estimate300 tokens");
      await expect(page.getByLabel("Tokens by model and speed", { exact: true })).toHaveCount(0);
    } else expect(await bars(page)).toEqual([]);
  });
