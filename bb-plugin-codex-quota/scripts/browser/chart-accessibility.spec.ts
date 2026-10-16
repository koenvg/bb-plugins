import { test, expect, sizes, viewport, jsonEvidence } from "./fixtures.js";
import { chart, rows, axFacts, pointAtDate, calls } from "./calendar-driver.js";
import { tooltipDefinitions, verifyTooltip } from "./proof.js";

for (const width of sizes) {
  for (const scope of ["all", "host"] as const) {
    test(`named keyboard chart ${scope} ${width}px`, async ({ page }, info) => {
      await viewport(page, width);
      await page.goto(`/speed.html?scope=${scope}`);
      const receipts = [];
      for (const metric of ["tokens", "cost", "tokens"] as const) {
        if (scope === "host") {
          await page.getByRole("combobox", { name: "Report metric" }).selectOption(metric);
        } else {
          await page
            .getByRole("group", { name: "Chart metric" })
            .getByRole("button", {
              name: metric === "tokens" ? "Tokens" : "Estimated cost",
              exact: true,
            })
            .click();
        }
        await chart(page);
        const name = `Daily usage chart: ${metric === "tokens" ? "Tokens" : "USD estimate"}`;
        const application = page.getByRole("img", { name, exact: true });
        await expect(application).toHaveCount(1);
        expect(await application.evaluate((element) => element.tagName.toLowerCase())).toBe("svg");
        await expect(application).toHaveAttribute("tabindex", "0");

        const session = await page.context().newCDPSession(page);
        let applications;
        try {
          const tree = await session.send("Accessibility.getFullAXTree");
          applications = tree.nodes.filter((node) => !node.ignored && node.role?.value === "image");
          expect(applications).toHaveLength(1);
          expect(applications[0].name?.value).toBe(name);
        } finally {
          await session.detach();
        }
        const dailyRows = await rows(page);
        expect(dailyRows).toHaveLength(30);
        const table = await axFacts(page, dailyRows, metric);
        if (metric === "tokens") {
          const total = dailyRows
            .filter((row) => row[1] !== "Unavailable")
            .reduce((sum, row) => sum + Number(row[1].replaceAll(",", "")), 0);
          expect(total).toBe(scope === "all" ? 900 : 450);
        }

        // Reach the real SVG through Tab, then check both arrow directions.
        await application.hover({ position: { x: 1, y: 1 } });
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            }),
        );
        await page.mouse.move(0, 0);
        await application.focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        await expect(application).toBeFocused();
        const date = page.locator(".calendar-tooltip time");
        await page.keyboard.press("ArrowRight");
        await expect(date).toHaveAttribute("datetime", /2026-/);
        for (let step = 0; step < 30; step++) {
          if ((await date.getAttribute("datetime")) === dailyRows[0][0]) break;
          const before = await date.getAttribute("datetime");
          await page.keyboard.press("ArrowLeft");
          await expect(date).not.toHaveAttribute("datetime", before!);
        }
        await expect(date).toHaveAttribute("datetime", dailyRows[0][0]);
        await page.keyboard.press("ArrowRight");
        await expect(date).toHaveAttribute("datetime", dailyRows[1][0]);
        await page.keyboard.press("ArrowLeft");
        await expect(date).toHaveAttribute("datetime", dailyRows[0][0]);
        const keyboardDate = dailyRows[0][0];
        await page.keyboard.press("Home");
        for (let index = 0; index < 30; index++) {
          await expect(date).toHaveAttribute("datetime", dailyRows[index][0]);
          await expect(page.locator(".calendar-tooltip")).toHaveAttribute(
            "aria-label",
            `${dailyRows[index][0]}: ${dailyRows[index][1]}`,
          );
          if (index < 29) await page.keyboard.press("ArrowRight");
        }
        await page.keyboard.press("End");
        await expect(date).toHaveAttribute("datetime", dailyRows[29][0]);
        await page.keyboard.press("Home");
        await expect(date).toHaveAttribute("datetime", dailyRows[0][0]);
        await page.keyboard.press("Enter");
        await expect(page.locator(".calendar-tooltip")).toHaveAttribute("role", "dialog");
        await expect(page.locator(".calendar-tooltip")).toHaveAttribute(
          "aria-label",
          `${dailyRows[0][0]}: ${dailyRows[0][1]}`,
        );
        await page.keyboard.press("Space");
        await expect(page.locator(".calendar-tooltip")).toHaveAttribute("data-sticky", "false");
        await page.keyboard.press("Space");
        await expect(page.locator(".calendar-tooltip")).toHaveAttribute("data-sticky", "true");
        await page.keyboard.press("Escape");
        await expect(page.locator(".calendar-tooltip")).not.toBeVisible();
        await page.keyboard.press("Home");

        // Real pointer input must restore a positive bar's date and exact facts.
        await page
          .locator(".ts-chart__bar :is(rect,path)")
          .filter({ visible: true })
          .first()
          .hover();
        await expect(date).not.toHaveAttribute("datetime", keyboardDate);
        const pointerDate = await date.getAttribute("datetime");
        const row = dailyRows.find((row) => row[0] === pointerDate)!;
        expect(row).toBeDefined();
        const definitions = await page
          .locator(".calendar-tooltip dl > div")
          .evaluateAll((elements) =>
            elements.map((element) => [
              element.querySelector("dt")!.textContent!,
              element.querySelector("dd")!.textContent!,
            ]),
          );
        verifyTooltip(row, metric, pointerDate, definitions, [], keyboardDate);
        expect(definitions).toEqual(expect.arrayContaining(tooltipDefinitions(row, metric)));
        receipts.push({
          metric,
          applications,
          table,
          keyboardDate,
          pointerDate,
          definitions,
          dailyRows,
        });
      }
      await jsonEvidence(info, "chart-accessibility.json", {
        scope,
        width,
        receipts,
        limits: "Synthetic Chromium only. No screen-reader speech or installed BB host check.",
      });
    });
  }
}

