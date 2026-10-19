import { test, expect, type Page } from "@playwright/test";

test.use({ locale: "en-GB" });
async function palette(page: Page, title: string) {
  await page.keyboard.press("ControlOrMeta+Shift+P");
  const input = page.getByRole("textbox", { name: "Find command" });
  await expect(input).toBeFocused();
  await page.keyboard.type(title);
  await expect(page.getByText(`Tasks: ${title}`, { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Fixture command palette" })).toBeHidden();
}

for (const width of [1200, 650]) {
  test(`due-date command explicit choices and focus at ${width}px`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-07-15T12:00:00"));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/task-commands.html");
    await expect(page.getByRole("textbox", { name: "Task title" })).toBeVisible();
    await page.keyboard.press("Tab");
    const layout = page.locator(`[data-properties-layout="${width === 1200 ? "rail" : "inline"}"]`);
    const input = page.getByRole("dialog").getByLabel("Due date", { exact: true });
    const updates = page.getByLabel("Fixture updates");
    await palette(page, "Set due date");
    await expect(input).toHaveCount(1);
    await expect(input).toBeFocused();
    await expect(updates).toHaveText("[]");
    await page.screenshot({ path: testInfo.outputPath("Set-due-date.png") });
    await page.keyboard.press("Escape");
    await expect(input).toHaveCount(0);
    await expect(layout.getByRole("button", { name: "Set due date", exact: true })).toBeFocused();
    await expect(updates).toHaveText("[]");

    await palette(page, "Set due date");
    await expect(input).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: /^Next week/ })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: /^Tomorrow/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(updates).toHaveText(JSON.stringify([{ taskId: "task-1", dueDate: "2026-07-16" }]));
    await expect(input).toHaveCount(0);
    await expect(layout.getByRole("button", { name: "16 Jul", exact: true })).toBeFocused();

    await palette(page, "Set due date");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("2026-07-16");
    await page.keyboard.press("Alt+ArrowDown");
    await page.keyboard.press("ArrowRight");
    await expect(updates).toHaveText(
      JSON.stringify([
        { taskId: "task-1", dueDate: "2026-07-16" },
        { taskId: "task-1", dueDate: "2026-07-17" },
      ]),
    );
    await expect(input).toHaveCount(0);
    await expect(layout.getByRole("button", { name: "17 Jul", exact: true })).toBeFocused();

    await palette(page, "Set due date");
    await expect(input).toBeFocused();
    const remove = page.getByRole("button", { name: "Remove due date" });
    for (let step = 0; step < 5; step++) {
      await page.keyboard.press("Tab");
      if (await remove.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(remove).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(updates).toHaveText(
      JSON.stringify([
        { taskId: "task-1", dueDate: "2026-07-16" },
        { taskId: "task-1", dueDate: "2026-07-17" },
        { taskId: "task-1", dueDate: null },
      ]),
    );
    await expect(layout.getByRole("button", { name: "Set due date", exact: true })).toBeFocused();

    await page.keyboard.press("Alt+2");
    await expect(page.getByRole("textbox", { name: "Task title" })).toHaveText("Task 2");
    await palette(page, "Set due date");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: /^Tomorrow/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(updates).toHaveText(
      JSON.stringify([
        { taskId: "task-1", dueDate: "2026-07-16" },
        { taskId: "task-1", dueDate: "2026-07-17" },
        { taskId: "task-1", dueDate: null },
        { taskId: "task-2", dueDate: "2026-07-16" },
      ]),
    );
    await page.keyboard.press("Alt+0");
    await page.keyboard.press("ControlOrMeta+Shift+P");
    await expect(page.getByRole("textbox", { name: "Find command" })).toBeFocused();
    await expect(page.getByText("Tasks: Set due date", { exact: true })).toBeHidden();
    await page.keyboard.press("Escape");
  });
  test(`property command focus and keyboard saves at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/task-commands.html");
    await expect(page.getByRole("textbox", { name: "Task title" })).toBeVisible();
    await page.keyboard.press("Tab");
    const layout = page.locator(`[data-properties-layout="${width === 1200 ? "rail" : "inline"}"]`);
    await expect(layout).toBeVisible();
    for (const [title, triggerName, choice, expected] of [
      ["Change status", "Todo", "Done", { taskId: "task-1", status: "done" }],
      ["Set priority", "No priority", "High", { taskId: "task-1", priority: "high" }],
      ["Edit labels", "Edit labels", "frontend", { taskId: "task-1", labelIds: ["label-1"] }],
    ] as const) {
      const updatesBefore = await page.getByLabel("Fixture updates").textContent();
      await palette(page, title);
      const role = title === "Edit labels" ? "option" : "menuitem";
      await expect(page.getByRole(role, { name: choice, exact: true })).toBeVisible();
      if (role === "option") await expect(page.getByPlaceholder("Add labels…")).toBeFocused();
      else await expect(page.getByRole("menuitem").first()).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath(`${title.replaceAll(" ", "-")}.png`) });
      await page.keyboard.press("Escape");
      await expect(layout.getByRole("button", { name: triggerName, exact: true })).toBeFocused();
      await expect(page.getByLabel("Fixture updates")).toHaveText(updatesBefore!);
      await palette(page, title);
      if (role === "option") await expect(page.getByPlaceholder("Add labels…")).toBeFocused();
      else await expect(page.getByRole("menuitem").first()).toBeFocused();
      if (role === "option") await page.keyboard.press("Enter");
      else {
        for (let step = 0; step < (title === "Change status" ? 4 : 1); step++) {
          await page.keyboard.press(width === 650 ? "Tab" : "ArrowDown");
          await expect(page.getByRole("menuitem").nth(step + 1)).toBeFocused();
        }
        await expect(page.getByRole(role, { name: choice, exact: true })).toBeFocused();
        await page.keyboard.press("Enter");
      }
      await expect
        .poll(async () => JSON.parse((await page.getByLabel("Fixture updates").textContent())!))
        .toContainEqual(expected);
      if (role === "option") await page.keyboard.press("Escape");
    }
    await page.keyboard.press("Alt+2");
    await expect(page.getByRole("textbox", { name: "Task title" })).toHaveText("Task 2");
    await palette(page, "Set priority");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Alt+0");
    await page.keyboard.press("ControlOrMeta+Shift+P");
    await expect(page.getByRole("textbox", { name: "Find command" })).toBeFocused();
    await expect(page.getByText("Tasks: Set priority", { exact: true })).toBeHidden();
    await page.keyboard.press("Escape");
  });
}
