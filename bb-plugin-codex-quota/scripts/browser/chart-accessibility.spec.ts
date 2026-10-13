import { test, expect, sizes, viewport, jsonEvidence } from "./fixtures.js";
import { chart, rows, axFacts } from "./calendar-driver.js";
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
        const application = page.getByRole("application", { name, exact: true });
        await expect(application).toHaveCount(1);
        expect(await application.evaluate((element) => element.tagName.toLowerCase())).toBe("svg");
        await expect(application).toHaveAttribute("tabindex", "0");

        const session = await page.context().newCDPSession(page);
        let applications;
        try {
          const tree = await session.send("Accessibility.getFullAXTree");
          applications = tree.nodes.filter(
            (node) => !node.ignored && node.role?.value === "application",
          );
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
        const date = page.locator(".recharts-tooltip-wrapper time");
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

        // Real pointer input must restore a positive bar's date and exact facts.
        await page
          .locator(".recharts-bar-rectangle path")
          .filter({ visible: true })
          .first()
          .hover();
        await expect(date).not.toHaveAttribute("datetime", keyboardDate);
        const pointerDate = await date.getAttribute("datetime");
        const row = dailyRows.find((row) => row[0] === pointerDate)!;
        expect(row).toBeDefined();
        const definitions = await page
          .locator(".recharts-tooltip-wrapper dl > div")
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
