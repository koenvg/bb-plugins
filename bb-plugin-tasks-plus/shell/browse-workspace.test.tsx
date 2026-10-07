// @vitest-environment jsdom
import { fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { rpcInput } from "../test-fixtures.js";
import { parseTasksRoute, tasksRouteToSubPath } from "./routes.js";
import { writeFileSync } from "node:fs";
import {
  project,
  tasks,
  panelSize,
  setup,
  row,
  select,
  useWorkspaceTestLifecycle,
} from "./browse-workspace.test-support.js";

useWorkspaceTestLifecycle();

describe("browse selection routes", () => {
  it("round-trips optional selection including host encoding, without adding selection to boards", () => {
    for (const route of [
      { kind: "all", taskKey: "TSK-2" },
      { kind: "active", taskKey: "TSK-2" },
      {
        kind: "project",
        projectId: project.id,
        view: "list",
        taskKey: "TSK-2",
      },
      { kind: "project", projectId: project.id, view: null, taskKey: "TSK-2" },
    ] as const) {
      const path = tasksRouteToSubPath(route);
      expect(path).toContain("task=TSK-2");
      expect(parseTasksRoute(path)).toEqual(route);
      expect(parseTasksRoute(encodeURIComponent(path))).toEqual(route);
    }
    expect(parseTasksRoute(`${project.id}?view=board&task=TSK-2`)).toEqual({
      kind: "project",
      projectId: project.id,
      view: "board",
    });
    expect(parseTasksRoute("all?task=%20")).toEqual({ kind: "all" });
    expect(parseTasksRoute("task/TSK-2")).toEqual({
      kind: "task",
      taskKey: "TSK-2",
    });
  });
});

describe("editable browse workspace", () => {
  it.each(["all", "active", `${project.id}?view=list`])(
    "retains the list and its position when selecting in %s",
    async (subPath) => {
      const slot = setup(subPath);
      await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
      expect(slot.getByText("Select a ticket to view and edit")).toBeTruthy();
      const list = slot.getByRole("region", { name: "Ticket list" });
      const scroll = list.querySelector<HTMLElement>("[data-list-scroll]")!;
      scroll.scrollTop = 170;
      const firstRow = row(slot, 1);
      firstRow.focus();
      await select(slot, 1);
      expect(slot.getByRole("region", { name: "Ticket list" })).toBe(list);
      expect(scroll.scrollTop).toBe(170);
      expect(firstRow.getAttribute("aria-current")).toBe("true");
      expect(slot.container.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
      expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 1");
      expect(document.activeElement).toBe(firstRow);
      expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
        options: {
          replace: true,
          subPath: `${subPath}${subPath.includes("?") ? "&" : "?"}task=TSK-1`,
        },
      });
      const detail = slot.getByRole("region", { name: "Selected ticket" });
      expect(detail.className).toContain("overflow-y-auto");
      detail.scrollTop = 240;
      fireEvent.scroll(detail);
      expect(scroll.scrollTop).toBe(170);
      await select(slot, 2);
      expect(firstRow.getAttribute("aria-current")).toBeNull();
      expect(row(slot, 2).getAttribute("aria-current")).toBe("true");
      expect(within(detail).getByRole("textbox", { name: "Task title" }).textContent).toBe(
        "Title 2",
      );
    },
  );

  it("leaves narrow main-pane layout to the host and keeps the list mounted", async () => {
    panelSize.width = 600;
    const slot = setup();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    const list = slot.getByRole("region", { name: "Ticket list" });
    await select(slot, 1);
    expect(list.hidden).toBe(false);
    expect(slot.queryByRole("button", { name: "Back to list" })).toBeNull();
    expect(slot.container.contains(list)).toBe(true);
  });
  it.each([1000, 880, 600, 320])("fits the existing editor into a %ipx panel", async (width) => {
    panelSize.width = width;
    const sample = {
      ...tasks[0]!,
      title: "Browse and edit tickets without losing your place",
      description:
        "## A retained list and the existing editor\n\nChange properties, attach files, and write comments here. The list stays available while this ticket is open.\n\n- Keep task-owned drafts\n- Preserve project context\n- Use independent scroll areas",
    };
    const sampleTasks = [
      sample,
      ...Array.from({ length: 16 }, (_, i) => ({
        ...tasks[1]!,
        id: `sample-${i}`,
        key: `TSK-${i + 2}`,
        number: i + 2,
        title:
          i % 2
            ? "Preserve pending edits before changing the selected ticket"
            : "Verify project navigation and long ticket titles",
      })),
    ];
    const slot = setup("all?task=TSK-1", {
      listTasks: (raw) => ({
        tasks: rpcInput(raw).parentTaskId ? [] : sampleTasks,
        nextCursor: null,
      }),
      getTaskByKey: () => ({ task: sample }),
    });
    await slot.findByRole("textbox", { name: "Task title" });
    expect(
      slot.container.querySelector("[data-browse-layout]")?.getAttribute("data-browse-layout"),
    ).toBe("native");
    expect(slot.getAllByRole("button", { name: "Attach file" })).toHaveLength(1);
    expect(document.activeElement?.getAttribute("contenteditable")).not.toBe("true");
    if (process.env.BBP12_CAPTURE) {
      writeFileSync(`/tmp/bbp12-artifacts/panel-${width}.html`, slot.container.innerHTML);
      writeFileSync(
        "/tmp/bbp12-artifacts/editor.css",
        document.querySelector("[data-bb-tasks-editor-styles]")?.textContent ?? "",
      );
    }
  });
});
