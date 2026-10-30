import { useEffect, useState } from "react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { TasksAppShell } from "../shell/app-shell.js";
import { aggregateTaskStats } from "../shared/task-stats.js";
import { rpcInput } from "../test-fixtures.js";
import {
  statsProjects,
  statsInputs,
  interruptedInputs,
  canceledInput,
  statsDetailTasks,
} from "./stats-data.js";
import "./stats-preview.css";

const params = new URLSearchParams(window.location.search);
const state = params.get("state") ?? "normal";
const transport = params.has("transport");
document.documentElement.dataset.theme = params.get("theme") ?? "dark";
const projects = state === "no-projects" ? [] : statsProjects;
const inputs =
  state === "empty" || state === "no-projects"
    ? []
    : [...statsInputs, canceledInput, ...(state === "interrupted" ? interruptedInputs : [])];
const tasks = statsDetailTasks(inputs);
let failed = state === "error";

function Fixture() {
  const [subPath, setSubPath] = useState(params.get("subPath") ?? "stats");
  useEffect(() => {
    let nextCall = 0;
    let frame: number;
    const followHostNavigation = () => {
      for (; nextCall < slot.navigateCalls.length; nextCall++) {
        const call = slot.navigateCalls[nextCall]!;
        if (call.method === "toPluginPanel" && call.path === "tasks")
          setSubPath(call.options?.subPath ?? "");
      }
      frame = requestAnimationFrame(followHostNavigation);
    };
    frame = requestAnimationFrame(followHostNavigation);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <>
      <p className="border-b border-border p-2 text-xs text-muted-foreground">
        Synthetic Stats fixture. No live tasks or installed plugin.
      </p>
      <div style={{ height: "calc(100vh - 36px)" }}>
        <TasksAppShell subPath={subPath} />
      </div>
      <output aria-label="Fixture route" hidden>
        {subPath}
      </output>
    </>
  );
}
const request = async (method: string, input: unknown) => {
  const response = await fetch(`/__stats_rpc/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
  if (!response.ok) throw new Error(`Fixture RPC ${method}: ${response.status}`);
  return response.json();
};
const rpc = {
  listProjects: () => ({ projects }),
  listFolders: () => ({ folders: [] }),
  listPresets: () => ({ presets: [] }),
  listLabels: () => ({ labels: [] }),
  listTasks: (raw: unknown) => ({
    tasks: rpcInput(raw).parentTaskId ? [] : tasks,
    nextCursor: null,
  }),
  listAttachments: () => ({ attachments: [] }),
  listTaskThreads: () => ({ taskThreads: [] }),
  listTaskPullRequests: () => ({ pullRequests: [], unavailableThreadIds: [] }),
  getTaskByKey: (raw: unknown) => ({
    task: tasks.find((task) => task.key === rpcInput(raw).taskKey) ?? null,
  }),
  getTaskStats: (raw: unknown) => {
    if (failed) {
      failed = false;
      throw new Error("Synthetic Stats request failed. Retry to load data.");
    }
    const { projectId, includeInterrupted } = rpcInput(raw);
    return aggregateTaskStats(
      inputs.filter((task) => !projectId || task.projectId === projectId),
      projects.filter((project) => !projectId || project.id === projectId),
      includeInterrupted === true,
    );
  },
  updateTask: (raw: unknown) => {
    const input = rpcInput(raw);
    const task = tasks.find((task) => task.id === input.taskId);
    if (!task) throw new Error("Synthetic task not found");
    Object.assign(task, input);
    return { ok: true, task: { ...task } };
  },
};
const slot = renderSlot(
  { component: Fixture },
  {},
  {
    rpc: transport
      ? Object.fromEntries(
          Object.keys(rpc).map((method) => [method, (input: unknown) => request(method, input)]),
        )
      : rpc,
  },
);
