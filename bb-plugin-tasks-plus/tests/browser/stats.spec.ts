import { test, expect, type Page } from "@playwright/test";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createStore, registerTasksApi } from "../../api";
import type { TaskStatus } from "../../shared/contract.js";

async function setup(page: Page) {
  const { bb, harness } = createFakePluginHost({ pluginId: "stats-browser" });
  const store = createStore(bb);
  registerTasksApi(bb, store);
  const db = bb.storage.database();
  const alpha = store.tasks.createProject({
    name: "Developer tools",
    prefix: "DEV",
    color: "#a89bc8",
  });
  const beta = store.tasks.createProject({
    name: "Research and development experiments with a long project name",
    prefix: "LAB",
    color: "#a89bc8",
  });
  function task(
    projectId: string,
    title: string,
    hours: number,
    statuses: TaskStatus[] = ["in_progress", "done"],
  ) {
    const task = store.tasks.createTask({ projectId, title, status: "todo", priority: "medium" });
    for (const status of statuses) store.tasks.updateTask(task.id, { status });
    for (const [index, row] of store.tasks.listTaskStatusTransitions(task.id).entries())
      db.prepare("UPDATE task_status_transitions SET changed_at = ? WHERE id = ?").run(
        new Date(index ? hours * 3600000 : 0).toISOString(),
        row.id,
      );
    return task;
  }
  task(alpha.id, "Read the request", 1);
  const slow = task(alpha.id, "Keep keyboard focus when switching between task details", 3);
  task(beta.id, "Keep long project names readable while narrowing the panel", 5);
  task(beta.id, "Interrupted work stays separate", 24, ["in_progress", "backlog", "done"]);
  task(beta.id, "Canceled work", 50, ["in_progress", "canceled"]);
  task(beta.id, "No recorded start", 50, ["done"]);
  let refuseSave = true;
  const calls: Array<{ method: string; input: unknown }> = [];
  await page.route("**/__stats_rpc/*", async (route) => {
    const method = route.request().url().split("/").at(-1)!;
    const input: unknown = route.request().postDataJSON();
    calls.push({ method, input });
    if (method === "updateTask" && refuseSave) {
      refuseSave = false;
      await route.fulfill({ json: { ok: false, error: { message: "Synthetic save refusal" } } });
      return;
    }
    try {
      await route.fulfill({ json: await harness.behavior.callRpc(method, input) });
    } catch (error) {
      await route.fulfill({ status: 500, json: { error: String(error) } });
    }
  });
  return { harness, store, alpha, beta, slow, calls };
}

test("production Stats uses persisted history, filters, disclosure and save-guarded detail Back", async ({
  page,
}, testInfo) => {
  const f = await setup(page);
  try {
    await page.goto("/tests/stats.html?transport");
    const measures = page.locator(".stats-summary dd");
    await expect(measures).toHaveText(["3h", "3h", "3"]);
    await page.getByRole("button", { name: "Show tasks" }).click();
    await expect(
      page.getByRole("button", { name: /Open LAB-2: Interrupted work stays separate/ }),
    ).toBeVisible();
    await expect(measures).toHaveText(["3h", "3h", "3"]);
    await expect(page.locator(".stats-slowest")).not.toContainText(
      "Interrupted work stays separate",
    );
    await page.getByRole("button", { name: "Hide tasks" }).click();
    await page.getByRole("combobox", { name: "Project" }).click();
    await page.getByRole("option", { name: f.alpha.name, exact: true }).click();
    await expect(measures).toHaveText(["2h", "2h", "2"]);
    await expect(
      page.getByText("Only 2 tasks so far. Treat these numbers as an early indication."),
    ).toBeVisible();
    const slow = page.getByRole("button", { name: `Open ${f.slow.key}: ${f.slow.title}` });
    await slow.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "Task title" })).toHaveText(f.slow.title);
    const editor = page.locator(".tiptap");
    await editor.fill("Retained Stats navigation draft");
    await page.getByRole("button", { name: "Back (Esc)" }).click();
    await expect(page.getByRole("alert")).toContainText("Synthetic save refusal");
    await expect(editor).toHaveText("Retained Stats navigation draft");
    await expect(page.locator(".stats-summary")).toHaveCount(0);
    await page.getByRole("button", { name: "Retry save" }).click();
    await expect(measures).toHaveText(["2h", "2h", "2"]);
    await expect(page.locator('output[aria-label="Fixture route"]')).toHaveText(
      `stats?project=${f.alpha.id}`,
    );
    expect(f.store.tasks.getTask(f.slow.id)?.description).toBe("Retained Stats navigation draft");
    expect(f.calls.filter((call) => call.method === "updateTask")).toEqual([
      {
        method: "updateTask",
        input: { taskId: f.slow.id, description: "Retained Stats navigation draft" },
      },
      {
        method: "updateTask",
        input: { taskId: f.slow.id, description: "Retained Stats navigation draft" },
      },
    ]);
    await page.getByRole("combobox", { name: "Project" }).click();
    await page.getByRole("option", { name: "All projects", exact: true }).click();
    await expect(measures).toHaveText(["3h", "3h", "3"]);
    await page.screenshot({ path: testInfo.outputPath("stats.png"), fullPage: true });
  } finally {
    await f.harness.dispose();
  }
});

test("standalone synthetic fixture needs no route interception and remains readable in a small panel", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tests/stats.html?state=interrupted");
  await expect(page.locator(".stats-summary dd")).toHaveText(["1d 4h", "1d 7.6h", "10"]);
  await page.getByRole("button", { name: "Show tasks" }).click();
  await expect(page.getByRole("button", { name: /Open DEV-11:/ })).toBeVisible();
  expect(await page.locator("main").evaluate((main) => main.scrollWidth <= main.clientWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("stats-small.png"), fullPage: true });
  await page.goto("/tests/stats.html?state=empty");
  await expect(page.getByText("No duration data yet")).toBeVisible();
  await expect(page.locator(".stats-summary dd")).toHaveText(["No data", "No data", "0"]);
});
