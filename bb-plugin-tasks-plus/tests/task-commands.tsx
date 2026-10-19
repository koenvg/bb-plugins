import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginCommandContext } from "@get-bb/plugin-sdk/app";
import { TasksAppShell } from "../shell/app-shell";
import { TASKS_COMMANDS } from "../shell/commands";
import { makeTask, rpcInput } from "../test-fixtures";
import "./preview.css";

const context: PluginCommandContext = { threadId: null, projectId: null, openPanel: () => false };
const project = {
  id: "project-1",
  name: "Command fixture",
  prefix: "TSK",
  nextTaskNumber: 3,
  color: "blue",
  folderId: null,
  linkedBbProjectId: "proj_first" as string | null,
  createdAt: "2026-07-15T00:00:00.000Z",
};
const tasks = [1, 2].map((number) =>
  makeTask({
    id: `task-${number}`,
    projectId: project.id,
    number,
    key: `TSK-${number}`,
    title: `Task ${number}`,
    status: "todo",
    priority: "none",
  }),
);
const updates: Record<string, unknown>[] = [];
const projectUpdates: Record<string, unknown>[] = [];
const delegations: Record<string, unknown>[] = [];
const bbProjects = [
  { id: "proj_first", name: "First workspace" },
  { id: "proj_second", name: "Second workspace" },
];
const label = {
  id: "label-1",
  projectId: project.id,
  name: "frontend",
  color: "blue",
  createdAt: project.createdAt,
};

function Fixture() {
  const [subPath, setSubPath] = useState("task/TSK-1");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, refresh] = useState(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        returnFocus.current = document.activeElement as HTMLElement;
        setQuery("");
        setOpen(true);
      }
      if (event.altKey && event.key === "2") {
        event.preventDefault();
        setSubPath("task/TSK-2");
      }
      if (event.altKey && event.key === "0") {
        event.preventDefault();
        setSubPath("all");
      }
    };
    const updated = () => refresh((value) => value + 1);
    window.addEventListener("keydown", handler);
    window.addEventListener("fixture-update", updated);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("fixture-update", updated);
    };
  }, []);
  const matches = TASKS_COMMANDS.filter(
    (entry) =>
      entry.id.startsWith("task-") &&
      entry.isAvailable?.(context) &&
      entry.title.toLowerCase().includes(query.toLowerCase()),
  );
  const select = () => {
    void matches[0]?.run(context);
    setOpen(false);
  };
  return (
    <>
      <div style={{ height: "90vh", width: "100vw" }}>
        <TasksAppShell subPath={subPath} />
      </div>
      <output aria-label="Fixture updates">{JSON.stringify(updates)}</output>
      <output aria-label="Fixture project updates">{JSON.stringify(projectUpdates)}</output>
      <output aria-label="Fixture delegations">{JSON.stringify(delegations)}</output>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "#0004" }} />
          <Dialog.Content
            style={{
              position: "fixed",
              top: 30,
              left: "10%",
              width: "80%",
              background: "var(--background)",
              padding: 16,
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              returnFocus.current?.focus();
            }}
          >
            <Dialog.Title>Fixture command palette</Dialog.Title>
            <Dialog.Description>
              SDK commands with a simulated host focus handoff.
            </Dialog.Description>
            <input
              aria-label="Find command"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  select();
                }
              }}
            />
            {matches.map((entry) => (
              <div key={entry.id}>{entry.title}</div>
            ))}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
const slot = renderSlot(
  { component: Fixture },
  {},
  {
    rpc: {
      listProjects: () => ({ projects: [{ ...project }] }),
      listFolders: () => ({ folders: [] }),
      listLabels: () => ({ labels: [label] }),
      listPresets: () => ({ presets: [] }),
      sidebarSummary: () => ({ projects: [] }),
      listTasks: (raw: unknown) => ({
        tasks: rpcInput(raw).parentTaskId ? [] : tasks,
        nextCursor: null,
      }),
      getTaskByKey: (raw) => ({
        task: tasks.find((task) => task.key === rpcInput(raw).taskKey) ?? null,
      }),
      getTask: () => ({ task: null }),
      listAttachments: () => ({ attachments: [] }),
      listTaskThreads: () => ({ taskThreads: [] }),
      listBbProjects: () => ({ bbProjects }),
      updateProject: (raw) => {
        const input = rpcInput(raw);
        projectUpdates.push(input);
        Object.assign(project, input);
        window.dispatchEvent(new Event("fixture-update"));
        queueMicrotask(() => slot.emitRealtime("projects:changed", {}));
        return { project: { ...project } };
      },
      delegate: (raw) => {
        delegations.push(rpcInput(raw));
        window.dispatchEvent(new Event("fixture-update"));
        throw new Error("Delegation is outside this fixture");
      },
      listTaskPullRequests: () => ({ pullRequests: [], unavailableThreadIds: [] }),
      updateTask: (raw) => {
        const input = rpcInput(raw);
        updates.push(input);
        const task = tasks.find((entry) => entry.id === input.taskId)!;
        Object.assign(task, input);
        window.dispatchEvent(new Event("fixture-update"));
        return { ok: true, task: { ...task } };
      },
    },
  },
);