for (const width of sizes) {
  for (const state of ["model-speeds", "unknown", "inactive", "filter-uncertain-only"]) {
    test(`native inspection every date ${state} ${width}px`, async ({ page }, info) => {
      await viewport(page, width);
      await page.goto(`/calendar.html?state=${state}`);
      await chart(page);
      const daily = await rows(page);
      if (state === "model-speeds") {
        for (const button of await page
          .getByRole("group", { name: "Models", exact: true })
          .getByRole("button")
          .all())
          await button.click();
        await expect(
          page
            .getByRole("group", { name: "Daily recorded values", exact: true })
            .locator('p[role="status"]'),
        ).toContainText("All model/speed series hidden. Recorded usage is not zero.");
      }
      const requests = await calls(page);
      const surface = page.getByRole("img", { name: "Daily usage chart: Tokens", exact: true });
      await surface.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await surface.focus();
      await page.keyboard.press("Home");
      const date = page.locator(".calendar-tooltip time");
      for (let index = 0; index < 30; index++) {
        await expect(date).toHaveAttribute("datetime", daily[index][0]);
        await expect(page.locator(".calendar-tooltip")).toHaveAttribute(
          "aria-label",
          `${daily[index][0]}: ${daily[index][1]}`,
        );
        if (index < 29) await page.keyboard.press("ArrowRight");
      }
      for (let index = 28; index >= 0; index--) {
        await page.keyboard.press("ArrowLeft");
        await expect(date).toHaveAttribute("datetime", daily[index][0]);
      }
      await page.keyboard.press("End");
      await expect(date).toHaveAttribute("datetime", daily[29][0]);
      for (const key of ["Enter", "Space"]) {
        await page.keyboard.press("Home");
        await page.keyboard.press(key);
        await expect(page.locator(".calendar-tooltip")).toHaveAttribute("data-sticky", "true");
        await expect(page.locator(".calendar-tooltip")).toHaveAttribute(
          "aria-label",
          `${daily[0][0]}: ${daily[0][1]}`,
        );
        await page.keyboard.press("Escape");
        await expect(page.locator(".calendar-tooltip")).not.toBeVisible();
      }
      const pointer = [];
      for (const position of ["top", "baseline"] as const) {
        for (const index of [0, 14, 29]) {
          await page.keyboard.press(index === 29 ? "Home" : "End");
          const fromDate = await date.getAttribute("datetime");
          await page.mouse.move(0, 0);
          await pointAtDate(page, index, position);
          await expect(date).toHaveAttribute("datetime", daily[index][0]);
          const definitions = await page
            .locator(".calendar-tooltip dl > div")
            .evaluateAll((elements) =>
              elements.map((element) => [
                element.querySelector("dt")!.textContent!,
                element.querySelector("dd")!.textContent!,
              ]),
            );
          verifyTooltip(
            daily[index],
            "tokens",
            await date.getAttribute("datetime"),
            definitions,
            [],
            fromDate,
          );
          pointer.push({ position, fromDate, date: daily[index][0], definitions });
        }
      }
      const axis = await surface.evaluate((svg) => ({
        bounds: svg.getBoundingClientRect().toJSON(),
        ticks: Array.from(svg.querySelectorAll('[data-ts-key^="x-tick-label:"]'), (node) => ({
          text: node.textContent,
          ...node.getBoundingClientRect().toJSON(),
        })),
      }));
      expect(axis.ticks.length).toBeGreaterThanOrEqual(2);
      for (let index = 0; index < axis.ticks.length; index++) {
        expect(axis.ticks[index].text).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Sep|Oct) \d+$/);
        expect(axis.ticks[index].left).toBeGreaterThanOrEqual(axis.bounds.left);
        expect(axis.ticks[index].right).toBeLessThanOrEqual(axis.bounds.right);
        if (index)
          expect(axis.ticks[index].left - axis.ticks[index - 1].right).toBeGreaterThanOrEqual(11.9);
      }
      expect(await rows(page)).toEqual(daily);
      expect(await calls(page)).toEqual(requests);
      await axFacts(page, daily, "tokens");
      await jsonEvidence(info, "native-inspection.json", {
        state,
        width,
        daily,
        pointer,
        axis,
        requests,
      });
    });
  }
}

