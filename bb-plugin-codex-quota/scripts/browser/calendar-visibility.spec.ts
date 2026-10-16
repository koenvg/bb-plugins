import { test, expect, capture, jsonEvidence, reportTheme } from "./fixtures.js";
import { chart, rows, pointAtDate } from "./calendar-driver.js";

for (const width of [375, 1280])
  for (const theme of ["light", "dark"] as const) {
    test(`tiny recorded days remain visible and reachable at ${width}px ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/calendar.html?state=mixed-magnitude");
      await reportTheme(page, theme);
      await chart(page);
      const daily = await rows(page);
      const markers = page.locator(".calendar-positive-usage");
      await expect(markers).toHaveCount(2);
      expect(
        await markers.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-ts-key")?.replace("positive:", "")),
        ),
      ).toEqual([daily[15][0], daily[16][0]]);
      expect(daily[15].slice(1, 8)).toEqual(["4", "1", "1", "1", "1", "0", "0"]);
      expect(daily[16][1]).toBe("1");
      expect(daily[16][7]).toBe("1");
      expect(daily[0][1]).toBe("Unavailable");
      expect(daily[17][1]).toBe("0");
      expect(daily[18][1]).toBe("Unavailable");
      const surface = page.locator('.ts-chart[role="img"]');
      const date = page.locator(".calendar-tooltip time");
      const tip = page.getByRole("tooltip");
      const receipts = [];
      for (const index of [15, 16]) {
        await surface.hover({ position: { x: 1, y: 1 } });
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        await page.mouse.move(0, 0);
        await surface.focus();
        await page.keyboard.press("ArrowRight");
        for (let step = 0; step < 30; step++) {
          const current = await date.getAttribute("datetime");
          if (current === daily[index][0]) break;
          const currentIndex = daily.findIndex((row) => row[0] === current);
          expect(currentIndex).toBeGreaterThanOrEqual(0);
          await page.keyboard.press(currentIndex > index ? "ArrowLeft" : "ArrowRight");
          await expect(date).not.toHaveAttribute("datetime", current!);
        }
        await expect(date).toHaveAttribute("datetime", daily[index][0]);
        await expect(tip.locator("dl dd").first()).toHaveText(index === 15 ? "4" : "1");
        await page.keyboard.press("ArrowLeft");
        await expect(date).not.toHaveAttribute("datetime", daily[index][0]);
        const marker = page.locator(`[data-ts-key="positive:${daily[index][0]}"]`);
        const box = (await marker.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(2);
        expect(box.width).toBeGreaterThanOrEqual(4);
        const color = await marker.evaluate((node) => getComputedStyle(node).fill);
        expect(color).not.toBe("none");
        // Move the real pointer onto the visible marker, not the vanishing stack.
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await expect(date).toHaveAttribute("datetime", daily[index][0]);
        await expect(tip.locator("dl dd").first()).toHaveText(index === 15 ? "4" : "1");
        if (index === 15) {
          for (const label of [
            "Input (uncached) tokens",
            "Output tokens",
            "Cache read tokens",
            "Cache write tokens",
          ])
            await expect(
              tip
                .locator("dl > div")
                .filter({ has: page.getByText(label, { exact: true }) })
                .locator("dd"),
            ).toHaveText("1");
        } else {
          await expect(
            tip
              .locator("dl > div")
              .filter({ has: page.getByText("Unclassified tokens", { exact: true }) })
              .locator("dd"),
          ).toHaveText("1");
        }
        receipts.push({ date: daily[index][0], box, color, keyboardAndHover: "passed" });
      }
      await capture(page, info, `small-days-${width}-${theme}`);
      await jsonEvidence(info, "visibility.json", {
        width,
        theme,
        receipts,
        daily,
        limit: "Synthetic Chromium. Not installed BB or screen-reader speech proof.",
      });
    });
  }

for (const width of [375, 1280])
  for (const theme of ["light", "dark"] as const)
    test(`underflowed captured cost remains visible ${width}px ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/calendar.html?state=cost-underflow");
      await reportTheme(page, theme);
      await chart(page);
      await page
        .getByRole("group", { name: "Chart metric" })
        .getByRole("button", { name: "Estimated cost", exact: true })
        .click();
      const daily = await rows(page);
      expect(daily[14][1]).toBe("$9,007,199,254,740,991");
      expect(daily[15][1]).toBe("$5e-324");
      const marker = page.locator(".calendar-positive-usage");
      await expect(marker).toHaveCount(1);
      await expect(marker).toHaveAttribute("data-ts-key", `positive:${daily[15][0]}`);
      await expect(marker).toHaveAttribute("width", "6");
      await expect(marker).toHaveAttribute("height", "2");
      await expect(marker).toHaveAttribute("aria-hidden", "true");
      const surface = page.getByRole("img", {
        name: "Daily usage chart: USD estimate",
        exact: true,
      });
      for (const position of ["top", "baseline"] as const) {
        await surface.focus();
        await page.keyboard.press("Home");
        await pointAtDate(page, 15, position);
        await expect(page.locator(".calendar-tooltip time")).toHaveAttribute(
          "datetime",
          daily[15][0],
        );
        await expect(page.getByRole("tooltip").locator("dl dd").first()).toHaveText("$5e-324");
        await expect(page.locator(".calendar-tooltip")).toHaveAttribute(
          "aria-label",
          `${daily[15][0]}: $5e-324`,
        );
      }
      await capture(page, info, `cost-underflow-${width}-${theme}`);
      await jsonEvidence(info, "underflow.json", { daily, marker: await marker.boundingBox() });
    });
