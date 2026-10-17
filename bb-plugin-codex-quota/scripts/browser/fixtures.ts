import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

export const test = base.extend<{ localOnly: void }>({
  localOnly: [
    async ({ context, page, baseURL }, use) => {
      const errors: string[] = [];
      const external: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await context.route("**/*", (route) => {
        if (new URL(route.request().url()).origin === baseURL) return route.continue();
        external.push(route.request().url());
        return route.abort();
      });
      await use();
      expect(errors, "No browser exceptions").toEqual([]);
      expect(external, "No external traffic, including official usage link").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function reportTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((theme) => {
    const root = document.documentElement.style;
    root.colorScheme = theme;
    if (theme === "light") {
      for (const [name, value] of Object.entries({
        background: "#ffffff",
        foreground: "oklch(32.11% 0 0)",
        "muted-foreground": "oklch(44% 0 0)",
        muted: "#eeeeee",
        border: "#dddddd",
        accent: "#eeeeee",
        primary: "oklch(27% 0 0)",
        ring: "oklch(27% 0 0)",
        popover: "#ffffff",
        "popover-foreground": "oklch(32.11% 0 0)",
      }))
        root.setProperty("--" + name, value);
    }
    document.body.style.backgroundColor = "var(--background)";
  }, theme);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
    theme,
  );
}
export const sizes = [1280, 375];
export async function viewport(page: Page, width: number) {
  await page.setViewportSize({ width, height: width === 375 ? 812 : 1100 });
}
export async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
export async function officialLink(page: Page) {
  const link = page.getByRole("link", { name: /Open Codex Usage/ });
  await link.focus();
  expect(await link.evaluate((e) => e === document.activeElement)).toBe(true);
  await expect(link).toHaveAttribute("href", "https://chatgpt.com/settings/usage?tab=overview");
}
export async function jsonEvidence(info: TestInfo, name: string, value: unknown) {
  const path = info.outputPath(name);
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
  await info.attach(name, { path, contentType: "application/json" });
}
export async function decodedPng(page: Page, data: Buffer) {
  const facts = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let nonSolid = false;
    for (let index = 4; index < pixels.length; index += 4) {
      if (
        pixels[index] !== pixels[0] ||
        pixels[index + 1] !== pixels[1] ||
        pixels[index + 2] !== pixels[2]
      ) {
        nonSolid = true;
        break;
      }
    }
    return { width: image.width, height: image.height, nonSolid };
  }, data.toString("base64"));
  expect(data.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(facts.width).toBeGreaterThanOrEqual(300);
  expect(facts.height).toBeGreaterThanOrEqual(200);
  expect(facts.nonSolid, "Decoded screenshot must contain visible content").toBe(true);
  return { ...facts, sha256: createHash("sha256").update(data).digest("hex") };
}
type CaptureTile = { x: number; y: number; data: string };

export async function capture(page: Page, info: TestInfo, name: string, fullPage = true) {
  await page.evaluate(() => window.scrollTo({ left: 0, top: 0, behavior: "instant" }));
  const path = info.outputPath(`${name}.png`);
  const viewport = page.viewportSize()!;
  const content = await page.evaluate(() => ({
    width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth),
    height: Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      innerHeight,
    ),
  }));
  if (fullPage)
    expect(content.width, "Full-page evidence must not clip horizontal content").toBe(
      viewport.width,
    );
  const tiled = fullPage && content.height > viewport.height;
  const tiles: CaptureTile[] = [];
  let data: Buffer;
  if (tiled) {
    try {
      for (let top = 0; ; top = Math.min(top + viewport.height, content.height - viewport.height)) {
        const position = await page.evaluate(async (top) => {
          window.scrollTo({ left: 0, top, behavior: "instant" });
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          return { x: scrollX, y: scrollY };
        }, top);
        expect(position, "Each tile must cover the requested document offset").toEqual({
          x: 0,
          y: top,
        });
        const tile = await page.screenshot({ fullPage: false, scale: "css" });
        tiles.push({ ...position, data: tile.toString("base64") });
        if (top + viewport.height >= content.height) break;
      }
      const base64 = await page.evaluate(
        async ({ tiles, width, height }) => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d")!;
          for (const tile of tiles) {
            const image = new Image();
            image.src = `data:image/png;base64,${tile.data}`;
            await image.decode();
            context.drawImage(image, tile.x, tile.y);
          }
          return canvas.toDataURL("image/png").split(",")[1];
        },
        { tiles, width: viewport.width, height: content.height },
      );
      data = Buffer.from(base64, "base64");
    } finally {
      await page.evaluate(() => window.scrollTo({ left: 0, top: 0, behavior: "instant" }));
    }
    await writeFile(path, data);
  } else {
    data = await page.screenshot({ path, fullPage: false, scale: "css" });
  }
  const coverage = {
    mode: tiled ? "viewport-tiles" : "viewport",
    document: content,
    tiles: tiled ? tiles.map(({ x, y }) => ({ x, y, ...viewport })) : [{ x: 0, y: 0, ...viewport }],
    limitations: tiled
      ? ["Scroll-composited evidence. Fixed and sticky content can repeat at tile boundaries."]
      : [],
  };
  const facts = { file: `${name}.png`, ...(await decodedPng(page, data)), coverage };
  expect(facts.width).toBe(page.viewportSize()!.width);
  await info.attach(name, { path, contentType: "image/png" });
  await jsonEvidence(info, `${name}.json`, facts);
  return facts;
}