test("native pinned date identity survives filtering, metric switches and same-query refresh", async ({
  page,
}) => {
  await page.goto("/calendar.html?state=stale");
  await chart(page);
  const surface = page.getByRole("img", { name: "Daily usage chart: Tokens", exact: true });
  const node = await surface.elementHandle();
  await page.mouse.move(0, 0);
  await surface.focus();
  await page.keyboard.press("End");
  const daily = await rows(page);
  const date = page.locator(".calendar-tooltip time");
  await expect(date).toHaveAttribute("datetime", daily[29][0]);
  await page.keyboard.press("Enter");
  await expect(page.locator(".calendar-tooltip")).toHaveAttribute("data-sticky", "true");
  const model = page
    .getByRole("group", { name: "Models", exact: true })
    .getByRole("button", { name: "Unknown model Default", exact: true });
  await model.focus();
  await page.keyboard.press("Space");
  await expect(model).toBeFocused();
  await expect(date).toHaveAttribute("datetime", daily[29][0]);
  await page
    .getByRole("group", { name: "Chart metric" })
    .getByRole("button", { name: "Estimated cost", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(date).toHaveAttribute("datetime", daily[29][0]);
  await expect(page.locator(".calendar-tooltip")).toHaveAttribute(
    "aria-label",
    `${daily[29][0]}: Unavailable`,
  );
  await page
    .getByRole("group", { name: "Chart metric" })
    .getByRole("button", { name: "Tokens", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(model).toHaveAttribute("aria-pressed", "false");
  await expect(date).toHaveAttribute("datetime", daily[29][0]);
  const refresh = page.getByRole("button", { name: "Refresh chart", exact: true });
  await refresh.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Retry chart", exact: true })).toBeEnabled();
  await expect(model).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Recorded values are out of date.", { exact: false })).toBeVisible();
  await expect(date).toHaveAttribute("datetime", daily[29][0]);
  expect(await node!.evaluate((element) => element === document.querySelector(".ts-chart"))).toBe(
    true,
  );
  await model.click();
  await expect(page.locator(".calendar-tooltip")).not.toBeVisible();
  await expect(model).toBeFocused();
  await surface.focus();
  await page.keyboard.press("Home");
  await expect(date).toHaveAttribute("datetime", daily[0][0]);
  await pointAtDate(page, 14, "top");
  await expect(date).toHaveAttribute("datetime", daily[14][0]);
  await expect(page.getByRole("tooltip").locator("dl dd").first()).toHaveText("600");
  await expect(page.locator(".calendar-tooltip")).toHaveAttribute(
    "aria-label",
    `${daily[14][0]}: 600`,
  );
  await page.mouse.move(0, 0);
  await page.keyboard.press("Home");
  await expect(date).toHaveAttribute("datetime", daily[0][0]);
  await model.focus();
  await expect(page.locator(".calendar-tooltip")).not.toBeVisible();
});
