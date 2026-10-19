import { test, expect, type Page } from "@playwright/test";
import { makeTask, makeAttachment } from "../../test-fixtures";
import type { Task, TaskThread } from "../../shared/contract";

interface RequestRecord {
  method: string;
  input: Record<string, unknown>;
}
declare global {
  interface Window {
    boardFixture: {
      emitRealtime(channel: string, payload: unknown): Promise<void>;
      setRealtimeConnectionState(state: "connected" | "reconnecting"): Promise<void>;
    };
  }
}

async function setup(page: Page) {
  const requests: RequestRecord[] = [];
  const tasks = [
    makeTask({ id: "task-1", projectId: "project-1", title: "First card", labelIds: ["label-1"] }),
    makeTask({
      id: "task-2",
      projectId: "project-1",
      number: 2,
      key: "TSK-2",
      title: "Second card",
      position: 1,
    }),
    makeTask({
      id: "child-1",
      projectId: "project-1",
      number: 3,
      key: "TSK-3",
      parentTaskId: "task-1",
    }),
  ];
  const threads: TaskThread[] = [
    {
      id: "link-1",
      taskId: "task-1",
      threadId: "thr_fixture",
      presetName: "Fixture agent",
      title: "Fixture work",
      liveStatus: "working",
      attachedAt: tasks[0]!.createdAt,
      updatedAt: tasks[0]!.createdAt,
    },
  ];
  const attachments = [makeAttachment("task-1")];
  const labels = [
    {
      id: "label-1",
      projectId: "project-1",
      name: "frontend",
      color: "blue",
      createdAt: tasks[0]!.createdAt,
    },
  ];
  await page.route("**/__board_rpc/*", async (route) => {
    const method = route.request().url().split("/").at(-1)!;
    const input = route.request().postDataJSON() as Record<string, unknown>;
    requests.push({ method, input });
    let result: unknown;
    switch (method) {
      case "listTasks":
        result = {
          tasks: tasks.filter(
            (task) =>
              task.projectId === input.projectId &&
              (!input.activeOnly ||
                threads.some(
                  (thread) => thread.taskId === task.id && thread.liveStatus === "working",
                )),
          ),
          nextCursor: null,
        };
        break;
      case "listLabels":
        result = { labels: labels.filter((label) => label.projectId === input.projectId) };
        break;
      case "listTaskThreads":
        result = { taskThreads: threads.filter((thread) => thread.taskId === input.taskId) };
        break;
      case "listAttachments":
        result = {
          attachments: attachments.filter((attachment) => attachment.taskId === input.taskId),
        };
        break;
      case "listProjects":
        result = { projects: [] };
        break;
      case "boardMove": {
        const task = tasks.find((task) => task.id === input.taskId)!;
        task.status = input.status as Task["status"];
        result = { ok: true, task };
        break;
      }
      default:
        throw new Error(`Unexpected fixture RPC ${method}`);
    }
    await route.fulfill({ json: result });
    if (method === "boardMove")
      await page.evaluate(() =>
        window.boardFixture.emitRealtime("tasks:changed", {
          taskId: "task-1",
          projectId: "project-1",
        }),
      );
  });
  await page.goto("/tests/board-resources.html");
  await expect(page.getByRole("button", { name: "Open TSK-1: First card" })).toContainText(
    "Fixture agent",
  );
  await expect(page.getByLabel("1 attachments")).toBeVisible();
  await page.waitForTimeout(600);
  const count = (method: string, activeOnly = false) =>
    requests.filter(
      (request) =>
        request.method === method &&
        (method !== "listTasks" || Boolean(request.input.activeOnly) === activeOnly),
    ).length;
  const counts = () => ({
    tasks: count("listTasks"),
    labels: count("listLabels"),
    activeTasks: count("listTasks", true),
    threads: count("listTaskThreads"),
    attachments: count("listAttachments"),
  });
  return { requests, tasks, threads, attachments, labels, counts };
}

