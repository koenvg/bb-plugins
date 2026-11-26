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
  await toolbar.getByRole("button", { name: "Bold", exact: true }).click();
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
  await page.keyboard.press("Alt+0");
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveCount(0);
  await expect(toolbar).toHaveCount(0);
  expect(errors).toEqual([]);
});
