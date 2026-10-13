import { test, expect, capture, jsonEvidence, reportTheme } from "./fixtures.js";

for (const coarse of [false, true]) {
  test.describe(coarse ? "coarse pointer" : "fine pointer", () => {
    test.use({ hasTouch: coarse });
    for (const width of [375, 1280])
      for (const theme of ["light", "dark"] as const)
        test(`legend targets ${width}px ${theme}`, async ({ page }, info) => {
          await page.setViewportSize({ width, height: 1100 });
          await page.goto("/calendar.html?state=model-speeds");
          await reportTheme(page, theme);
          expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(coarse);
          const legend = page.getByRole("group", { name: "Models", exact: true });
          const fast = legend.getByRole("button", { name: "gpt-6.1-sol Fast", exact: true });
          await expect(fast).toHaveAttribute("aria-pressed", "true");
          const measurements = [];
          for (const scale of [100, 200]) {
            await page.evaluate((scale) => {
              document.documentElement.style.fontSize = `${scale}%`;
            }, scale);
            const expectedHeight = coarse ? 44 : scale === 100 ? 16 : 32;
            const boxes = await legend.getByRole("button").evaluateAll((nodes) =>
              nodes.map((node) => {
                const box = node.getBoundingClientRect();
                const style = getComputedStyle(node);
                const swatch = node.querySelector("span")!.getBoundingClientRect();
                return {
                  x: box.x,
                  y: box.y,
                  width: box.width,
                  height: box.height,
                  font: style.fontSize,
                  lineHeight: style.lineHeight,
                  border: style.borderWidth,
                  padding: style.padding,
                  background: style.backgroundColor,
                  swatchWidth: swatch.width,
                  swatchHeight: swatch.height,
                };
              }),
            );
            expect(boxes).toHaveLength(3);
            for (const box of boxes) {
              expect(box.height).toBe(expectedHeight);
              if (coarse) expect(box.width).toBeGreaterThanOrEqual(44);
              expect(box).toMatchObject({
                font: scale === 100 ? "12px" : "24px",
                lineHeight: scale === 100 ? "16px" : "32px",
                border: "0px",
                padding: "0px",
                background: "rgba(0, 0, 0, 0)",
                swatchWidth: scale === 100 ? 10 : 20,
                swatchHeight: scale === 100 ? 10 : 20,
              });
            }
            for (let first = 0; first < boxes.length; first++)
              for (const second of boxes.slice(first + 1)) {
                const box = boxes[first];
                expect(
                  box.x + box.width <= second.x ||
                    second.x + second.width <= box.x ||
                    box.y + box.height <= second.y ||
                    second.y + second.height <= box.y,
                  "legend targets do not overlap",
                ).toBe(true);
              }
            measurements.push({ scale, boxes });
            if (scale === 100)
              await capture(page, info, `legend-${coarse ? "touch" : "mouse"}-${width}-${theme}`);
            const box = (await fast.boundingBox())!;
            const position = { x: box.width / 2, y: box.height - 2 };
            if (coarse) await fast.tap({ position });
            else await fast.click({ position });
            await expect(fast).toHaveAttribute("aria-pressed", "false");
            const restore = legend.getByRole("button", { name: "Restore all series", exact: true });
            const restoreBox = (await restore.boundingBox())!;
            expect(restoreBox.height).toBe(expectedHeight);
            if (coarse) {
              expect(restoreBox.width).toBeGreaterThanOrEqual(44);
              await restore.tap({
                position: { x: restoreBox.width / 2, y: restoreBox.height - 2 },
              });
            } else await restore.click();
            await expect(fast).toHaveAttribute("aria-pressed", "true");
            await expect(fast).toBeFocused();
            await expect(restore).toHaveCount(0);
          }
          await jsonEvidence(info, "legend-targets.json", { coarse, width, theme, measurements });
        });
  });
}
