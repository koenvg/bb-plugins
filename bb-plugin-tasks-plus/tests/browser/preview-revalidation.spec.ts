import { test, expect } from "@playwright/test";

for (const order of ["event-first", "reply-first"]) {
  test(`status save coalesces preview reads with ${order}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto(`/tests/task-commands.html?refreshOrder=${order}`);
    const title = page.getByRole("textbox", { name: "Task title" });
    await expect(title).toHaveText("Task 1");
    await expect(page.getByLabel("Preview reads")).toHaveText("1");
    const titleNode = await title.elementHandle();
    const editorNode = await page.locator(".tiptap").elementHandle();
    const layout = page.locator('[data-properties-layout="rail"]');
    await layout.getByRole("button", { name: "Todo", exact: true }).click();
    await page.getByRole("menuitem", { name: "In Progress", exact: true }).click();
    await expect(layout.getByRole("button", { name: "In Progress", exact: true })).toBeVisible();
    await expect(page.getByLabel("Delivered events")).toHaveText("1");
    await expect(page.getByText("Refreshing TSK-1", { exact: false })).toBeHidden();
    await expect(page.getByLabel("Preview reads")).toHaveText("2");
    expect(await titleNode!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await editorNode!.evaluate((node) => node.isConnected)).toBe(true);
    await page.getByRole("button", { name: "External task edit" }).click();
    await expect(title).toHaveText("External edit");
    await expect(page.getByLabel("Delivered events")).toHaveText("2");
    await expect(page.getByLabel("Preview reads")).toHaveText("3");
    await page.screenshot({ path: testInfo.outputPath(`${order}.png`) });
    expect(errors).toEqual([]);
  });
}
