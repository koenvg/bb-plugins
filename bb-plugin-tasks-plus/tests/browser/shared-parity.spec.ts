import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { measureDocument } from "../../../packages/markdown-document/test/parity";

for (const width of [390, 960])
  for (const theme of ["light", "dark"]) {
    test(`shared parity attachment ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const external: string[] = [];
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === "http://127.0.0.1:4193") await route.continue();
        else {
          external.push(url.href);
          await route.abort();
        }
      });
      await page.goto(`/tests/preview.html?parity&theme=${theme}`);
      const trigger = page.getByRole("button", { name: /^investigation-with-a-long-filename/ });
      const sentinel = await page.locator(".fixture-task > h1").evaluate((node) => ({
        font: getComputedStyle(node).fontSize,
        margin: getComputedStyle(node).marginBlock,
      }));
      await page.getByLabel("Task draft").fill("Preserved parity draft");
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("heading", { name: "Shared technical report", exact: true }),
      ).toBeVisible();
      const snapshot = await page.evaluate(measureDocument);
      expect(snapshot.width).toBe(width === 390 ? 300 : 640);
      expect(snapshot.headings).toEqual([
        ["H1", "Shared technical report"],
        ["H2", "日本語 findings"],
        ["H2", "日本語 findings"],
        ["H3", "Detail"],
      ]);
      expect(snapshot.overflow).toEqual({ page: false, code: true, table: "auto" });
      await expect(dialog.locator(".mr-prose img")).toHaveCount(0);
      await expect(
        dialog.getByRole("link", { name: "Local heading", exact: true }),
      ).toHaveAttribute("href", /^#/);
      await expect(
        dialog.getByRole("link", { name: "External reference", exact: true }),
      ).toHaveAttribute("href", "https://example.org/report");
      expect(
        await dialog.getByText("Relative note", { exact: true }).evaluate((node) => node.tagName),
      ).toBe("SPAN");
      await expect(dialog.getByText("Relative note", { exact: true })).toBeVisible();
      await expect(dialog.getByText("Relative chart", { exact: true })).toBeVisible();
      const ids = await dialog
        .locator(".mr-prose [id]")
        .evaluateAll((nodes) => nodes.map((node) => node.id));
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((id) => !id.includes("fixture-task"))).toBe(true);
      await dialog.getByRole("button", { name: "Raw", exact: true }).click();
      const raw = await dialog.getByLabel("Raw Markdown").textContent();
      if (process.env.BBP57_PARITY_DIR) {
        const reader = JSON.parse(
          await readFile(`${process.env.BBP57_PARITY_DIR}/reader-${width}-${theme}.json`, "utf8"),
        );
        expect({ ...snapshot, raw }).toEqual(reader);
      }
      await dialog.getByRole("button", { name: "Preview", exact: true }).click();
      const afterTheme = await page.evaluate(() => {
        document.documentElement.dataset.theme =
          document.documentElement.dataset.theme === "light" ? "dark" : "light";
        const prose = document.querySelector<HTMLElement>(".mr-prose")!;
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
        return {
          color: getComputedStyle(prose).color,
          background: getComputedStyle(dialog).backgroundColor,
          content: prose.textContent,
          controls: Array.from(
            dialog.querySelectorAll(
              ".attachment-preview-toolbar button, .attachment-preview-toolbar a",
            ),
            (node) => ({
              color: getComputedStyle(node).color,
              background: getComputedStyle(node).backgroundColor,
            }),
          ),
          ids: Array.from(prose.querySelectorAll("[id]"), (node) => node.id),
        };
      });
      expect(afterTheme.color).toBe(theme === "light" ? "rgb(238, 238, 238)" : "rgb(40, 40, 40)");
      expect(afterTheme.background).toBe(
        theme === "light" ? "rgb(32, 32, 32)" : "rgb(255, 255, 255)",
      );
      expect(afterTheme.controls.map((control) => control.color)).toEqual(
        Array(4).fill(afterTheme.color),
      );
      for (const control of afterTheme.controls.slice(-2))
        expect(["rgba(0, 0, 0, 0)", afterTheme.background]).toContain(control.background);
      expect(afterTheme.content).toBe(snapshot.content);
      expect(afterTheme.ids).toEqual(ids);
      await info.attach("live-theme", {
        body: JSON.stringify(afterTheme, null, 2),
        contentType: "application/json",
      });
      await expect(
        dialog.getByRole("heading", { name: "Shared technical report", exact: true }),
      ).toBeVisible();
      expect(await page.locator("html").getAttribute("data-reads")).toBe("1");
      await info.attach("parity", {
        body: JSON.stringify({ ...snapshot, raw }, null, 2),
        contentType: "application/json",
      });
      await page.screenshot({ path: info.outputPath("attachment-parity.png") });
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await expect(page.getByLabel("Task draft")).toHaveValue("Preserved parity draft");
      expect(
        await page.locator(".fixture-task > h1").evaluate((node) => ({
          font: getComputedStyle(node).fontSize,
          margin: getComputedStyle(node).marginBlock,
        })),
      ).toEqual(sentinel);
      expect(external).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

test("newline-dense attachment Raw stays exact with one text node", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/tests/preview.html?state=dense-raw");
  const trigger = page.getByRole("button", { name: /^investigation-with-a-long-filename/ });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Raw", exact: true }).click();
  const raw = dialog.getByLabel("Raw Markdown");
  await raw.waitFor();
  expect(await raw.textContent()).toBe("\n".repeat(30_000));
  expect(await raw.evaluate((node) => node.childNodes.length)).toBe(1);
  expect(await raw.locator("[data-source-line]").count()).toBe(0);
  expect(await page.locator("html").getAttribute("data-reads")).toBe("1");
  await info.attach("raw-node-count", {
    body: JSON.stringify({ sourceBytes: 30_000, textNodes: 1, lineAnnotations: 0 }),
    contentType: "application/json",
  });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
