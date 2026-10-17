import { test as base, expect, type Page, type Locator } from "@playwright/test";
import type {} from "./fixture.test";

const test = base.extend<{ clean: void }>({
  clean: [
    async ({ page, context }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await context.route("**/*", (route) =>
        new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
      );
      await use();
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
const chart = (page: Page) => page.getByRole("img", { name: /^Observed output/ });
const native = (page: Page) => page.locator(".live-output-rate-tooltip:not([hidden])");
const time = (page: Page) => native(page).locator("time");
const stamp = (second: number) => new Date(second * 1000).toISOString();
async function start(page: Page, query = "") {
  await page.goto(`/fixture.html${query}`);
  await expect(chart(page)).toBeVisible();
  await page.waitForFunction(() => Boolean(window.outputFixture));
}
async function pointer(page: Page, second: number, last = 599) {
  const box = (await chart(page).boundingBox())!;
  await page.mouse.move(box.x + (box.width * second) / last, box.y + 110);
}
async function lineFacts(surface: Locator) {
  return surface.evaluate((svg) => {
    const path = svg.querySelector('path[stroke-width="2"]')!;
    const d = path.getAttribute("d")!;
    const points = Array.from(d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g), (match) => [
      Number(match[1]),
      Number(match[2]),
    ]);
    return { d, points, viewBox: svg.getAttribute("viewBox") };
  });
}
async function withinViewport(page: Page) {
  const bounds = (await native(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.y).toBeGreaterThanOrEqual(8);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 8);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 8);
}
function contrast(foreground: string, background: string) {
  const luminance = (color: string) => {
    const channels = color
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map((value) => Number(value) / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  };
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("native 600-sample series, literal rates/domains, shared footer and contributor navigation", async ({
  page,
  browser,
}, info) => {
  expect(browser.version()).toBe("153.0.8010.12");
  await info.attach("browser-version", { body: browser.version(), contentType: "text/plain" });
  await page.clock.install({ time: new Date("2026-10-10T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-10T00:00:01Z"));
  await start(page);
  expect(await page.evaluate(() => window.outputFixture.facts().calls)).toBe(1);
  await expect(page.getByLabel("Current rate")).toHaveText("10est. tokens/s");
  await expect(page.locator("#host-footer")).toContainText("10 tok/s");
  const smooth = await lineFacts(chart(page));
  expect(smooth.points).toHaveLength(600);
  expect(smooth.points[0]).toEqual([0, 110]);
  expect(smooth.points[599]?.[1]).toBe(110);
  expect(smooth.points[300]?.[1]).toBe(70);
  await pointer(page, 300);
  await expect(time(page)).toHaveAttribute("datetime", stamp(300));
  await expect(native(page)).toContainText("15 est. tokens/s");
  await page.getByRole("button", { name: "Raw · 1 second" }).dispatchEvent("click");
  await expect(page.getByLabel("Current rate")).toHaveText("20est. tokens/s");
  await expect(native(page)).toContainText("30 est. tokens/s");
  const raw = await lineFacts(chart(page));
  expect(raw.points).toHaveLength(600);
  expect(raw.points[0]?.[1]).toBe(101.11);
  expect(raw.points[300]?.[1]).toBe(56.67);
  expect(raw.d).not.toBe(smooth.d);
  await expect(page.locator("[data-output-axes]")).toContainText("36");
  await page.getByRole("button", { name: "Bytes/s", exact: true }).dispatchEvent("click");
  await expect(page.getByLabel("Current rate")).toHaveText("80bytes/s");
  await expect(native(page)).toContainText("120 bytes/s");
  await expect(native(page)).toContainText("Raw 1-second bucket");
  await expect(page.locator("[data-output-axes]")).toContainText("144");
  expect((await lineFacts(chart(page))).points[300]?.[1]).toBe(56.67);
  await expect(page.locator("#host-footer")).toContainText("10 tok/s");
  await page.getByRole("button", { name: "Child work", exact: true }).click();
  expect(await page.evaluate(() => window.outputFixture.facts().navigation)).toEqual([
    { method: "toThread", threadId: "thr_child" },
  ]);
  await page.evaluate(() => window.outputFixture.unmount("page"));
  const before = await page.evaluate(() => window.outputFixture.facts().calls);
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.outputFixture.facts().calls)).toBe(before + 1);
  await page.evaluate(() => window.outputFixture.unmount("footer"));
  const stopped = await page.evaluate(() => window.outputFixture.facts().calls);
  await page.clock.runFor(2000);
  expect(await page.evaluate(() => window.outputFixture.facts().calls)).toBe(stopped);
});

test("absolute time survives stationary pointer slides, rate changes, stale recovery and expiry", async ({
  page,
}) => {
  await start(page);
  await pointer(page, 300);
  await page.evaluate(() => window.outputFixture.update({ offset: 1, revision: true }));
  await expect(time(page)).toHaveAttribute("datetime", stamp(300));
  await expect(native(page)).toContainText("20 est. tokens/s");
  await page.getByRole("button", { name: "Raw · 1 second" }).dispatchEvent("click");
  await expect(native(page)).toContainText("40 est. tokens/s");
  await page.getByRole("button", { name: "Bytes/s", exact: true }).dispatchEvent("click");
  await expect(native(page)).toContainText("160 bytes/s");
  const retained = await lineFacts(chart(page));
  await page.evaluate(() => window.outputFixture.connection("reconnecting"));
  await expect(native(page)).toHaveCount(0);
  await expect(page.getByLabel("Current rate")).toHaveText("—bytes/s");
  await expect(page.getByText(/last graph is stale/)).toBeVisible();
  expect((await lineFacts(chart(page))).d).toBe(retained.d);
  await pointer(page, 0);
  await page.keyboard.press("ArrowLeft");
  await page.evaluate(() => window.outputFixture.connection("connected"));
  await expect(time(page)).toHaveAttribute("datetime", stamp(300));
  await page.evaluate(() => window.outputFixture.update({ offset: 601 }));
  await expect(native(page)).toHaveCount(0);
  await page.evaluate(() => window.outputFixture.update({ offset: 602 }));
  await expect(native(page)).toHaveCount(0);
});

test("real native keyboard, approved Enter/Space, global Escape and focused leave", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => {
    window.keyboardEvidence = [];
    window.addEventListener("keydown", (event) =>
      window.keyboardEvidence.push({ key: event.key, prevented: event.defaultPrevented }),
    );
  });
  const surface = chart(page);
  await surface.focus();
  await expect(time(page)).toHaveAttribute("datetime", stamp(599));
  await page.keyboard.press("ArrowLeft");
  await expect(time(page)).toHaveAttribute("datetime", stamp(598));
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowLeft");
  await expect(time(page)).toHaveAttribute("datetime", stamp(0));
  for (let i = 0; i < 300; i++) await page.keyboard.press("ArrowRight");
  await expect(time(page)).toHaveAttribute("datetime", stamp(300));
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowRight");
  await expect(time(page)).toHaveAttribute("datetime", stamp(599));
  for (const key of ["Enter", "Space"]) await page.keyboard.press(key);
  await expect(time(page)).toHaveAttribute("datetime", stamp(599));
  await pointer(page, 150);
  await page.mouse.move(0, 0);
  await expect(time(page)).toHaveAttribute("datetime", stamp(150));
  await page.keyboard.press("Escape");
  await expect(native(page)).toHaveCount(0);
  await expect(surface).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowLeft");
  await expect(time(page)).toHaveAttribute("datetime", stamp(598));
  await page.evaluate(() => window.outputFixture.update({ offset: 1 }));
  await expect(time(page)).toHaveAttribute("datetime", stamp(598));
  const control = page.getByRole("button", { name: "Bytes/s", exact: true });
  await control.focus();
  await pointer(page, 299);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await expect(time(page)).toHaveAttribute("datetime", stamp(300));
  await page.keyboard.press("Escape");
  await expect(native(page)).toHaveCount(0);
  await expect(control).toBeFocused();
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await pointer(page, 299);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  await expect(native(page)).toHaveCount(0);
  const keys = await page.evaluate(() => window.keyboardEvidence);
  expect(keys.filter((event) => event.key === "Escape").every((event) => !event.prevented)).toBe(
    true,
  );
  expect(keys.filter((event) => event.key === "Enter").map((event) => event.prevented)).toEqual([
    true,
    false,
    false,
    false,
  ]);
  expect(keys.filter((event) => event.key === " ").map((event) => event.prevented)).toEqual([
    true,
    false,
    false,
    false,
  ]);
  await control.focus();
  await pointer(page, 299);
  await control.evaluate((element) =>
    element.addEventListener("keydown", (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      event.stopPropagation();
      element.setAttribute("data-host-key", `${event.key}:${event.defaultPrevented}`);
    }),
  );
  await page.keyboard.press("Escape");
  await expect(control).toHaveAttribute("data-host-key", "Escape:false");
  await expect(control).toBeFocused();
  await expect(native(page)).toHaveCount(0);
});

test("waiting focus resolves latest once, unavailable Escape cancels intent, startup padding differs from zero", async ({
  page,
}) => {
  await start(page, "?waiting");
  await expect(page.getByLabel("Current rate")).toHaveText("—est. tokens/s");
  await chart(page).focus();
  await expect(native(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.outputFixture.update({}));
  await expect(native(page)).toHaveCount(0);
  await chart(page).evaluate((element) => (element as SVGSVGElement).blur());
  await chart(page).focus();
  await expect(time(page)).toHaveAttribute("datetime", stamp(599));
  await page.evaluate(() => window.outputFixture.update({ offset: 1 }));
  await expect(time(page)).toHaveAttribute("datetime", stamp(599));
  await page.evaluate(() => window.outputFixture.connection("reconnecting"));
  await chart(page).evaluate((element) => (element as SVGSVGElement).blur());
  await chart(page).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await page.evaluate(() => window.outputFixture.connection("connected"));
  await expect(time(page)).toHaveAttribute("datetime", stamp(600));
  await page.evaluate(() => window.outputFixture.update({ offset: 0 }));
  await page.keyboard.press("Home");
  await expect(native(page)).toContainText("Before collection started");
  await page.keyboard.press("ArrowRight");
  await expect(time(page)).toHaveAttribute("datetime", stamp(1));
  await expect(native(page)).toContainText("0 est. tokens/s");
  await expect(native(page)).not.toContainText("Before collection started");
  await page.evaluate(() => window.outputFixture.update({ zero: true }));
  await expect(page.getByLabel("Current rate")).toHaveText("0est. tokens/s");
  await expect(page.locator("[data-output-axes]")).toContainText("20");
});

for (const width of [283, 403, 960, 1920])
  test(`literal native geometry at chart width ${width}`, async ({ page }) => {
    await page.setViewportSize({ width: Math.max(width + 100, 1280), height: 900 });
    await start(page);
    await page.locator("main > div").evaluate((element) => {
      (element as HTMLElement).style.maxWidth = "none";
    });
    await page.locator(".live-output-rate-surface").evaluate((element, value) => {
      (element as HTMLElement).style.width = `${value}px`;
    }, width);
    await expect.poll(async () => (await chart(page).boundingBox())!.width).toBe(width);
    await expect(chart(page)).toHaveAttribute("viewBox", `0 0 ${width} 240`);
    await pointer(page, 599 / 4);
    await expect(time(page)).toHaveAttribute("datetime", stamp(150));
    const marker = chart(page).locator('circle[r="4"]');
    expect(Number(await marker.getAttribute("cx"))).toBeCloseTo((width * 150) / 599, 2);
    expect(Number(await marker.getAttribute("cy"))).toBe(110);
    const facts = await lineFacts(chart(page));
    expect(facts.points).toHaveLength(600);
    expect(facts.points[0]?.[0]).toBe(0);
    expect(facts.points[599]?.[0]).toBe(width);
    await pointer(page, 0);
    await expect(time(page)).toHaveAttribute("datetime", stamp(0));
    await pointer(page, 599);
    await expect(time(page)).toHaveAttribute("datetime", stamp(599));
  });

for (const width of [360, 375, 480, 1280])
  for (const theme of ["light", "dark"])
    for (const mode of ["popover", "fallback"]) {
      test(`viewport axes and scoped tooltip ${width} ${theme} ${mode}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 812 });
        if (mode === "fallback")
          await page.addInitScript(() =>
            Object.defineProperty(HTMLElement.prototype, "showPopover", { value: undefined }),
          );
        await start(page);
        await page.evaluate(
          (dark) => document.documentElement.classList.toggle("dark", dark),
          theme === "dark",
        );
        await page.evaluate(() => {
          const main = document.querySelector("main")!;
          const shell = document.createElement("div");
          shell.id = "scrolling-shell";
          shell.style.cssText = "position:fixed;inset:0;overflow:auto;transform:translateZ(0)";
          const spacer = document.createElement("div");
          spacer.style.height = "900px";
          document.body.append(shell);
          shell.append(spacer, main);
          shell.scrollTop =
            document.querySelector(".live-output-rate-surface")!.getBoundingClientRect().top - 500;
        });
        await page.locator(".live-output-rate-surface").evaluate((element) => {
          element.parentElement!.style.overflow = "hidden";
        });
        expect(
          await page
            .locator("#scrolling-shell")
            .evaluate((element) => element.scrollWidth <= element.clientWidth),
        ).toBe(true);
        await chart(page).focus();
        await page.keyboard.press("Home");
        await expect(time(page)).toHaveAttribute("datetime", stamp(0));
        await expect(native(page)).toHaveAttribute("role", "status");
        await expect(native(page)).toHaveAttribute("aria-live", "polite");
        await expect(native(page)).toHaveAttribute("data-ts-chart-tooltip-portal", mode);
        await expect(native(page).locator('[data-bb-plugin="live-output"]')).toBeVisible();
        expect(
          await native(page).evaluate(
            (element, portalMode) =>
              portalMode === "popover"
                ? element.matches(":popover-open")
                : element.parentElement === document.body,
            mode,
          ),
        ).toBe(true);
        await expect(chart(page).locator("desc")).toContainText("Left/Right");
        const accessibility = await page.context().newCDPSession(page);
        try {
          const tree = await accessibility.send("Accessibility.getFullAXTree");
          expect(
            tree.nodes.find(
              (node) =>
                node.role?.value === "image" &&
                String(node.name?.value).startsWith("Observed output"),
            )?.description?.value,
          ).toContain("Left/Right");
          expect(
            tree.nodes.some(
              (node) =>
                node.role?.value === "status" &&
                String(node.name?.value).includes("Before collection started"),
            ),
          ).toBe(true);
        } finally {
          await accessibility.detach();
        }
        await withinViewport(page);
        const axes = await page.locator("[data-output-axes]").evaluate((element) => ({
          font: getComputedStyle(element).fontSize,
          bounds: element.getBoundingClientRect().toJSON(),
          labels: Array.from(element.querySelectorAll("span"), (span) => {
            const range = document.createRange();
            range.selectNodeContents(span);
            return {
              text: span.textContent,
              box: span.getBoundingClientRect().toJSON(),
              font: getComputedStyle(span).fontSize,
              lineHeights: Array.from(range.getClientRects(), (line) => line.height),
            };
          }),
        }));
        expect(axes.font).toBe("14px");
        expect(axes.labels.map((label) => label.text)).toEqual([
          "0",
          "10",
          "20",
          "10 minutes ago",
          "Last complete second",
        ]);
        expect(axes.labels.every((label) => label.font === "14px")).toBe(true);
        for (const label of axes.labels) {
          expect(label.lineHeights.length).toBeGreaterThan(0);
          for (const height of label.lineHeights) expect(height).toBeGreaterThanOrEqual(14);
        }
        expect(axes.labels[3]!.box.right).toBeLessThanOrEqual(axes.labels[4]!.box.left);
        expect(
          axes.labels.every(
            (label) => label.box.left >= axes.bounds.left && label.box.right <= axes.bounds.right,
          ),
        ).toBe(true);
        const style = await native(page)
          .locator(".live-output-rate-readout")
          .evaluate((element) => {
            const css = getComputedStyle(element);
            return {
              background: css.backgroundColor,
              foreground: css.color,
              pointerEvents: css.pointerEvents,
              fontSize: css.fontSize,
              opacity: css.opacity,
            };
          });
        expect(style).toEqual({
          background: theme === "dark" ? "rgb(38, 38, 38)" : "rgb(255, 255, 255)",
          foreground: theme === "dark" ? "rgb(250, 250, 250)" : "rgb(23, 23, 23)",
          pointerEvents: "none",
          fontSize: "12px",
          opacity: "1",
        });
        expect(contrast(style.foreground, style.background)).toBeGreaterThanOrEqual(4.5);
        const secondary = await native(page)
          .locator("time")
          .evaluate((element) => getComputedStyle(element).color);
        expect(contrast(secondary, style.background)).toBeGreaterThanOrEqual(4.5);
        const axisColor = await page
          .locator("[data-output-axes]")
          .evaluate((element) => getComputedStyle(element).color);
        expect(
          contrast(axisColor, theme === "dark" ? "rgb(23, 23, 23)" : "rgb(255, 255, 255)"),
        ).toBeGreaterThanOrEqual(4.5);
        await info.attach("axes-and-theme", {
          body: JSON.stringify({ axes, style }),
          contentType: "application/json",
        });
        await page.screenshot({ path: info.outputPath("axes-tooltip.png") });
        await page.evaluate(() => {
          document.getElementById("scrolling-shell")!.scrollTop -= 30;
        });
        await withinViewport(page);
        await page.keyboard.press("End");
        await withinViewport(page);
        await page.locator(".live-output-rate-surface").evaluate((element) => {
          (element as HTMLElement).style.width = "200px";
        });
        await expect.poll(async () => (await chart(page).boundingBox())!.width).toBe(200);
        await expect(chart(page)).toHaveAttribute("viewBox", "0 0 200 240");
        expect(Number(await chart(page).locator('circle[r="4"]').getAttribute("cx"))).toBe(200);
        await withinViewport(page);
        await page.keyboard.press("Home");
        await withinViewport(page);
        const box = (await chart(page).boundingBox())!;
        await chart(page).evaluate((element) => (element as SVGSVGElement).blur());
        await page.touchscreen.tap(box.x + box.width / 4, box.y + 110);
        await expect(time(page)).toHaveAttribute("datetime", stamp(150));
        await withinViewport(page);
        const session = await page.context().newCDPSession(page);
        try {
          await session.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: box.x + 50, y: box.y + 110 }],
          });
          await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: box.x + 60, y: box.y + 100 }],
          });
          await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
        } finally {
          await session.detach();
        }
        await expect(native(page)).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(native(page)).toHaveCount(0);
      });
    }

test("document listener and native observer lifetimes survive same-task leave/Escape and teardown", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const keys = new Set<EventListenerOrEventListenerObject>();
    const observers = new Set<ResizeObserver>();
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    document.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (
        type === "keydown" &&
        (options === true || (typeof options === "object" && options.capture))
      )
        keys.add(listener);
      add(type, listener, options);
    }) as typeof document.addEventListener;
    document.removeEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      if (type === "keydown") keys.delete(listener);
      remove(type, listener, options);
    }) as typeof document.removeEventListener;
    const NativeObserver = ResizeObserver;
    window.ResizeObserver = class extends NativeObserver {
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        observers.add(this);
      }
      disconnect() {
        observers.delete(this);
        super.disconnect();
      }
    };
    window.outputResources = () => ({ keys: keys.size, observers: observers.size });
  });
  await start(page);
  expect(await page.evaluate(() => window.outputResources().keys)).toBe(0);
  await chart(page).focus();
  await pointer(page, 300);
  expect(await page.evaluate(() => window.outputResources().keys)).toBe(1);
  await page.evaluate(() => {
    document
      .querySelector(".live-output-rate-surface")!
      .dispatchEvent(new MouseEvent("mouseleave"));
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await expect(native(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.outputResources().keys)).toBe(0);
  await page.evaluate(() => window.outputFixture.update({ offset: 1 }));
  await expect(native(page)).toHaveCount(0);
  await page.keyboard.press("ArrowLeft");
  await expect(time(page)).toHaveAttribute("datetime", stamp(599));
  await page.evaluate(() => window.outputFixture.connection("reconnecting"));
  expect(await page.evaluate(() => window.outputResources().keys)).toBe(0);
  await page.evaluate(() => window.outputFixture.connection("connected"));
  await expect(time(page)).toHaveAttribute("datetime", stamp(599));
  expect(await page.evaluate(() => window.outputResources().keys)).toBe(1);
  await page.evaluate(() => window.outputFixture.update({ offset: 601 }));
  expect(await page.evaluate(() => window.outputResources().keys)).toBe(0);
  await page.evaluate(() => window.outputFixture.unmount("all"));
  expect(await page.evaluate(() => window.outputResources())).toEqual({ keys: 0, observers: 0 });
});

for (const mode of ["popover", "fallback"])
  test(`long localized timestamp remains bounded in ${mode}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 812 });
    if (mode === "fallback")
      await page.addInitScript(() =>
        Object.defineProperty(HTMLElement.prototype, "showPopover", { value: undefined }),
      );
    await page.addInitScript(() => {
      const format = Date.prototype.toLocaleString;
      Date.prototype.toLocaleString = function (
        locales?: Intl.LocalesArgument,
        options?: Intl.DateTimeFormatOptions,
      ) {
        return format.call(this, locales, {
          ...options,
          weekday: "long",
          month: "long",
          year: "numeric",
          timeZoneName: "long",
        });
      };
    });
    await start(page, "?waiting");
    await chart(page).focus();
    await page.evaluate(() => window.outputFixture.update({ offset: 253402299201 }));
    await expect(time(page)).toHaveAttribute("datetime", stamp(253402299800));
    expect((await time(page).textContent())!.length).toBeGreaterThan(40);
    await expect(time(page)).toContainText("9999");
    await page.locator(".live-output-rate-surface").evaluate((element) => {
      (element as HTMLElement).style.width = "200px";
    });
    await expect.poll(async () => (await chart(page).boundingBox())!.width).toBe(200);
    await expect(chart(page)).toHaveAttribute("viewBox", "0 0 200 240");
    await withinViewport(page);
    await page.screenshot({ path: info.outputPath("long-date.png") });
    await page.evaluate(() => window.outputFixture.update({ offset: 253402299202 }));
    await expect(time(page)).toHaveAttribute("datetime", stamp(253402299800));
  });

declare global {
  interface Window {
    keyboardEvidence: { key: string; prevented: boolean }[];
    outputResources: () => { keys: number; observers: number };
  }
}
