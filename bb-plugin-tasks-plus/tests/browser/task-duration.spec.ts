import { expect, test, type Page } from "@playwright/test";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createStore, registerTasksApi } from "../../api";
import { tasksRpcContract, type TaskStatus } from "../../shared/contract";

async function setup(page: Page) {
  const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
  const store = createStore(bb);
  registerTasksApi(bb, store);
  const db = bb.storage.database();
  const project = store.tasks.createProject({
    name: "Duration fixture",
    prefix: "TSK",
    color: "blue",
  });
  const first = store.tasks.createTask({
    projectId: project.id,
    title: "Reopened task",
    status: "todo",
  });
  const second = store.tasks.createTask({
    projectId: project.id,
    title: "Interrupted task",
    status: "todo",
  });
  async function transition(taskId: string, status: TaskStatus, at: string) {
    await harness.behavior.callRpc("updateTask", { taskId, status });
    db.prepare(`UPDATE task_status_transitions SET changed_at = ?
      WHERE id = (SELECT MAX(id) FROM task_status_transitions WHERE task_id = ?)`).run(at, taskId);
  }
  for (const [status, at] of [
    ["in_progress", "2026-10-19T09:00:00.000Z"],
    ["in_review", "2026-10-19T17:00:00.000Z"],
    ["done", "2026-10-20T09:00:00.000Z"],
    ["in_progress", "2026-10-20T11:00:00.000Z"],
    ["in_review", "2026-10-21T10:00:00.000Z"],
    ["done", "2026-10-21T17:00:00.000Z"],
  ] as const)
    await transition(first.id, status, at);
  for (const [status, at] of [
    ["in_progress", "2026-10-12T09:00:00.000Z"],
    ["todo", "2026-10-13T15:00:00.000Z"],
    ["in_progress", "2026-10-18T09:00:00.000Z"],
    ["in_review", "2026-10-19T11:00:00.000Z"],
    ["done", "2026-10-19T17:00:00.000Z"],
  ] as const)
    await transition(second.id, status, at);
  const requests: Array<{ method: string; input: unknown }> = [];
  let beforeUpdate: (() => Promise<boolean>) | undefined;
  let failLookup = false;
  await page.route("**/__task_duration_rpc/*", async (route) => {
    const method = route.request().url().split("/").at(-1)! as keyof typeof tasksRpcContract;
    const input: unknown = route.request().postDataJSON();
    requests.push({ method, input });
    if (method === "getTaskByKey" && failLookup) {
      await route.fulfill({ status: 503, json: { error: "Lookup unavailable" } });
      return;
    }
    if (method === "updateTask" && beforeUpdate && !(await beforeUpdate())) {
      await route.fulfill({
        status: 503,
        json: { error: "Status save failed" },
      });
      return;
    }
    try {
      const result = await harness.behavior.callRpc(method, input);
      await route.fulfill({ json: tasksRpcContract[method].output.parse(result) });
    } catch (error) {
      await route.fulfill({ status: 500, json: { error: String(error) } });
    }
  });
  return {
    harness,
    store,
    db,
    first,
    second,
    transition,
    requests,
    pauseUpdates: (hook: () => Promise<boolean>) => {
      beforeUpdate = hook;
    },
    resumeUpdates: () => {
      beforeUpdate = undefined;
    },
    failLookup: (fail: boolean) => {
      failLookup = fail;
    },
  };
}

async function changed(page: Page, taskId: string) {
  await page.evaluate(async (taskId) => {
    const fixture = (
      window as unknown as {
        taskDurationFixture: {
          emitRealtime: (event: string, payload: unknown) => Promise<void>;
        };
      }
    ).taskDurationFixture;
    await fixture.emitRealtime("tasks:changed", { taskId });
  }, taskId);
}

async function acceptNavigation(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-accept-navigation")));
}

