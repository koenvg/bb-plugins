import { test, expect, type Page } from "@playwright/test";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createStore, registerTasksApi } from "../../api";
import type { TaskStatusTransition } from "../../db";

async function setup(page: Page) {
  const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
  const db = bb.storage.database();
  const store = createStore(bb);
  registerTasksApi(bb, store);
  const project = store.tasks.createProject({
    name: "Browser history",
    prefix: "HIS",
    color: "blue",
  });
  const first = store.tasks.createTask({
    projectId: project.id,
    title: "First card",
    status: "todo",
  });
  const second = store.tasks.createTask({
    projectId: project.id,
    title: "Second card",
    status: "todo",
  });
  const requests: Array<{ method: string; input: unknown }> = [];
  const rows = () =>
    db
      .prepare<[], TaskStatusTransition>(`SELECT id, task_id AS taskId,
    from_status AS fromStatus, to_status AS toStatus, changed_at AS changedAt
    FROM task_status_transitions ORDER BY id`)
      .all();
  await page.route("**/__board_rpc/*", async (route) => {
    const method = route.request().url().split("/").at(-1)!;
    const input: unknown = route.request().postDataJSON();
    requests.push({ method, input });
    try {
      const result = await harness.behavior.callRpc(method, input);
      await route.fulfill({ json: result });
    } catch (error) {
      await route.fulfill({ status: 500, json: { error: String(error) } });
    }
  });
  return { harness, db, store, project, first, second, requests, rows };
}

async function status(page: Page, key: string, title: string, label: string) {
  await page.getByRole("button", { name: `Open ${key}: ${title}` }).focus();
  await page.keyboard.press("s");
  await page.getByRole("menuitem", { name: label, exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}

test("production board property edits, reorder and status retries persist only actual transitions", async ({
  page,
}, testInfo) => {
  const f = await setup(page);
  try {
    await page.goto(`/tests/board-resources.html?projectId=${f.project.id}`);
    const first = page.getByRole("button", { name: "Open HIS-1: First card" });
    const second = page.getByRole("button", { name: "Open HIS-2: Second card" });
    await expect(first).toBeVisible();
    for (let attempt = 0; attempt < 2; attempt++) {
      await first.focus();
      await page.keyboard.press("p");
      await page
        .getByRole("menuitem", {
          name: attempt === 0 ? "Urgent" : "Urgent (current)",
          exact: true,
        })
        .click();
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect
        .poll(() => f.requests.filter((request) => request.method === "updateTask").length)
        .toBe(1);
      await expect.poll(() => f.store.tasks.getTask(f.first.id)?.priority).toBe("urgent");
      expect(f.rows()).toEqual([]);
    }
    const start = (await second.boundingBox())!;
    const target = (await first.boundingBox())!;
    await page.mouse.move(start.x + 40, start.y + 15);
    await page.mouse.down();
    await page.mouse.move(target.x + 40, target.y + 2, { steps: 10 });
    await page.mouse.up();
    const todo = page.locator('[data-board-column="todo"]');
    await expect
      .poll(() =>
        todo
          .locator("[data-task-key]")
          .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-task-key"))),
      )
      .toEqual(["HIS-2", "HIS-1"]);
    await expect
      .poll(() => f.store.tasks.listTasks({ projectId: f.project.id }).map((task) => task.key))
      .toEqual(["HIS-2", "HIS-1"]);
    expect(f.rows()).toEqual([]);
    await status(page, "HIS-1", "First card", "Done");
    await expect(page.locator('[data-board-column="done"]')).toContainText("First card");
    await expect.poll(() => f.rows().length).toBe(1);
    const committed = f.rows();
    expect(committed).toEqual([
      {
        id: 1,
        taskId: f.first.id,
        fromStatus: "todo",
        toStatus: "done",
        changedAt: committed[0]!.changedAt,
      },
    ]);
    expect(committed[0]!.changedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const moves = f.requests.filter((request) => request.method === "boardMove").length;
    await status(page, "HIS-1", "First card", "Done (current)");
    await expect
      .poll(() => f.requests.filter((request) => request.method === "boardMove").length)
      .toBe(moves);
    await page.getByRole("button", { name: "Refresh tasks" }).click();
    await expect(page.locator('[data-board-column="done"]')).toContainText("First card");
    expect(f.rows()).toEqual(committed);
    await testInfo.attach("persisted-history-and-rpc", {
      body: JSON.stringify({ rows: f.rows(), requests: f.requests }, null, 2),
      contentType: "application/json",
    });
  } finally {
    await page.unroute("**/__board_rpc/*");
    await f.harness.lifecycle.dispose();
  }
});

test("production board restores failed SQL moves and persists only the successful retry", async ({
  page,
}, testInfo) => {
  const f = await setup(page);
  try {
    await page.goto(`/tests/board-resources.html?projectId=${f.project.id}`);
    await expect(page.getByRole("button", { name: "Open HIS-1: First card" })).toBeVisible();
    const before = f.store.tasks.getTask(f.first.id);
    f.db.exec(`CREATE TRIGGER test_abort_history BEFORE INSERT ON task_status_transitions
      BEGIN SELECT RAISE(ABORT, 'browser history failure'); END;`);
    await status(page, "HIS-1", "First card", "Done");
    await expect(page.getByRole("alert")).toHaveText("Fixture RPC boardMove: 500");
    await expect(
      page
        .locator('[data-board-column="todo"]')
        .getByRole("button", { name: "Open HIS-1: First card" }),
    ).toBeVisible();
    expect(f.store.tasks.getTask(f.first.id)).toEqual(before);
    expect(f.rows()).toEqual([]);
    f.db.exec("DROP TRIGGER test_abort_history");
    await status(page, "HIS-1", "First card", "Done");
    await expect(page.locator('[data-board-column="done"]')).toContainText("First card");
    await expect.poll(() => f.rows().length).toBe(1);
    const rows = f.rows();
    expect(rows).toEqual([
      {
        id: 1,
        taskId: f.first.id,
        fromStatus: "todo",
        toStatus: "done",
        changedAt: rows[0]!.changedAt,
      },
    ]);
    expect(f.store.tasks.getTask(f.first.id)?.status).toBe("done");
    await testInfo.attach("persisted-retry-history", {
      body: JSON.stringify(rows, null, 2),
      contentType: "application/json",
    });
  } finally {
    await page.unroute("**/__board_rpc/*");
    await f.harness.lifecycle.dispose();
  }
});
