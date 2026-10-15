import { test, expect, jsonEvidence, reportTheme } from "./fixtures.js";
import { chart, calls, rows } from "./calendar-driver.js";
import { layout } from "./chart-layout.js";

for (const theme of ["light", "dark"] as const)
  for (const portalMode of ["popover", "fallback"] as const)
    for (const state of ["model-speeds", "tooltip-max"])
      for (const metric of ["tokens", "cost"] as const)
        test(`viewport tooltip ${state} ${metric} ${portalMode} ${theme}`, async ({
          page,
        }, info) => {
          await page.setViewportSize({ width: 375, height: 812 });
          if (portalMode === "fallback")
            await page.addInitScript(() => {
              Object.defineProperty(HTMLElement.prototype, "showPopover", { value: undefined });
            });
          await page.goto(`/calendar.html?state=${state}`);
          await reportTheme(page, theme);
          await chart(page);
          if (metric === "cost") {
            await page.getByRole("button", { name: "Estimated cost", exact: true }).click();
            await chart(page);
          }
          await page.evaluate(() => {
            const shell = document.createElement("div");
            shell.id = "scrolling-shell";
            shell.style.cssText = "position:fixed;inset:0;overflow:auto;transform:translateZ(0)";
            const spacer = document.createElement("div");
            spacer.style.height = "900px";
            document.body.append(shell);
            shell.append(spacer, document.getElementById("root")!);
            shell.scrollTop =
              document.querySelector(".ts-chart")!.getBoundingClientRect().top - 532;
          });
          const surface = page.getByRole("img", { name: /^Daily usage chart:/ });
          await expect.poll(async () => (await surface.boundingBox())!.y).toBe(532);
          expect((await surface.boundingBox())!.height).toBe(280);
          const beforeCalls = await calls(page);
          const beforeRows = await rows(page);
          const card = page.locator('.calendar-tooltip [role="tooltip"]');
          const native = page.locator(".calendar-tooltip");
          await page.locator(".ts-chart__bar :is(rect,path)").last().tap();
          await expect(native).toHaveAttribute("data-sticky", "true");
          await expect(card.locator("time")).toHaveAttribute("datetime", "2026-09-16");
          const touchBounds = await card.boundingBox();
          await jsonEvidence(info, "touch-placement.json", touchBounds);
          await page.screenshot({ path: info.outputPath("touch-pinned.png") });
          expect(touchBounds!.y + touchBounds!.height).toBeLessThanOrEqual(804);
          await page.keyboard.press("Escape");
          await expect(native).toBeHidden();
          await surface.focus();
          await page.keyboard.press("Home");
          for (let index = 0; index < 14; index++) {
            await page.evaluate(() => new Promise(requestAnimationFrame));
            await page.keyboard.press("ArrowRight");
          }
          await expect(card.locator("time")).toHaveAttribute("datetime", "2026-09-16");
          await page.keyboard.press("Enter");
          await expect(native).toHaveAttribute("data-sticky", "true");
          const expected =
            metric === "cost"
              ? "$0.39813160000000003"
              : state === "tooltip-max"
                ? "3,000 tokens"
                : "600 tokens";
          if (metric === "tokens")
            await expect(card.locator("dd").first()).toHaveAttribute("title", expected);
          else await expect(card.locator("dd").first()).toHaveText(expected);
          if (metric === "tokens") {
            await expect(card.locator("dl > div")).toContainText([
              "Recorded tokens",
              "Input (uncached) tokens40",
              "Output tokens360",
              "Cache read tokens200",
              "Cache write tokens0",
              "Reasoning tokens (in output)100",
            ]);
            const detail = card.getByLabel("Tokens by model and speed").locator("li");
            if (state === "model-speeds")
              await expect(detail).toHaveText([
                "gpt-6.1 Default100",
                "gpt-6.1-sol Default100",
                "gpt-6.1-sol Fast400",
              ]);
            else {
              await expect(detail).toHaveCount(30);
              await expect(detail.locator("span.tabular-nums")).toHaveText(Array(30).fill("100"));
              await expect(detail.first()).toHaveText(`model-0-${"x".repeat(120)} Default100`);
              await expect(detail.nth(23)).toHaveText(`model-7-${"x".repeat(120)} Ultrafast100`);
              await expect(detail.nth(24)).toHaveText("Other models Default100");
              await expect(detail.last()).toHaveText("Unknown model Ultrafast100");
              await expect(card).toContainText("Unclassified tokens2.4 thousand");
              await expect(card).toContainText("Uncertain estimate300 tokens");
            }
          }
          const geometry = await native.evaluate((element) => {
            const card = element.querySelector<HTMLElement>('[role="tooltip"]')!;
            return {
              surface: document
                .querySelector(".ts-chart-surface")!
                .getBoundingClientRect()
                .toJSON(),
              native: element.getBoundingClientRect().toJSON(),
              card: card.getBoundingClientRect().toJSON(),
              scrollHeight: card.scrollHeight,
              clientHeight: card.clientHeight,
              portal: (element as HTMLElement).dataset.tsChartTooltipPortal ?? null,
            };
          });
          await jsonEvidence(info, "placement.json", geometry);
          await page.screenshot({ path: info.outputPath("pinned.png") });
          expect(geometry.portal).toBe(portalMode);
          const themeFacts = (await layout(page)).tooltipTheme;
          expect(themeFacts.backgroundAlpha).toBe(1);
          expect(themeFacts.opacity).toBe(1);
          for (const text of themeFacts.textContrast)
            expect(text.ratio).toBeGreaterThanOrEqual(4.5);
          await jsonEvidence(info, "theme.json", themeFacts);
          expect(geometry.card.top).toBeGreaterThanOrEqual(8);
          expect(geometry.card.bottom).toBeLessThanOrEqual(804);
          expect(geometry.card.left).toBeGreaterThanOrEqual(8);
          expect(geometry.card.right).toBeLessThanOrEqual(367);
          if (state === "tooltip-max" && metric === "tokens") {
            expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
            const session = await page.context().newCDPSession(page);
            try {
              await session.send("Input.dispatchTouchEvent", {
                type: "touchStart",
                touchPoints: [{ x: 180, y: 600 }],
              });
              for (const y of [550, 450, 350, 250, 150])
                await session.send("Input.dispatchTouchEvent", {
                  type: "touchMove",
                  touchPoints: [{ x: 180, y }],
                });
              await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
              await expect
                .poll(() => card.evaluate((element) => element.scrollTop))
                .toBeGreaterThan(0);
            } finally {
              await session.detach();
            }
            await card.evaluate(
              (element) =>
                new Promise<void>((resolve) => {
                  let previous = -1;
                  let stableFrames = 0;
                  const settled = () => {
                    stableFrames = element.scrollTop === previous ? stableFrames + 1 : 0;
                    previous = element.scrollTop;
                    if (stableFrames === 12) resolve();
                    else requestAnimationFrame(settled);
                  };
                  requestAnimationFrame(settled);
                }),
            );
            await card.hover();
            await page.mouse.wheel(0, 10000);
            await expect
              .poll(() =>
                card.evaluate(
                  (element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
                ),
              )
              .toBe(true);
            await expect(
              card.getByLabel("Tokens by model and speed").locator("li").last(),
            ).toBeInViewport({ ratio: 1 });
            await page.screenshot({ path: info.outputPath("scrolled-last-row.png") });
          }
          await page.keyboard.press("Escape");
          await expect(native).toBeHidden();
          await page.locator(".ts-chart__bar :is(rect,path)").last().tap();
          await expect(native).toHaveAttribute("data-sticky", "true");
          await expect(card.locator("time")).toHaveAttribute("datetime", "2026-09-16");
          await expect
            .poll(async () => (await card.boundingBox())!.y + (await card.boundingBox())!.height)
            .toBeLessThanOrEqual(804);
          await page.locator("#scrolling-shell").evaluate((shell) => {
            shell.scrollTop += 80;
          });
          await expect.poll(async () => (await surface.boundingBox())!.y).toBe(452);
          await expect
            .poll(async () => (await card.boundingBox())!.y + (await card.boundingBox())!.height)
            .toBeLessThanOrEqual(804);
          await page.setViewportSize({ width: 375, height: 720 });
          await expect
            .poll(async () => (await card.boundingBox())!.y + (await card.boundingBox())!.height)
            .toBeLessThanOrEqual(712);
          await expect.poll(async () => (await card.boundingBox())!.y).toBeGreaterThanOrEqual(8);
          const resized = await card.boundingBox();
          expect(resized!.x).toBeGreaterThanOrEqual(8);
          expect(resized!.x + resized!.width).toBeLessThanOrEqual(367);
          await jsonEvidence(info, "resized-placement.json", resized);
          await page.keyboard.press("Escape");
          await expect(native).toBeHidden();
          if (metric === "tokens" && state === "model-speeds") {
            const filter = page.getByRole("button", { name: "gpt-6.1-sol Fast", exact: true });
            await filter.focus();
            await page.keyboard.press("Space");
            await expect(filter).toHaveAttribute("aria-pressed", "false");
            await surface.focus();
            await page.keyboard.press("Home");
            for (let index = 0; index < 14; index++) {
              await page.evaluate(() => new Promise(requestAnimationFrame));
              await page.keyboard.press("ArrowRight");
            }
            await page.keyboard.press("Enter");
            await expect(card.locator("dd").first()).toHaveAttribute("title", "600 tokens");
            await expect(card.getByLabel("Tokens by model and speed")).toContainText(
              "gpt-6.1-sol Fast400",
            );
            await page.keyboard.press("Escape");
          }
          expect(await rows(page)).toEqual(beforeRows);
          expect(await calls(page)).toEqual(beforeCalls);
        });

for (const portalMode of ["popover", "fallback"] as const) {
  test(`keyboard tall content ${portalMode}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 812 });
    if (portalMode === "fallback")
      await page.addInitScript(() => {
        Object.defineProperty(HTMLElement.prototype, "showPopover", { value: undefined });
      });
    await page.goto("/calendar.html?state=tooltip-max");
    await chart(page);
    await page.evaluate(() => {
      const shell = document.createElement("div");
      shell.id = "scrolling-shell";
      shell.style.cssText = "position:fixed;inset:0;overflow:auto;transform:translateZ(0)";
      const spacer = document.createElement("div");
      spacer.style.height = "900px";
      document.body.append(shell);
      shell.append(spacer, document.getElementById("root")!);
      shell.scrollTop = document.querySelector(".ts-chart")!.getBoundingClientRect().top - 532;
    });
    const surface = page.getByRole("img", { name: /^Daily usage chart:/ });
    await expect.poll(async () => (await surface.boundingBox())!.y).toBe(532);
    await surface.focus();
    await page.keyboard.press("Home");
    for (let index = 0; index < 14; index++) {
      await page.evaluate(() => new Promise(requestAnimationFrame));
      await page.keyboard.press("ArrowRight");
    }
    const native = page.locator(".calendar-tooltip");
    const card = native.locator('[role="tooltip"]');
    await expect(card.locator("time")).toHaveAttribute("datetime", "2026-09-16");
    await expect(surface).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(native).toHaveAttribute("data-sticky", "true");
    await expect(native).toHaveAttribute("data-ts-chart-tooltip-portal", portalMode);
    const trace = [];
    for (let tabs = 0; tabs < 70; tabs++) {
      if (await card.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press("Tab");
      trace.push(
        await page.evaluate(() => ({
          focus: document.activeElement?.tagName,
          text: document.activeElement?.textContent?.slice(0, 140),
          hidden: document.querySelector(".calendar-tooltip")?.hasAttribute("hidden"),
        })),
      );
    }
    await jsonEvidence(info, "keyboard-entry.json", trace);
    await expect(card).toBeFocused();
    await expect(native).toBeVisible();
    const detail = card.getByLabel("Tokens by model and speed").locator("li");
    await expect(detail).toHaveCount(30);
    await expect(detail.locator("span.tabular-nums")).toHaveText(Array(30).fill("100"));
    await expect(card.locator("dd").first()).toHaveAttribute("title", "3,000 tokens");
    const scroll = [];
    for (let index = 0; index < 4; index++) {
      await page.keyboard.press("PageDown");
      await page.waitForTimeout(300);
      scroll.push(await card.evaluate((element) => element.scrollTop));
    }
    await jsonEvidence(info, "keyboard-scroll.json", scroll);
    await expect(detail.last()).toHaveText("Unknown model Ultrafast100");
    await expect(detail.last()).toBeInViewport({ ratio: 1 });
    await expect(detail.last().locator("span.tabular-nums")).toBeInViewport({ ratio: 1 });
    await expect(native).toHaveAttribute("data-sticky", "true");
    await expect(surface).toBeInViewport({ ratio: 1 });
    const bounds = (await card.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(8);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(804);
    await page.screenshot({ path: info.outputPath("keyboard-final-row.png") });
    await page.keyboard.press("Escape");
    await expect(native).toBeHidden();
    await expect(surface).toBeFocused();
    await page.keyboard.press("Home");
    for (let index = 0; index < 14; index++) {
      await page.evaluate(() => new Promise(requestAnimationFrame));
      await page.keyboard.press("ArrowRight");
    }
    await expect(card.locator("time")).toHaveAttribute("datetime", "2026-09-16");
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.keyboard.press("ArrowLeft");
    await expect(card.locator("time")).toHaveAttribute("datetime", "2026-09-15");
    await page.keyboard.press("ArrowRight");
    await expect(card.locator("time")).toHaveAttribute("datetime", "2026-09-16");
    await page.keyboard.press("Space");
    await expect(native).toHaveAttribute("data-sticky", "true");
    await page.keyboard.press("Escape");
    await expect(native).toBeHidden();
    await expect(surface).toBeFocused();
  });

  test(`transient hover preserves external focus ${portalMode}`, async ({ page }) => {
    if (portalMode === "fallback")
      await page.addInitScript(() => {
        Object.defineProperty(HTMLElement.prototype, "showPopover", { value: undefined });
      });
    await page.goto("/calendar.html?state=model-speeds");
    await chart(page);
    const metric = page.getByRole("button", { name: "Tokens", exact: true });
    await metric.focus();
    await page.locator(".ts-chart__bar :is(rect,path)").last().hover();
    const native = page.locator(".calendar-tooltip");
    await expect(native).toBeVisible();
    await expect(native).toHaveAttribute("data-sticky", "false");
    await expect(metric).toBeFocused();
    await expect(native.locator("time")).toHaveAttribute("datetime", "2026-09-16");
  });
}
