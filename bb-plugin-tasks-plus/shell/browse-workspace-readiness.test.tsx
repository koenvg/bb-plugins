// @vitest-environment jsdom
import { act, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { rpcInput } from "../test-fixtures.js";
import { storeListPreference } from "../views/list/list-preference.js";
import { querySnapshotStorageKey } from "./query-snapshot.js";
import {
  deferred,
  project,
  row,
  setup,
  tasks,
  useWorkspaceTestLifecycle,
} from "./browse-workspace.test-support.js";

useWorkspaceTestLifecycle();

function saveLabelFilter(scope: "all" | "active") {
  storeListPreference(scope, {
    filters: { statuses: [], priorities: [], labelNames: ["frontend"] },
    sort: "manual",
  });
}
const label = {
  id: "01HZZZZZZZZZZZZZZZZZZZZZL1",
  projectId: project.id,
  name: "frontend",
  color: "blue",
  createdAt: project.createdAt,
};
const selected = { ...tasks[0]!, labelIds: [label.id] };

// Match the backend: omitted labelIds is unfiltered, [] means no matches.
function matchedTasks(raw: unknown) {
  const input = rpcInput(raw);
  if (input.parentTaskId) return [];
  const ids = input.labelIds as string[] | undefined;
  return ids === undefined || ids.includes(label.id) ? [selected] : [];
}

describe("initial label-filtered browse selection", () => {
  it.each([
    ["all", false],
    ["active", false],
    ["all", true],
    ["active", true],
  ] as const)(
    "waits for current projects, labels and task matches in %s, stale inventory=%s",
    async (scope, stale) => {
      saveLabelFilter(scope);
      if (stale)
        window.localStorage.setItem(
          querySnapshotStorageKey("projects"),
          JSON.stringify([{ ...project, id: "01HZZZZZZZZZZZZZZZZZZZZZP2" }]),
        );
      const projects = deferred<unknown>();
      const labels = deferred<unknown>();
      const matches = deferred<unknown>();
      const slot = setup(`${scope}?task=TSK-1`, {
        listProjects: () => projects.promise,
        listLabels: (raw) =>
          rpcInput(raw).projectId === project.id
            ? labels.promise
            : { labels: [] },
        listTasks: (raw) => {
          const ids = rpcInput(raw).labelIds as string[] | undefined;
          return ids?.includes(label.id)
            ? matches.promise
            : { tasks: matchedTasks(raw), nextCursor: null };
        },
        getTaskByKey: () => ({ task: selected }),
      });
      await waitFor(() =>
        expect(
          slot.inspection.rpcCalls.some(
            (c) =>
              c.method === "listTasks" &&
              Array.isArray(rpcInput(c.input).labelIds),
          ),
        ).toBe(true),
      );
      await act(async () => {});
      expect(slot.inspection.navigateCalls).toEqual([]);
      expect(slot.queryByRole("textbox", { name: "Task title" })).toBeNull();
      await act(async () => projects.resolve({ projects: [project] }));
      await waitFor(() =>
        expect(
          slot.inspection.rpcCalls.some(
            (c) =>
              c.method === "listLabels" &&
              rpcInput(c.input).projectId === project.id,
          ),
        ).toBe(true),
      );
      expect(slot.inspection.navigateCalls).toEqual([]);
      await act(async () => labels.resolve({ labels: [label] }));
      await waitFor(() =>
        expect(
          slot.inspection.rpcCalls.some(
            (c) =>
              c.method === "listTasks" &&
              (rpcInput(c.input).labelIds as string[] | undefined)?.includes(
                label.id,
              ),
          ),
        ).toBe(true),
      );
      expect(slot.inspection.navigateCalls).toEqual([]);
      expect(slot.queryByRole("textbox", { name: "Task title" })).toBeNull();
      await act(async () =>
        matches.resolve({ tasks: [selected], nextCursor: null }),
      );
      expect(
        (await slot.findByRole("textbox", { name: "Task title" })).textContent,
      ).toBe(selected.title);
      expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
      expect(slot.inspection.navigateCalls).toEqual([]);
    },
  );

  it.each(["all", "active"] as const)(
    "does not clear %s selection on inventory failure, and can retry",
    async (scope) => {
      saveLabelFilter(scope);
      let failed = true;
      const slot = setup(`${scope}?task=TSK-1`, {
        listProjects: () => {
          if (failed) throw new Error("Inventory unavailable");
          return { projects: [project] };
        },
        listLabels: () => ({ labels: [label] }),
        listTasks: (raw) => ({ tasks: matchedTasks(raw), nextCursor: null }),
        getTaskByKey: () => ({ task: selected }),
      });
      await waitFor(() =>
        expect(
          slot.inspection.rpcCalls.some(
            (c) =>
              c.method === "listTasks" &&
              Array.isArray(rpcInput(c.input).labelIds),
          ),
        ).toBe(true),
      );
      await act(async () => {});
      expect(slot.inspection.navigateCalls).toEqual([]);
      expect(slot.queryByRole("textbox", { name: "Task title" })).toBeNull();
      failed = false;
      fireEvent.click(slot.getByRole("button", { name: "Refresh tasks" }));
      expect(
        (await slot.findByRole("textbox", { name: "Task title" })).textContent,
      ).toBe(selected.title);
      expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
      expect(slot.inspection.navigateCalls).toEqual([]);
    },
  );
});
