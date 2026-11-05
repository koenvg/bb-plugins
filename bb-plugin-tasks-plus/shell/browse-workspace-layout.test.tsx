// @vitest-environment jsdom
import { fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TaskDependencyRef } from "../shared/contract.js";
import { rpcInput } from "../test-fixtures.js";
import {
  panelSize,
  project,
  setup,
  tasks,
  useWorkspaceTestLifecycle,
} from "./browse-workspace.test-support.js";

useWorkspaceTestLifecycle();

// Captures actual component markup for an isolated browser + built-CSS inspection.
// This is not an installed-host or hydrated browser fixture.
function capture(slot: ReturnType<typeof setup>, width: number, pane: string) {
  const directory = process.env.TASKS_LAYOUT_CAPTURE;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `panel-${width}-${pane}.html`), slot.container.innerHTML);
  writeFileSync(
    join(directory, "editor.css"),
    document.querySelector("[data-bb-tasks-editor-styles]")?.textContent ?? "",
  );
}

describe("responsive browse markup", () => {
  it.each([1000, 880, 600, 320])(
    "retains long titles, nested identity and important metadata at %ipx",
    async (width) => {
      panelSize.width = width;
      const otherTasks = Array.from({ length: 14 }, (_, n) => ({
        ...tasks[1]!,
        id: `sample-${n}`,
        key: `TSK-${n + 4}`,
        number: n + 4,
        title: "Check compact browsing, independent scrolling, and safe editor transitions",
      }));
      const blockers: TaskDependencyRef[] = otherTasks
        .slice(0, 2)
        .map(({ id, key, title, status }) => ({ id, key, title, status }));
      const parent = {
        ...tasks[0]!,
        title:
          "Preserve a long ticket title and important browsing context without losing task-owned drafts",
        priority: "high" as const,
        dueDate: "2026-10-15",
        blockedBy: blockers,
        openBlockerCount: 2,
        openBlockedCount: 1,
        blocked: true,
        description:
          "## Keep your place\n\nThe list and the full editor stay mounted on resize. Back to list returns to the same selected row without submitting a comment.\n\n- Pending edits remain owned by this ticket\n- List filters, sort, and expansion stay in place",
        labelIds: ["label"],
      };
      const child = {
        ...tasks[2]!,
        parentTaskId: parent.id,
        title: "Nested task with a long title that still needs readable identity and metadata",
        blockedBy: [
          { id: parent.id, key: parent.key, title: parent.title, status: parent.status },
        ] satisfies TaskDependencyRef[],
        openBlockerCount: 1,
        blocked: true,
      };
      const sample = [parent, child, ...otherTasks];
      const slot = setup("all?task=TSK-1", {
        listTasks: (raw) => ({
          tasks: rpcInput(raw).parentTaskId ? [child] : sample,
          nextCursor: null,
        }),
        getTaskByKey: () => ({ task: parent }),
        getTask: () => ({ task: parent }),
        listLabels: () => ({
          labels: [
            {
              id: "label",
              projectId: project.id,
              name: "ready-for-agent",
              color: "var(--primary)",
            },
          ],
        }),
      });
      await slot.findByRole("textbox", { name: "Task title" });
      capture(slot, width, "detail");
      fireEvent.click(slot.getByRole("button", { name: "Expand subtasks of TSK-1" }));
      const list = slot.getByRole("region", { name: "Ticket list" });
      expect(
        within(list)
          .getByRole("button", { name: `Open TSK-1: ${parent.title}` })
          .getAttribute("aria-current"),
      ).toBe("true");
      expect(
        within(list).getByRole("button", {
          name: `Open TSK-3: ${child.title}`,
        }),
      ).toBeTruthy();
      expect(within(list).getByText("Blocked by 2 tasks").textContent).toBe("Blocked by 2 tasks");
      expect(within(list).getByText("Blocks 1 task").textContent).toBe("Blocks 1 task");
      expect(within(list).getByText("Blocked by 1 task").textContent).toBe("Blocked by 1 task");
      expect(within(list).queryByText("ready-for-agent")).toBeNull();
      capture(slot, width, "list");
    },
  );
});
