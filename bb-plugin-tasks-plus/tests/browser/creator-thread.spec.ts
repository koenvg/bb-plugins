import { test, expect } from "@playwright/test";

test("creator attribution is visible and opens its saved ID on touch", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    await page.goto("/tests/creator-thread.html");
    const attribution = page.getByRole("region", { name: "Creation attribution" });
    await expect(attribution.getByText("Creator review thread", { exact: true })).toBeVisible();
    await expect(attribution.getByText("thr_creator", { exact: true })).toBeVisible();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await attribution
      .getByRole("button", { name: "Open creator thread thr_creator: Creator review thread" })
      .tap();
    await expect(page.getByLabel("Host navigation")).toHaveText(
      '[{"method":"toThread","threadId":"thr_creator"}]',
    );
    await expect(page.getByLabel("Stored task status")).toHaveText("backlog");
    await page.screenshot({
      path: test.info().outputPath("creator-attribution-touch.png"),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});

for (const width of [1280, 390]) {
  test(`creator relations and todo refusal at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/creator-thread.html");
    await expect(page.getByRole("textbox", { name: "Task title" })).toContainText(
      "Creator-thread follow-up",
    );
    const blocked = page.getByRole("region", { name: "Blocked by" });
    const attribution = page.getByRole("region", { name: "Creation attribution" });
    const creator = attribution.getByRole("button", {
      name: "Open creator thread thr_creator: Creator review thread",
    });
    await expect(blocked.getByText("Creator review thread", { exact: true })).toBeVisible();
    await expect(attribution.getByText("Not archived", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Creator thread information" })).toHaveCount(0);
    await creator.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Host navigation")).toHaveText(
      '[{"method":"toThread","threadId":"thr_creator"}]',
    );
    await expect(creator).toBeFocused();
    await page.screenshot({
      path: test.info().outputPath("creator-relations.png"),
      fullPage: true,
    });
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
    await expect(blocked.getByText("No open blockers.", { exact: true })).toBeVisible();
    await expect(blocked.getByRole("button", { name: /Open creator thread/ })).toHaveCount(0);
    await expect(attribution.getByText("Archived", { exact: true })).toBeVisible();
    await expect(attribution.getByText("Not an open blocker", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Retry save", exact: true }).click();
    await expect(page.getByLabel("Stored task status")).toHaveText("todo");
    await page.getByRole("button", { name: "Unarchive creator", exact: true }).click();
    await expect(
      blocked.getByRole("button", { name: /Open creator thread thr_creator/ }),
    ).toBeVisible();
    await expect(attribution.getByText("Not archived", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test(`full creator identifiers and repeated long titles wrap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/creator-thread.html?long");
    const id = `thr_creator_${"full_saved_identifier_".repeat(5)}`;
    const title =
      "Release readiness review for the shared workspace permissions migration and rollback checks across existing environments "
        .repeat(3)
        .trim();
    for (const name of ["Blocked by", "Creation attribution"]) {
      const region = page.getByRole("region", { name });
      await expect(region.getByText(id, { exact: true })).toBeVisible();
      await expect(region.getByText(title, { exact: true })).toBeVisible();
      const relation = region.getByRole("button", {
        name: `Open creator thread ${id}: ${title}`,
        exact: true,
      });
      await relation.focus();
      await page.keyboard.press("Enter");
      expect(await relation.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      expect(await region.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
    }
    await expect(page.getByLabel("Host navigation")).toHaveText(
      JSON.stringify([
        { method: "toThread", threadId: id },
        { method: "toThread", threadId: id },
      ]),
    );
    await page.screenshot({
      path: test.info().outputPath("creator-long-identities.png"),
      fullPage: true,
    });
  });
}

test("unavailable creator metadata retains identity without claiming archival", async ({
  page,
}) => {
  await page.goto("/tests/creator-thread.html?unavailable");
  const blocked = page.getByRole("region", { name: "Blocked by" });
  const attribution = page.getByRole("region", { name: "Creation attribution" });
  await expect(
    blocked.getByText("Unavailable. Archive state unknown.", { exact: true }),
  ).toBeVisible();
  await attribution
    .getByRole("button", { name: "Open creator thread thr_creator", exact: true })
    .click();
  await expect(page.getByLabel("Host navigation")).toHaveText(
    '[{"method":"toThread","threadId":"thr_creator"}]',
  );
  await page.getByRole("button", { name: "Archive creator", exact: true }).click();
  await expect(blocked.getByText("No open blockers.", { exact: true })).toBeVisible();
  await expect(attribution.getByText("thr_creator", { exact: true })).toBeVisible();
  await expect(
    attribution.getByText("Unavailable. Archive state unknown.", { exact: true }),
  ).toBeVisible();
  await expect(attribution.getByText("Archived", { exact: true })).toHaveCount(0);
  await expect(attribution.getByRole("button", { name: /Remove|Detach|Unlink/ })).toHaveCount(0);
});

test("creator uses a nonblank fallback title", async ({ page }) => {
  await page.goto("/tests/creator-thread.html?fallback");
  const attribution = page.getByRole("region", { name: "Creation attribution" });
  await expect(attribution.getByText("Creator fallback title", { exact: true })).toBeVisible();
  await expect(attribution.getByText("thr_creator", { exact: true })).toBeVisible();
});

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

for (const relations of ["task-only", "mixed"]) {
  for (const width of [1280, 390]) {
    test(`typed task relations ${relations} at ${width}px`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/tests/creator-thread.html?board&relations=${relations}`);
      const card =
        width === 1280
          ? page.getByRole("button", { name: "Open CRT-1: Creator-thread follow-up" })
          : page.locator('[data-task-key="CRT-1"]');
      await expect(
        card.getByText(
          relations === "mixed" ? "Blocked by 1 task + 1 thread" : "Blocked by 1 task",
          { exact: true },
        ),
      ).toBeVisible();
      await page.screenshot({ path: test.info().outputPath("typed-counts.png"), fullPage: true });
      if (relations === "mixed" && width === 1280) {
        const badge = card.getByText("Blocked by 1 task + 1 thread", { exact: true });
        const geometry = await badge.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const cardRect = element.closest("[data-task-key]")!.getBoundingClientRect();
          return {
            badgeWidth: element.clientWidth,
            badgeScrollWidth: element.scrollWidth,
            badgeLeft: rect.left,
            badgeRight: rect.right,
            badgeTop: rect.top,
            badgeBottom: rect.bottom,
            cardLeft: cardRect.left,
            cardRight: cardRect.right,
            cardTop: cardRect.top,
            cardBottom: cardRect.bottom,
          };
        });
        await test.info().attach("mixed-board-badge-geometry", {
          body: JSON.stringify(geometry, null, 2),
          contentType: "application/json",
        });
        console.log(`Mixed board badge ${width}px ${JSON.stringify(geometry)}`);
        expect
          .soft(geometry.badgeScrollWidth, "badge must not overflow")
          .toBeLessThanOrEqual(geometry.badgeWidth);
        expect
          .soft(geometry.badgeLeft, "badge stays inside card left")
          .toBeGreaterThanOrEqual(geometry.cardLeft);
        expect
          .soft(geometry.badgeRight, "badge stays inside card right")
          .toBeLessThanOrEqual(geometry.cardRight);
        expect
          .soft(geometry.badgeTop, "badge stays inside card top")
          .toBeGreaterThanOrEqual(geometry.cardTop);
        expect
          .soft(geometry.badgeBottom, "badge stays inside card bottom")
          .toBeLessThanOrEqual(geometry.cardBottom);
      }

      await page.goto(`/tests/creator-thread.html?relations=${relations}`);
      await expect(page.getByRole("textbox", { name: "Task title" })).toHaveText(
        "Creator-thread follow-up",
      );
      const blocked = page.getByRole("region", { name: "Blocked by", exact: true });
      const openTask = blocked.getByRole("button", {
        name: "Open task CRT-2: Approve workspace access",
        exact: true,
      });
      const resolvedTask = blocked.getByRole("button", {
        name: "Open task CRT-3: Confirm rollback coverage",
        exact: true,
      });
      await expect(openTask).toBeVisible();
      await expect(
        blocked.getByRole("heading", { name: "Resolved · 1 · not included in open blockers" }),
      ).toBeVisible();
      await expect(resolvedTask).toBeVisible();
      await expect(resolvedTask.getByText("Not an open blocker", { exact: true })).toBeVisible();
      await expect(blocked.getByRole("button", { name: /^Remove / })).toHaveCount(2);
      const attribution = page.getByRole("region", { name: "Creation attribution" });
      const creator = blocked.getByRole("button", {
        name: "Open creator thread thr_creator: Creator review thread",
        exact: true,
      });
      if (relations === "mixed") {
        await expect(creator).toBeVisible();
        await expect(attribution.getByText("Creator review thread", { exact: true })).toBeVisible();
        await expect(attribution.getByRole("button", { name: /Remove|Detach|Unlink/ })).toHaveCount(
          0,
        );
        await expect(
          blocked.getByRole("button", { name: /(?:Remove|Detach|Unlink).*thr_creator/ }),
        ).toHaveCount(0);
      } else {
        await expect(creator).toHaveCount(0);
        await expect(attribution).toHaveCount(0);
      }
      await page.screenshot({ path: test.info().outputPath("task-relations.png"), fullPage: true });
      await openTask.click();
      await expect(page.getByLabel("Host navigation")).toHaveText(
        '[{"method":"toPluginPanel","path":"tasks","options":{"subPath":"task/CRT-2"}}]',
      );
      await resolvedTask.focus();
      await page.keyboard.press("Enter");
      const navigation = [
        { method: "toPluginPanel", path: "tasks", options: { subPath: "task/CRT-2" } },
        { method: "toPluginPanel", path: "tasks", options: { subPath: "task/CRT-3" } },
      ];
      await expect(page.getByLabel("Host navigation")).toHaveText(JSON.stringify(navigation));
      if (relations === "mixed") {
        await creator.click();
        await expect(page.getByLabel("Host navigation")).toHaveText(
          JSON.stringify([...navigation, { method: "toThread", threadId: "thr_creator" }]),
        );
        await page.getByRole("button", { name: "Archive creator", exact: true }).click();
        await expect(creator).toHaveCount(0);
        await expect(openTask).toBeVisible();
        await expect(resolvedTask).toBeVisible();
        await expect(attribution.getByText("Archived", { exact: true })).toBeVisible();
        await expect(attribution.getByText("Not an open blocker", { exact: true })).toBeVisible();
        const child = page.getByRole("button").filter({
          has: page.getByText("Verify workspace permissions before release", { exact: true }),
        });
        await expect(child.getByText("Blocked by 1 task", { exact: true })).toBeVisible();
        await expect(child.getByText("Blocks 1 task", { exact: true })).toBeVisible();
        await page.screenshot({
          path: test.info().outputPath("archived-mixed-relations.png"),
          fullPage: true,
        });
      }
      expect(errors).toEqual([]);
    });
  }
}

for (const width of [320, 390, 1280]) {
  test(`mixed subtask remains readable without horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/creator-thread.html?relations=mixed");
    const title = page.getByText("Verify workspace permissions before release", { exact: true });
    const row = page.getByRole("button").filter({ has: title });
    await expect(row).toBeVisible();
    await expect(row.getByText("CRT-4", { exact: true })).toBeVisible();
    await expect(row.getByText("Blocked by 1 task + 1 thread", { exact: true })).toBeVisible();
    await expect(row.getByText("Blocks 1 task", { exact: true })).toBeVisible();
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("mixed-subtask.png"), fullPage: true });
    const geometry = await row.evaluate((element) => {
      const title = [...element.querySelectorAll("span")].find(
        (entry) => entry.textContent === "Verify workspace permissions before release",
      )!;
      const rect = element.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      return {
        rowWidth: element.clientWidth,
        rowScrollWidth: element.scrollWidth,
        rowLeft: rect.left,
        rowRight: rect.right,
        titleWidth: titleRect.width,
        titleHeight: titleRect.height,
        pageWidth: document.documentElement.clientWidth,
        pageScrollWidth: document.documentElement.scrollWidth,
      };
    });
    await test.info().attach("mixed-subtask-geometry", {
      body: JSON.stringify(geometry, null, 2),
      contentType: "application/json",
    });
    console.log(`Mixed subtask ${width}px ${JSON.stringify(geometry)}`);
    expect.soft(geometry.titleWidth, "readable subtask title width").toBeGreaterThanOrEqual(80);
    expect.soft(geometry.titleHeight, "nonzero subtask title height").toBeGreaterThan(0);
    expect
      .soft(geometry.rowScrollWidth, "subtask row must not overflow")
      .toBeLessThanOrEqual(geometry.rowWidth);
    expect
      .soft(geometry.pageScrollWidth, "page must not overflow")
      .toBeLessThanOrEqual(geometry.pageWidth);
    expect.soft(geometry.rowRight, "row stays in viewport").toBeLessThanOrEqual(width);
    expect.soft(geometry.rowLeft, "row starts in viewport").toBeGreaterThanOrEqual(0);
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Host navigation")).toHaveText(
      '[{"method":"toPluginPanel","path":"tasks","options":{"subPath":"task/CRT-4"}}]',
    );
    expect(errors).toEqual([]);
  });
}
