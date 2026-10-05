// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import { TasksEditor } from "./editor/tasks-editor";
import plugin from "./server";

const summary = [
  "**The change is ready for review.**",
  "",
  "- Focused checks pass; acceptance is still pending.",
  "- Next: review [the subtask](bbtask://RPT-1).",
  "- [Evidence](bbthread://thr_abc123).",
].join("\n");
const longComment = "Additional user detail. ".repeat(100) + "Final detail is visible.";

describe("task comment reporting path", () => {
  it.each([
    { name: "formatted agent milestone", body: summary, agent: true },
    { name: "long user comment", body: longComment, agent: false },
  ])("preserves and renders a $name through the CLI", async ({ body, agent }) => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        threads: {
          get: async ({ threadId }) => makeThreadResponse({ id: threadId }),
        },
        providers: { list: async () => [] },
      },
    });
    try {
      await plugin(bb);
      async function cli(args: string[]) {
        const result = await harness.runCli(args);
        expect(result, result.stderr).toMatchObject({ exitCode: 0, stderr: "" });
        return JSON.parse(result.stdout);
      }
      await cli(["project", "create", "--name", "Reports", "--prefix", "RPT", "--json"]);
      const { task } = await cli([
        "create",
        "--project",
        "RPT",
        "--title",
        "Report work",
        "--json",
      ]);
      const created = await harness.runCli(
        ["comment", task.key, "--body", body, "--json"],
        agent ? { threadId: "thr_abc123" } : {},
      );
      expect(created, created.stderr).toMatchObject({ exitCode: 0, stderr: "" });
      const { comment } = JSON.parse(created.stdout);
      const detail = await cli(["show", task.key, "--json"]);
      const stored = detail.comments.find((entry: { id: string }) => entry.id === comment.id);
      expect(stored).toMatchObject({ body, kind: agent ? "agent" : "user" });
      expect(detail.task.status).toBe(task.status);
      expect(harness.sdk.callsTo("threads.send")).toEqual([]);

      const onOpenThread = vi.fn();
      const onChange = vi.fn();
      const view = render(
        <TasksEditor
          value={stored.body}
          onChange={onChange}
          readOnly
          variant="comment"
          onOpenThread={onOpenThread}
        />,
      );
      await waitFor(() => expect(view.container.querySelector(".tiptap")).toBeTruthy());
      if (agent) {
        expect(view.getByText("The change is ready for review.").tagName).toBe("STRONG");
        expect(view.getAllByRole("listitem")).toHaveLength(3);
        expect(view.container.querySelector('[data-task-mention="RPT-1"]')).toBeTruthy();
        fireEvent.click(view.getByText("Evidence"));
        expect(onOpenThread).toHaveBeenCalledWith("thr_abc123");
      } else {
        expect(view.container.querySelector(".tiptap")?.textContent).toBe(longComment);
      }
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      cleanup();
      await harness.dispose();
    }
  });
});
