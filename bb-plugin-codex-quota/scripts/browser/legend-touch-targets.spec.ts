import { test, expect, capture, jsonEvidence, reportTheme } from "./fixtures.js";

for (const coarse of [false, true]) {
  test.describe(coarse ? "coarse pointer" : "fine pointer", () => {
    test.use({ hasTouch: coarse });
    for (const width of [375, 1280])
      for (const theme of ["light", "dark"] as const)
        test(`legend targets ${width}px ${theme}`, async ({ page }, info) => {
          await page.setViewportSize({ width, height: 1100 });
          await page.goto("/calendar.html?state=model-totals");
          await reportTheme(page, theme);
          expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(coarse);
          const legend = page.getByRole("group", { name: "Models", exact: true });
          const model = legend.getByRole("button", { name: "gpt-6.1-sol", exact: true });
          await expect(model).toHaveAttribute("aria-pressed", "true");
          const measurements = [];
          for (const scale of [100, 200]) {
            await page.evaluate((scale) => {
              document.documentElement.style.fontSize = `${scale}%`;
            }, scale);
            await expect(legend.getByRole("button")).toHaveText(["gpt-6.1", "gpt-6.1-sol"]);
            await expect(legend.getByRole("button").first()).toHaveAccessibleName("gpt-6.1");
            await expect(model).toHaveAccessibleName("gpt-6.1-sol");
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
            expect(boxes).toHaveLength(2);
            for (const box of boxes) {
              expect(box.x).toBeGreaterThanOrEqual(0);
              expect(box.x + box.width).toBeLessThanOrEqual(width);
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
              await capture(
                page,
                info,
                `legend-${coarse ? "touch" : "mouse"}-${width}-${theme}`,
                false,
              );
            const box = (await model.boundingBox())!;
            const position = { x: box.width / 2, y: box.height - 2 };
            if (coarse) await model.tap({ position });
            else await model.click({ position });
            await expect(model).toHaveAttribute("aria-pressed", "false");
            const restore = legend.getByRole("button", { name: "Restore all series", exact: true });
            const restoreBox = (await restore.boundingBox())!;
            expect(restoreBox.height).toBe(expectedHeight);
            if (coarse) {
              expect(restoreBox.width).toBeGreaterThanOrEqual(44);
              await restore.tap({
                position: { x: restoreBox.width / 2, y: restoreBox.height - 2 },
              });
            } else await restore.click();
            await expect(model).toHaveAttribute("aria-pressed", "true");
            await expect(model).toBeFocused();
            await expect(restore).toHaveCount(0);
            await page.keyboard.press("Space");
            await expect(model).toHaveAttribute("aria-pressed", "false");
            await expect(model).toBeFocused();
            await page.keyboard.press("Tab");
            await expect(restore).toBeFocused();
            await page.keyboard.press("Enter");
            await expect(model).toHaveAttribute("aria-pressed", "true");
            await expect(model).toBeFocused();
            await expect(restore).toHaveCount(0);
          }
          await jsonEvidence(info, "legend-targets.json", { coarse, width, theme, measurements });
        });
  });
}
