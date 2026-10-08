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
  await expect(link).toHaveAttribute("href", "https://chatgpt.com/codex/settings/usage");
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
export async function capture(page: Page, info: TestInfo, name: string, fullPage = true) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const path = info.outputPath(`${name}.png`);
  const data = await page.screenshot({ path, fullPage });
  const facts = { file: `${name}.png`, ...(await decodedPng(page, data)) };
  expect(facts.width).toBe(page.viewportSize()!.width);
  await info.attach(name, { path, contentType: "image/png" });
  await jsonEvidence(info, `${name}.json`, facts);
  return facts;
}