for (const width of [1200, 650, 390]) {
  test(`production detail duration follows persisted history, navigation and refresh at ${width}px`, async ({
    page,
  }, testInfo) => {
    const f = await setup(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/tests/task-commands.html?durationTransport&theme=dark");
      const strip = page.getByRole("region", { name: "Task duration" });
      const title = page.getByRole("textbox", { name: "Task title" });
      await expect(title).toHaveText("Reopened task");
      await expect(strip.getByLabel("2 days 8 hours")).toHaveText("2d 8h");
      await expect(strip).toContainText("Includes review time and the reopened period.");
      const layout = page.locator(
        `[data-properties-layout="${width === 1200 ? "rail" : "inline"}"]`,
      );
      await expect(layout).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("reopened.png") });
      await page.getByRole("button", { name: "Next task", exact: true }).click();
      await acceptNavigation(page);
      await expect(title).toHaveText("Interrupted task");
      await expect(strip.getByText("7d 8h")).toBeVisible();
      await expect(strip.getByText("Interrupted", { exact: true })).toBeVisible();
      await expect(strip).toContainText("Excluded from median and average.");
      await page.screenshot({ path: testInfo.outputPath("interrupted.png") });
      await page.getByRole("button", { name: "Previous task", exact: true }).click();
      await acceptNavigation(page);
      await expect(title).toHaveText("Reopened task");
      const editor = await page.locator(".tiptap").elementHandle();
      await f.transition(f.first.id, "in_progress", "2026-10-22T09:00:00.000Z");
      await changed(page, f.first.id);
      await expect(strip.getByText("Not completed", { exact: true })).toBeVisible();
      await expect(strip.getByText("2d 8h")).toHaveCount(0);
      await f.transition(f.first.id, "done", "2026-10-22T18:00:00.000Z");
      await changed(page, f.first.id);
      await expect(strip.getByText("3d 9h")).toBeVisible();
      expect(await editor!.evaluate((node) => node.isConnected)).toBe(true);
      f.failLookup(true);
      await changed(page, f.first.id);
      await expect(page.getByRole("alert")).toContainText("Could not refresh TSK-1");
      await expect(strip.getByText("3d 9h")).toBeVisible();
      await f.transition(f.first.id, "canceled", "2026-10-23T09:00:00.000Z");
      f.failLookup(false);
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await expect(strip.getByText("Excluded", { exact: true })).toBeVisible();
      await expect(strip.getByText("3d 9h")).toHaveCount(0);
      await f.transition(f.first.id, "done", "2026-10-23T10:00:00.000Z");
      f.db.prepare("DELETE FROM task_status_transitions WHERE task_id = ?").run(f.first.id);
      await page.getByRole("button", { name: "Refresh tasks", exact: true }).click();
      await expect(strip.getByText("Duration unavailable", { exact: true })).toBeVisible();
      await expect(strip).toContainText("No recorded first start");
      expect(f.requests.filter(({ method }) => method === "getTaskByKey").length).toBeGreaterThan(
        4,
      );
      expect(errors).toEqual([]);
    } finally {
      await f.harness.dispose();
    }
  });
}

for (const width of [1200, 650, 390]) {
  test(`pending status saves hide old duration and block switching until retry at ${width}px`, async ({
    page,
  }, testInfo) => {
    const f = await setup(page);
    let release!: (success: boolean) => void;
    f.pauseUpdates(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );
    try {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/tests/task-commands.html?durationTransport");
      const strip = page.getByRole("region", { name: "Task duration" });
      const title = page.getByRole("textbox", { name: "Task title" });
      await expect(strip.getByText("2d 8h")).toBeVisible();
      const initialHeight = (await strip.boundingBox())!.height;
      const layout = page.locator(
        `[data-properties-layout="${width === 1200 ? "rail" : "inline"}"]`,
      );
      await layout.getByRole("button", { name: "No priority", exact: true }).click();
      await page.getByRole("menuitem", { name: "High", exact: true }).click();
      await expect
        .poll(() => f.requests.filter(({ method }) => method === "updateTask").length)
        .toBe(1);
      await expect(strip.getByText("2d 8h")).toBeVisible();
      release(true);
      await expect.poll(() => f.store.tasks.getTask(f.first.id)?.priority).toBe("high");
      await expect
        .poll(() => f.requests.filter(({ method }) => method === "getTaskByKey").length)
        .toBeGreaterThan(1);
      await layout.getByRole("button", { name: "Done", exact: true }).click();
      await page.getByRole("menuitem", { name: "In Progress", exact: true }).click();
      await expect(strip.getByText("Awaiting status save")).toBeVisible();
      await expect(strip.getByText("2d 8h")).toHaveCount(0);
      expect((await strip.boundingBox())!.height).toBe(initialHeight);
      await page.getByRole("button", { name: "Next task", exact: true }).click();
      await acceptNavigation(page);
      await expect(title).toHaveText("Reopened task");
      release(false);
      await expect(page.getByRole("alert")).toContainText("Fixture RPC updateTask: 503");
      expect(f.store.tasks.getTask(f.first.id)?.status).toBe("done");
      await expect(strip.getByText("Awaiting status save")).toBeVisible();
      await expect(strip.getByText("2d 8h")).toHaveCount(0);
      expect((await strip.boundingBox())!.height).toBe(initialHeight);
      await page.screenshot({ path: testInfo.outputPath("failed-status-save.png") });
      f.resumeUpdates();
      await page.getByRole("button", { name: "Retry save", exact: true }).click();
      await expect.poll(() => f.store.tasks.getTask(f.first.id)?.status).toBe("in_progress");
      await expect(strip.getByText("Not completed", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Next task", exact: true }).click();
      await acceptNavigation(page);
      await expect(title).toHaveText("Interrupted task");
      await expect(strip.getByText("7d 8h")).toBeVisible();
    } finally {
      await f.harness.dispose();
    }
  });
}
