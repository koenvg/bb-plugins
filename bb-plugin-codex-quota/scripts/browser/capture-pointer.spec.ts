import { readFile } from "node:fs/promises";
import { test, expect, capture, jsonEvidence } from "./fixtures.js";
import { chart } from "./calendar-driver.js";

for (const coarse of [false, true]) {
  test.describe(coarse ? "coarse capture" : "fine capture", () => {
    test.use({ hasTouch: coarse, viewport: { width: 375, height: 600 } });

    for (const pageHeight of [400, 1800, 1900]) {
      for (const fullPage of [false, true]) {
        const name = `${pageHeight}px page ${fullPage ? "full" : "viewport"}`;
        test(name, async ({ page, context }, info) => {
          await page.setContent(`<style>
            html,body{margin:0;padding:0}body{height:${pageHeight}px;background:rgb(255,0,0)}
            button{display:block;border:0;padding:0;width:100px;height:16px;background:rgb(0,255,0)}
            @media(pointer:coarse){body{background:rgb(0,0,255)}button{height:44px}}
            i{position:absolute;left:0;width:100%;height:20px;background:rgb(0,255,255)}
            .seam{top:590px;background:rgb(255,255,0)}
            .middle{top:1190px;background:rgb(255,0,255)}
          </style><button aria-label="Target"></button>
          ${pageHeight > 600 ? '<i class="seam"></i><i class="middle"></i>' : ""}
          <i style="top:${pageHeight - 20}px"></i>`);
          await page.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
              ),
          );
          const identity = await page.evaluateHandle(() => {
            const media = matchMedia("(pointer:coarse)");
            const events = { resize: 0, media: 0 };
            addEventListener("resize", () => events.resize++);
            media.addEventListener("change", () => events.media++);
            return { document, target: document.querySelector("button"), events };
          });
          const before = {
            viewport: page.viewportSize(),
            url: page.url(),
            pages: context.pages(),
            box: await page.getByRole("button", { name: "Target" }).boundingBox(),
          };
          expect(before.box).toEqual({
            x: 0,
            y: 0,
            width: 100,
            height: coarse ? 44 : 16,
          });
          expect(await page.evaluate(() => matchMedia("(pointer:coarse)").matches)).toBe(coarse);
          const facts = await capture(page, info, "pointer-capture", fullPage);
          const after = await identity.evaluate(async (original) => {
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            );
            return {
              document: original.document === document,
              target: original.target === document.querySelector("button"),
              events: original.events,
              coarse: matchMedia("(pointer:coarse)").matches,
              scroll: { x: scrollX, y: scrollY },
            };
          });
          const png = await readFile(info.outputPath(facts.file));
          const pixels = await page.evaluate(async (base64) => {
            const image = new Image();
            image.src = `data:image/png;base64,${base64}`;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext("2d")!;
            context.drawImage(image, 0, 0);
            const rgb = (x: number, y: number) =>
              [...context.getImageData(x, y, 1, 1).data].slice(0, 3);
            const green = (x: number, y: number) => rgb(x, y).join(",") === "0,255,0";
            let width = 0;
            let height = 0;
            while (green(width, 0)) width++;
            while (green(0, height)) height++;
            return {
              width: image.width,
              height: image.height,
              target: { x: 0, y: 0, width, height },
              background: rgb(200, 100),
              bottom: rgb(200, image.height - 1),
              shortEnd: rgb(200, 399),
              seam:
                image.height > 610
                  ? [rgb(200, 589), rgb(200, 590), rgb(200, 609), rgb(200, 610)]
                  : null,
              middle:
                image.height > 1210
                  ? [rgb(200, 1189), rgb(200, 1190), rgb(200, 1209), rgb(200, 1210)]
                  : null,
            };
          }, png.toString("base64"));
          await jsonEvidence(info, "pointer-observations.json", {
            coarse,
            pageHeight,
            fullPage,
            facts,
            pixels,
            after,
          });
          const background = coarse ? [0, 0, 255] : [255, 0, 0];
          const height = fullPage ? Math.max(600, pageHeight) : 600;
          expect(facts).toMatchObject({
            file: "pointer-capture.png",
            width: 375,
            height,
            nonSolid: true,
          });
          expect(pixels).toMatchObject({
            width: 375,
            height,
            target: before.box,
            background,
          });
          expect(pixels.bottom).toEqual(
            pageHeight === 400 ? background : fullPage ? [0, 255, 255] : [255, 255, 0],
          );
          if (pageHeight === 400) expect(pixels.shortEnd).toEqual([0, 255, 255]);
          expect(facts.coverage.document).toEqual({
            width: 375,
            height: Math.max(600, pageHeight),
          });
          expect(facts.coverage.mode).toBe(
            fullPage && pageHeight > 600 ? "viewport-tiles" : "viewport",
          );
          if (fullPage && pageHeight > 600) {
            expect(facts.coverage.limitations).toEqual([
              "Scroll-composited evidence. Fixed and sticky content can repeat at tile boundaries.",
            ]);
            expect(facts.coverage.tiles.at(-1)).toEqual({
              x: 0,
              y: pageHeight - 600,
              width: 375,
              height: 600,
            });
          } else {
            expect(facts.coverage.tiles).toEqual([{ x: 0, y: 0, width: 375, height: 600 }]);
          }
          if (fullPage && pageHeight >= 1800) {
            expect(pixels.seam).toEqual([background, [255, 255, 0], [255, 255, 0], background]);
            expect(pixels.middle).toEqual([background, [255, 0, 255], [255, 0, 255], background]);
          }
          expect(after).toEqual({
            document: true,
            target: true,
            events: { resize: 0, media: 0 },
            coarse,
            scroll: { x: 0, y: 0 },
          });
          expect(page.viewportSize()).toEqual(before.viewport);
          expect(page.url()).toBe(before.url);
          expect(context.pages()).toEqual(before.pages);
          expect(await page.getByRole("button", { name: "Target" }).boundingBox()).toEqual(
            before.box,
          );
          await identity.dispose();
        });
      }
    }

    test("tile failure restores owned page", async ({ page, context }, info) => {
      await page.setContent(
        "<style>body{margin:0;height:1900px;background:blue}button{background:lime}</style><button>Target</button>",
      );
      const pages = context.pages();
      const target = await page.getByRole("button", { name: "Target" }).elementHandle();
      const screenshot = page.screenshot.bind(page);
      let failedAt = 0;
      page.screenshot = async (options) => {
        failedAt = await page.evaluate(() => scrollY);
        if (failedAt > 0) throw new Error("Injected tile capture failure");
        return screenshot(options);
      };
      try {
        await expect(capture(page, info, "interrupted")).rejects.toThrow(
          "Injected tile capture failure",
        );
      } finally {
        page.screenshot = screenshot;
      }
      expect(failedAt).toBe(600);
      expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual({
        x: 0,
        y: 0,
      });
      expect(page.viewportSize()).toEqual({ width: 375, height: 600 });
      expect(await page.evaluate(() => matchMedia("(pointer:coarse)").matches)).toBe(coarse);
      expect(context.pages()).toEqual(pages);
      expect(await target!.evaluate((node) => node === document.querySelector("button"))).toBe(
        true,
      );
      const recovered = await capture(page, info, "recovered");
      expect(recovered).toMatchObject({ width: 375, height: 1900, nonSolid: true });
      expect(recovered.coverage.tiles).toEqual([
        { x: 0, y: 0, width: 375, height: 600 },
        { x: 0, y: 600, width: 375, height: 600 },
        { x: 0, y: 1200, width: 375, height: 600 },
        { x: 0, y: 1300, width: 375, height: 600 },
      ]);
      await page.getByRole("button", { name: "Target" }).click();
      await expect(page.getByRole("button", { name: "Target" })).toBeFocused();
      await target!.dispose();
    });

    test("full dashboard capture retains chart identity", async ({ page }, info) => {
      await page.goto("/calendar.html?state=model-totals");
      await chart(page);
      await expect(page.getByRole("heading", { name: "Top 10 threads" })).toBeVisible();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const original = await page.locator('.ts-chart[role="img"]').elementHandle();
      const viewport = page.viewportSize();
      const facts = await capture(page, info, "dashboard");
      expect(facts.height).toBeGreaterThan(600);
      expect(
        await original!.evaluate(
          (node) => node === document.querySelector('.ts-chart[role="img"]'),
        ),
      ).toBe(true);
      expect(page.viewportSize()).toEqual(viewport);
      expect(await page.evaluate(() => matchMedia("(pointer:coarse)").matches)).toBe(coarse);
      await original!.dispose();
    });
  });
}
