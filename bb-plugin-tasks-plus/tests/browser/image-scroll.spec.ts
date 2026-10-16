import { test, expect } from "@playwright/test";
import { crc32, deflateSync } from "node:zlib";

const chunk = (kind: string, data: Buffer) => {
  const bytes = Buffer.concat([Buffer.from(kind), data]);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(bytes));
  return Buffer.concat([length, bytes, checksum]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(1200, 0);
header.writeUInt32BE(2400, 4);
header[8] = 8;
header[9] = 2;
const pixels = Buffer.alloc(2400 * (1 + 1200 * 3));
for (let y = 0; y < 2400; y++) {
  for (let x = 0; x < 1200; x++) {
    const offset = y * (1 + 1200 * 3) + 1 + x * 3;
    pixels.set(y < 2300 ? [96, 132, 152] : [180, 132, 96], offset);
  }
}
const png = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(pixels)),
  chunk("IEND", Buffer.alloc(0)),
]);

for (const width of [1280, 390]) {
  test(`tall image scroll stays inside attachment at ${width}px`, async ({ page }, info) => {
    await page.route("http://localhost:4193/tests/assets/image.png", (route) =>
      route.fulfill({
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
        body: png,
      }),
    );
    await page.setViewportSize({ width, height: 500 });
    await page.goto("/tests/preview.html?state=navigation");
    await page.getByLabel("Task draft").fill("Keep the task draft while scrolling an image");
    const attachment = page.getByRole("button", {
      name: "investigation-with-a-long-filename-and-important-observations.MARKDOWN",
      exact: true,
    });
    await attachment.click();
    const outer = page.getByRole("dialog", {
      name: "investigation-with-a-long-filename-and-important-observations.MARKDOWN",
      exact: true,
    });
    const trigger = outer.getByRole("button", { name: "Enlarge image: Remote chart", exact: true });
    await expect(trigger).toBeEnabled();
    await trigger.scrollIntoViewIfNeeded();
    const inlineBounds = await trigger.getByRole("img").boundingBox();
    const background = () =>
      page.evaluate(() => ({
        window: scrollY,
        attachment: document.querySelector(".attachment-preview-body")!.scrollTop,
      }));
    const before = await background();
    await page.screenshot({ path: info.outputPath(`tall-image-inline-${width}.png`) });
    await trigger.click();
    const viewer = page.getByRole("dialog", { name: "Image preview: Remote chart", exact: true });
    const image = viewer.getByRole("img");
    const close = viewer.getByRole("button", { name: "Close image preview" });
    await expect(image).toHaveJSProperty("naturalWidth", 1200);
    await expect(image).toHaveJSProperty("naturalHeight", 2400);
    const bounds = await image.boundingBox();
    expect(bounds!.width).toBe(width === 1280 ? 1200 : 324);
    expect(bounds!.width).toBeLessThanOrEqual(1200);
    if (width === 1280) expect(bounds!.width).toBeGreaterThan(inlineBounds!.width);
    expect(bounds!.height / bounds!.width).toBeCloseTo(2, 2);
    const viewerBounds = await viewer.boundingBox();
    expect(viewerBounds!.y).toBeGreaterThanOrEqual(0);
    expect(viewerBounds!.y + viewerBounds!.height).toBeLessThanOrEqual(500);
    const scroll = () =>
      viewer.evaluate((element) => ({
        top: element.scrollTop,
        height: element.scrollHeight,
        client: element.clientHeight,
      }));
    const scrollEnd = () =>
      page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            document
              .querySelector(".mr-image-dialog")!
              .addEventListener("scrollend", () => resolve(), {
                once: true,
              }),
          ),
      );
    const initial = await scroll();
    expect(initial.height).toBeGreaterThan(initial.client);
    expect(initial.top).toBe(0);
    await expect(close).toBeFocused();
    const closeBounds = await close.boundingBox();
    await page.screenshot({ path: info.outputPath(`tall-image-open-${width}.png`) });
    await Promise.all([scrollEnd(), page.keyboard.press("PageDown")]);
    expect((await scroll()).top).toBeGreaterThan(100);
    const afterPage = await scroll();
    await Promise.all([scrollEnd(), page.keyboard.press("PageUp")]);
    expect((await scroll()).top).toBe(0);
    await page.mouse.move(bounds!.x + bounds!.width / 2, 350);
    await Promise.all([scrollEnd(), page.mouse.wheel(0, 10000)]);
    await expect
      .poll(async () => {
        const current = await scroll();
        return current.height - current.client - current.top;
      })
      .toBeLessThanOrEqual(1);
    expect((await scroll()).top).toBeGreaterThan(100);
    const bottom = await image.boundingBox();
    expect(bottom!.y + bottom!.height).toBeLessThanOrEqual(viewerBounds!.y + viewerBounds!.height);
    expect(bottom!.y + bottom!.height).toBeGreaterThan(400);
    await expect(close).toBeInViewport({ ratio: 1 });
    expect((await close.boundingBox())!.y).toBeCloseTo(closeBounds!.y, 0);
    await page.screenshot({ path: info.outputPath(`tall-image-bottom-${width}.png`) });
    expect(await background()).toEqual(before);
    const stickyClose = (await close.boundingBox())!;
    await page.mouse.click(
      stickyClose.x + stickyClose.width / 2,
      stickyClose.y + stickyClose.height / 2,
    );
    await expect(viewer).toHaveCount(0);
    await expect(outer).toBeVisible();
    await expect(trigger).toBeFocused();
    expect(await background()).toEqual(before);
    await page.keyboard.press("Enter");
    await expect(viewer).toBeVisible();
    await page.keyboard.press("PageDown");
    await expect.poll(async () => (await scroll()).top).toBeGreaterThan(100);
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await background()).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(outer).toHaveCount(0);
    await expect(attachment).toBeFocused();
    await expect(page.getByLabel("Task draft")).toHaveValue(
      "Keep the task draft while scrolling an image",
    );
    await expect(page.getByLabel("Task shortcut count")).toHaveText("0");
    await info.attach("image-scroll", {
      contentType: "application/json",
      body: JSON.stringify({ inlineBounds, bounds, initial, afterPage, background: before }),
    });
  });
}
