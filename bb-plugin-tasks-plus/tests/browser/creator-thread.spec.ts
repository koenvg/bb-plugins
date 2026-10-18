import { test, expect } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`creator metadata and todo refusal at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/creator-thread.html");
    await expect(page.getByRole("textbox", { name: "Task title" })).toContainText(
      "Creator-thread follow-up",
    );
    const creator = page
      .getByRole("button", { name: "thr_creator", exact: true })
      .filter({ visible: true });
    await expect(creator).toBeVisible();
    await expect(
      page.getByText("Blocked until this thread is archived.").filter({ visible: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Backlog", exact: true })
      .filter({ visible: true })
      .click();
    await page.getByRole("menuitem", { name: "Todo", exact: true }).click();
    await expect(
      page
        .getByText(
          "Cannot move task to todo: creator thread thr_creator is unarchived or unavailable",
        )
        .first(),
    ).toBeVisible();
    await expect(page.getByLabel("Stored task status")).toHaveText("backlog");
    await expect(page.getByRole("menuitem", { name: "Todo", exact: true })).toBeHidden();
    await page.screenshot({ path: test.info().outputPath("refusal.png"), fullPage: true });
    await page.getByRole("button", { name: "Archive creator", exact: true }).click();
    await expect(
      page.getByText("Blocked until this thread is archived.").filter({ visible: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Retry save", exact: true }).click();
    await expect(page.getByLabel("Stored task status")).toHaveText("todo");
    await page.getByRole("button", { name: "Unarchive creator", exact: true }).click();
    await expect(
      page.getByText("Blocked until this thread is archived.").filter({ visible: true }),
    ).toBeVisible();
    await expect(creator).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("board drag refusal names the creator and a keyboard retry succeeds after archive", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/tests/creator-thread.html?board");
  const card = page.getByRole("button", { name: "Open CRT-1: Creator-thread follow-up" });
  await expect(card).toBeVisible();
  const from = (await card.boundingBox())!;
  const to = (await page.locator('[data-board-column="todo"]').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 20, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole("alert")).toContainText("thr_creator");
  await expect(page.getByLabel("Stored task status")).toHaveText("backlog");
  await expect(
    page
      .locator('[data-board-column="backlog"]')
      .getByRole("button", { name: "Open CRT-1: Creator-thread follow-up" }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("board-refusal.png"), fullPage: true });
  await page.getByRole("button", { name: "Archive creator", exact: true }).click();
  await card.focus();
  await page.keyboard.press("s");
  await page.getByRole("menuitem", { name: "Todo", exact: true }).click();
  await expect(page.getByLabel("Stored task status")).toHaveText("todo");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page
      .locator('[data-board-column="todo"]')
      .getByRole("button", { name: "Open CRT-1: Creator-thread follow-up" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