async function emit(page: Page, channel: string, payload: unknown) {
  await page.evaluate(
    ({ channel, payload }) => window.boardFixture.emitRealtime(channel, payload),
    { channel, payload },
  );
  await page.waitForTimeout(600);
}

test("status edit moves the card without reloading unrelated board resources", async ({
  page,
}, testInfo) => {
  const fixture = await setup(page);
  const before = fixture.counts();
  const card = page.getByRole("button", { name: "Open TSK-1: First card" });
  await expect(card).toContainText("0/1");
  await card.focus();
  await page.keyboard.press("s");
  await page.getByRole("menuitem", { name: "Done", exact: true }).click();
  await expect(page.locator('[data-board-column="done"]')).toContainText("First card");
  await page.waitForTimeout(600);
  const after = fixture.counts();
  const extraReads = Object.fromEntries(
    Object.keys(before).map((key) => [
      key,
      after[key as keyof typeof after] - before[key as keyof typeof before],
    ]),
  );
  await testInfo.attach("status-edit-requests", {
    body: JSON.stringify({ before, after, extraReads, requests: fixture.requests }, null, 2),
    contentType: "application/json",
  });
  expect(extraReads).toEqual({ tasks: 1, labels: 0, activeTasks: 0, threads: 0, attachments: 0 });
  await expect(card).toContainText("Fixture agent");
  await expect(card.getByLabel("1 attachments")).toBeVisible();
  await expect(card).toContainText("frontend");

  fixture.tasks[2]!.status = "done";
  await emit(page, "tasks:changed", { taskId: "child-1", projectId: "project-1" });
  await expect(card).toContainText("1/1");
  expect(fixture.counts().attachments).toBe(after.attachments);
});

test("real resource events, refresh, reconnect and tracker switches update the board", async ({
  page,
}) => {
  const fixture = await setup(page);
  const card = page.getByRole("button", { name: "Open TSK-1: First card" });
  fixture.threads[0]!.liveStatus = "idle";
  await emit(page, "threads:changed", { taskId: "task-1" });
  await expect(card).not.toContainText("Fixture agent");
  fixture.threads[0]!.liveStatus = "working";
  await emit(page, "threads:changed", { taskId: "task-1" });
  await expect(card).toContainText("Fixture agent");

  fixture.attachments.push({ ...makeAttachment("task-1"), id: "attachment-2" });
  await emit(page, "tasks:changed", {
    taskId: "task-1",
    projectId: "project-1",
    resource: "attachments",
  });
  await expect(card.getByLabel("2 attachments")).toBeVisible();
  fixture.attachments.length = 0;
  await emit(page, "tasks:changed", {
    taskId: "task-1",
    projectId: "project-1",
    resource: "attachments",
  });
  await expect(card.getByLabel(/attachments/)).toHaveCount(0);
  fixture.labels[0]!.name = "renamed";
  await emit(page, "projects:changed", { projectId: "project-1" });
  await expect(card).toContainText("renamed");

  for (const action of ["refresh", "reconnect"]) {
    const before = fixture.counts();
    fixture.attachments.push(makeAttachment("task-1"));
    fixture.threads[0]!.presetName = action;
    fixture.labels[0]!.name = action;
    if (action === "refresh") await page.getByRole("button", { name: "Refresh tasks" }).click();
    else {
      await page.evaluate(() => window.boardFixture.setRealtimeConnectionState("reconnecting"));
      await page.evaluate(() => window.boardFixture.setRealtimeConnectionState("connected"));
    }
    await expect(card).toContainText(action);
    await expect(card.getByLabel(`${fixture.attachments.length} attachments`)).toBeVisible();
    await page.waitForTimeout(600);
    const after = fixture.counts();
    for (const resource of Object.keys(before) as (keyof typeof before)[])
      expect(after[resource]).toBeGreaterThan(before[resource]);
  }
  await page.getByRole("button", { name: "Switch tracker" }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "Switch tracker" }).click();
  await expect(card).toContainText("reconnect");
});
