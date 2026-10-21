import { test, expect, capture, jsonEvidence, noOverflow, reportTheme } from "./fixtures.js";
import type { Locator, Page } from "@playwright/test";

async function controlsFit(page: Page, panel: Locator, coarse: boolean) {
  await noOverflow(page);
  expect(
    await page.getByRole("main").evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBe(0);
  const measurements = await panel.evaluate((element) => {
    const panel = element.getBoundingClientRect();
    return Array.from(
      element.querySelectorAll<HTMLButtonElement | HTMLSelectElement>("button, select"),
    ).map((control) => {
      const box = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      const range = document.createRange();
      range.selectNodeContents(control);
      const textBoxes = control.tagName === "SELECT" ? [] : Array.from(range.getClientRects());
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d")!;
      context.font = style.font;
      const select = control as HTMLSelectElement;
      return {
        label: control.getAttribute("aria-label") ?? control.textContent?.trim(),
        width: box.width,
        height: box.height,
        contained: box.left >= panel.left && box.right <= panel.right && box.right <= innerWidth,
        textContained: textBoxes.every(
          (text) =>
            text.left >= box.left &&
            text.right <= box.right &&
            text.top >= box.top &&
            text.bottom <= box.bottom,
        ),
        selectedLabelFits:
          control.tagName !== "SELECT" ||
          context.measureText(select.selectedOptions[0].text).width <=
            box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2,
      };
    });
  });
  for (const control of measurements) {
    expect(control.contained, control.label ?? "control").toBe(true);
    expect(control.textContained, `${control.label} text`).toBe(true);
    expect(control.selectedLabelFits, `${control.label} selected label`).toBe(true);
    if (coarse) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
    }
  }
  const date = panel.locator("span[aria-label*=' to ']");
  if (await date.count()) {
    expect(
      await date.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        return Array.from(range.getClientRects()).every(
          (text) =>
            text.left >= box.left &&
            text.right <= box.right &&
            text.top >= box.top &&
            text.bottom <= box.bottom,
        );
      }),
      "date label stays readable",
    ).toBe(true);
  }
  return measurements;
}

for (const coarse of [true, false]) {
  test.describe(coarse ? "coarse pointer" : "fine pointer", () => {
    test.use({ hasTouch: coarse });
    for (const scope of ["all", "host"]) {
      test(`${scope} dashboard at 320px keeps 200% text and actions usable`, async ({
        page,
      }, info) => {
        await page.setViewportSize({ width: 320, height: 900 });
        await page.goto(`/native-usage.html?scope=${scope}`);
        await reportTheme(page, "light");
        const panel = page.getByRole("region", {
          name: scope === "all" ? "All-machine recorded usage" : "Calendar token report",
        });
        const previous = panel.getByRole("button", { name: "Previous 30 days", exact: true });
        const next = panel.getByRole("button", { name: "Next 30 days", exact: true });
        await expect(previous).toBeEnabled();
        const fontBefore = await previous.evaluate((element) =>
          parseFloat(getComputedStyle(element).fontSize),
        );
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        expect(
          await previous.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
        ).toBe(fontBefore * 2);
        expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(coarse);
        const initial = await controlsFit(page, panel, coarse);
        await previous.focus();
        await expect(previous).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(next).toBeEnabled();
        await expect(previous).toBeFocused();
        expect(
          await previous.evaluate((element) => getComputedStyle(element).outlineStyle),
        ).not.toBe("none");
        await page.keyboard.press("Tab");
        await expect(next).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(next).toBeDisabled();
        const total = scope === "all" ? "900" : "450";
        const daily = panel.getByRole("table", { name: "Daily recorded usage", exact: true });
        const recordedDay = daily.getByRole("row", { name: /^2026-09-15 / });
        await expect(recordedDay.locator("td").first()).toHaveText(total);
        const surface = panel.getByRole("img", { name: "Daily usage chart: Tokens", exact: true });
        await surface.focus();
        await page.keyboard.press("Home");
        for (let index = 0; index < 13; index++) {
          await page.evaluate(() => new Promise(requestAnimationFrame));
          await page.keyboard.press("ArrowRight");
        }
        const tooltip = page.getByRole("tooltip");
        await expect(tooltip.locator("time")).toHaveAttribute("datetime", "2026-09-15");
        await expect(tooltip.locator("dd").first()).toBeVisible();
        await expect(tooltip.locator("dd").first()).toHaveText(total);
        await expect(tooltip.locator("dd").first()).toHaveAttribute("title", `${total} tokens`);
        if (scope === "all") {
          const metrics = panel.getByRole("group", { name: "Chart metric" });
          await metrics.getByRole("button", { name: "Tokens", exact: true }).focus();
          await page.keyboard.press("Tab");
          const cost = metrics.getByRole("button", { name: "Estimated cost", exact: true });
          await expect(cost).toBeFocused();
          await page.keyboard.press("Enter");
          await expect(cost).toHaveAttribute("aria-pressed", "true");
          const groups = panel.getByRole("group", { name: "Usage grouping" });
          await groups.getByRole("button", { name: "Threads", exact: true }).focus();
          await page.keyboard.press("Tab");
          const workspaces = groups.getByRole("button", { name: "Workspaces", exact: true });
          await expect(workspaces).toBeFocused();
          await page.keyboard.press("Space");
          await expect(panel.getByRole("heading", { name: "Top 10 workspaces" })).toBeVisible();
          await previous.click();
          await expect(next).toBeEnabled();
          await panel.getByRole("button", { name: "Latest", exact: true }).click();
          await expect(next).toBeDisabled();
        } else {
          const metric = panel.getByRole("combobox", { name: "Report metric" });
          await metric.focus();
          await expect(metric).toBeFocused();
          await metric.selectOption("cost");
          await expect(metric).toHaveValue("cost");
        }
        const changed = await controlsFit(page, panel, coarse);
        // Repeat navigation with pointer input, after the layout has wrapped.
        if (coarse) await previous.tap();
        else await previous.click();
        await expect(next).toBeEnabled();
        if (coarse) await next.tap();
        else await next.click();
        await expect(next).toBeDisabled();
        await controlsFit(page, panel, coarse);
        await capture(page, info, `${scope}-320-text200-${coarse ? "coarse" : "fine"}`);
        await jsonEvidence(info, "control-layout.json", {
          initial,
          changed,
          viewport: 320,
          rootFontSize: await page.evaluate(
            () => getComputedStyle(document.documentElement).fontSize,
          ),
        });
      });
    }
  });
}
