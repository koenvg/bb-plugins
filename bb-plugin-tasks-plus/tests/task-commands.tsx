import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginCommandContext } from "@get-bb/plugin-sdk/app";
import { TasksAppShell } from "../shell/app-shell";
import { TASKS_COMMANDS } from "../shell/commands";
import { makeTask, rpcInput } from "../test-fixtures";
import { tasksRpcContract } from "../shared/contract";
import "./preview.css";

const durationTransport = new URLSearchParams(window.location.search).has("durationTransport");
if (durationTransport)
  document.documentElement.dataset.theme =
    new URLSearchParams(window.location.search).get("theme") ?? "light";
async function durationRequest(method: string, input: unknown) {
  const response = await fetch(`/__task_duration_rpc/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? null),
  });
  if (!response.ok) throw new Error(`Fixture RPC ${method}: ${response.status}`);
  return response.json();
}

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
const refreshOrder = new URLSearchParams(window.location.search).get("refreshOrder");
let previewReads = 0;
let deliveredEvents = 0;
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 60));
async function deliverChange(changeId?: string) {
  await slot.behavior.emitRealtime("tasks:changed", {
    taskId: "task-1",
    ...(changeId ? { changeId } : {}),
  });
  deliveredEvents++;
  window.dispatchEvent(new Event("fixture-update"));
}
const label = {
  id: "label-1",
  projectId: project.id,
  name: "frontend",
  color: "blue",
  createdAt: project.createdAt,
};

const presets = [
  {
    id: "worker",
    name: "Worker",
    providerId: "fixture-provider",
    modelId: "fixture-model",
    reasoningLevel: null,
    serviceTier: null,
    permissionMode: "accept-edits",
    environmentKind: "project-default",
    baseBranch: null,
    machineId: null,
    instructions: "",
    builtin: false,
    createdAt: project.createdAt,
  },
];
type PendingCommand = (() => void) | null;
function Fixture() {
  const [subPath, setSubPath] = useState("task/TSK-1");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, refresh] = useState(0);
  const [paletteHandoffs, setPaletteHandoffs] = useState(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const pendingRunRef = useRef<PendingCommand>(null);
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
      if (event.altKey && event.key === "9") {
        event.preventDefault();
        window.dispatchEvent(new Event("fixture-finish-delegation"));
      }
    };
    const updated = () => refresh((value) => value + 1);
    const accepted = () => {
      const call = slot.inspection.navigateCalls.at(-1);
      if (call?.method === "toPluginPanel") setSubPath(call.options?.subPath ?? "");
    };
    window.addEventListener("fixture-accept-navigation", accepted);
    window.addEventListener("keydown", handler);
    window.addEventListener("fixture-update", updated);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("fixture-update", updated);
      window.removeEventListener("fixture-accept-navigation", accepted);
    };
  }, []);
  const matches = TASKS_COMMANDS.filter(
    (entry) =>
      entry.id.startsWith("task-") &&
      entry.isAvailable?.(context) &&
      entry.title.toLowerCase().includes(query.toLowerCase()),
  );
  const select = () => {
    const command = matches[0];
    pendingRunRef.current = command ? () => void command.run(context) : null;
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
      <output aria-label="Fixture palette handoffs">{paletteHandoffs}</output>
      {refreshOrder && (
        <>
          <output aria-label="Preview reads">{previewReads}</output>
          <output aria-label="Delivered events">{deliveredEvents}</output>
          <button
            onClick={() => {
              tasks[0] = {
                ...tasks[0]!,
                title: "External edit",
                updatedAt: "2026-10-20T00:00:00Z",
              };
              void deliverChange();
            }}
          >
            External task edit
          </button>
        </>
      )}
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
              const handoff = () => {
                const pending = pendingRunRef.current;
                pendingRunRef.current = null;
                returnFocus.current?.focus();
                setPaletteHandoffs((value) => value + 1);
                pending?.();
              };
              if (new URLSearchParams(window.location.search).has("delayedPaletteHandoff"))
                window.setTimeout(handoff, 150);
              else handoff();
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
      listPresets: () => ({ presets }),
      sidebarSummary: () => ({ projects: [] }),
      listTasks: (raw: unknown) => ({
        tasks: rpcInput(raw).parentTaskId ? [] : tasks,
        nextCursor: null,
      }),
      getTaskByKey: async (raw) => {
        if (refreshOrder) {
          previewReads++;
          window.dispatchEvent(new Event("fixture-update"));
          await pause();
        }
        return { task: tasks.find((task) => task.key === rpcInput(raw).taskKey) ?? null };
      },
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
      delegate: async (raw) => {
        delegations.push(rpcInput(raw));
        window.dispatchEvent(new Event("fixture-update"));
        await new Promise<void>((resolve) => {
          window.addEventListener("fixture-finish-delegation", () => resolve(), { once: true });
        });
        return { ok: true };
      },
      listTaskPullRequests: () => ({ pullRequests: [], unavailableThreadIds: [] }),
      updateTask: async (raw) => {
        const input = rpcInput(raw);
        updates.push(input);
        const task = tasks.find((entry) => entry.id === input.taskId)!;
        Object.assign(task, input);
        window.dispatchEvent(new Event("fixture-update"));
        if (refreshOrder) {
          const changeId = `fixture-save-${updates.length}`;
          if (refreshOrder === "event-first") {
            await deliverChange(changeId);
            await pause();
          } else {
            void pause().then(() => deliverChange(changeId));
          }
          return { ok: true, task: { ...task }, changeId };
        }
        return { ok: true, task: { ...task } };
      },
      ...(durationTransport
        ? Object.fromEntries(
            Object.keys(tasksRpcContract).map((method) => [
              method,
              (input: unknown) => durationRequest(method, input),
            ]),
          )
        : {}),
    },
  },
);
if (durationTransport) Object.assign(window, { taskDurationFixture: slot.behavior });
