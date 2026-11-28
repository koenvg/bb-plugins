import { fail as missingValue } from "node:assert/strict";
import { test, expect } from "@playwright/test";

test("selection formatting survives menu hide, reappearance and React cleanup", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204 }));
  await page.goto("/tests/task-commands.html");
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveValue("Task 1");
  const editor = page.locator(".tiptap");
  const toolbar = page.getByRole("toolbar", { name: "Formatting" });
  await editor.fill("Alpha beta");
  await editor.press("ControlOrMeta+a");
  await expect(toolbar).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("Alpha beta");
  const box =
    (await toolbar.boundingBox()) ?? missingValue("Expected (await toolbar.boundingBox())");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1200);
  const bold = toolbar.getByRole("button", { name: "Bold", exact: true });
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(editor.locator("strong")).toHaveText("Alpha beta");
  await expect(page.getByLabel("Fixture updates")).toContainText('"description":"**Alpha beta**"');
  await page.screenshot({ path: testInfo.outputPath("selection-bold.png") });

  await editor.press("ArrowRight");
  await expect(toolbar).toBeHidden();
  await editor.press("ControlOrMeta+a");
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: "Italic", exact: true }).click();
  await expect(editor.locator("strong em, em strong")).toHaveText("Alpha beta");
  await editor.press("ArrowRight");
  await expect(toolbar).toBeHidden();

  await page.keyboard.press("Alt+0");
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveCount(0);
  await expect(toolbar).toHaveCount(0);
  await page.getByRole("button", { name: "Open TSK-1: Task 1", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-accept-navigation")));
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveValue("Task 1");
  await expect(editor.locator("strong em, em strong")).toHaveText("Alpha beta");
  await editor.click();
  await editor.press("ControlOrMeta+a");
  await expect(toolbar).toBeVisible();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(toolbar.getByRole("button", { name: "Italic", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Alt+0");
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveCount(0);
  await expect(toolbar).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("an open mention follows its anchor after a remote description update", async ({ page }) => {
  await page.goto("/tests/task-commands.html?mentionRefresh");
  await page.addStyleTag({ content: ".tiptap > p:first-child { padding-block-end: 32px; }" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const editor = page.locator(".tiptap");
  await editor.getByText("@", { exact: true }).click();
  await editor.press("End");
  const menu = page.getByRole("list", { name: "Mention a task or thread" });
  const anchor = editor.locator("[data-decoration-id]");
  await expect(menu.getByRole("button", { name: "TSK-2 Task 2" })).toBeVisible();
  const originalBottom = await anchor.evaluate((node) => node.getBoundingClientRect().bottom);
  const readTop = () => menu.evaluate((node) => node.getBoundingClientRect().top);
  const originalTop = await readTop();
  const readMenuOffset = () => menu.evaluate((node) => Number.parseFloat(node.style.top));
  const originalOffset = await readMenuOffset();

  await page.evaluate(() => window.dispatchEvent(new Event("fixture-update-mention-description")));
  await expect(editor.getByRole("heading", { name: "before" })).toBeVisible();
  const anchorBottom = await anchor.evaluate((node) => node.getBoundingClientRect().bottom);
  const direction = Math.sign(anchorBottom - originalBottom);
  expect(Math.abs(anchorBottom - originalBottom)).toBeGreaterThan(4);
  await expect.poll(async () => direction * ((await readTop()) - originalTop)).toBeGreaterThan(4);
  await expect
    .poll(async () => direction * ((await readMenuOffset()) - originalOffset))
    .toBeGreaterThan(4);
  await expect(menu.getByRole("button", { name: "TSK-2 Task 2" })).toBeVisible();
});
