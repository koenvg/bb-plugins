import { loadPluginApp } from "@get-bb/plugin-sdk/testing/app";
import type { Task } from "../../shared/contract.js";
import { makeTask } from "../../test-fixtures.js";

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

export const app = await loadPluginApp(() => import("../../app"));

export const PROJECT_ID = "01HZZZZZZZZZZZZZZZZZZZZZP1";
export const TASK_ID = "01HZZZZZZZZZZZZZZZZZZZZZT1";

export const project = {
  id: PROJECT_ID,
  name: "Tasks Plugin",
  prefix: "TSK",
  nextTaskNumber: 5,
  color: "blue",
  folderId: null,
  linkedBbProjectId: null,
  createdAt: "2026-07-15T00:00:00.000Z",
};

export function createdTask(input: Record<string, unknown>): Task {
  return makeTask({
    id: TASK_ID,
    projectId: PROJECT_ID,
    number: 5,
    key: "TSK-5",
    title: String(input.title),
    description: String(input.description ?? ""),
    status: (input.status as Task["status"]) ?? "backlog",
    priority: (input.priority as Task["priority"]) ?? "none",
    dueDate: (input.dueDate as string | null) ?? null,
    parentTaskId: (input.parentTaskId as string | null) ?? null,
    position: 1,
    labelIds: (input.labelIds as string[]) ?? [],
  });
}
