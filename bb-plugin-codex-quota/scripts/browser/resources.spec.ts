import { test, expect, decodedPng } from "./fixtures.js";

test("PNG receipts require full decode and non-solid pixels", async ({ page }) => {
  await page.goto("/activity.html");
  await expect(decodedPng(page, Buffer.from("not a PNG"))).rejects.toThrow();
  const encode = async (nonSolid: boolean) =>
    Buffer.from(
      await page.evaluate((changed) => {
        const canvas = document.createElement("canvas");
        canvas.width = 375;
        canvas.height = 812;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "black";
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (changed) {
          context.fillStyle = "white";
          context.fillRect(20, 20, 1, 1);
        }
        return canvas.toDataURL("image/png").split(",")[1];
      }, nonSolid),
      "base64",
    );
  await expect(decodedPng(page, await encode(false))).rejects.toThrow(/visible content/);
  const decoded = await decodedPng(page, await encode(true));
  expect(decoded).toMatchObject({ width: 375, height: 812, nonSolid: true });
  expect(decoded.sha256).toHaveLength(64);
});
