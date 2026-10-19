import { useRef, useState } from "react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { BoardView } from "../views/board/index";
import { ShortcutProvider } from "../shell/shortcut-provider";
import { TasksRefreshProvider, useTasksRefresh } from "../shell/refresh";
import "./preview.css";

function Fixture() {
  const root = useRef<HTMLDivElement>(null);
  const [projectId, setProjectId] = useState("project-1");
  const refresh = useTasksRefresh();
  return (
    <div ref={root} style={{ height: "100vh" }}>
      <button onClick={refresh.refresh} disabled={refresh.isRefreshing}>
        Refresh tasks
      </button>
      <button onClick={() => setProjectId(projectId === "project-1" ? "project-2" : "project-1")}>
        Switch tracker
      </button>
      <ShortcutProvider rootRef={root}>
        <BoardView projectId={projectId} />
      </ShortcutProvider>
    </div>
  );
}

const request = async (method: string, input?: unknown) => {
  const response = await fetch(`/__board_rpc/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
  if (!response.ok) throw new Error(`Fixture RPC ${method}: ${response.status}`);
  return response.json();
};
const slot = renderSlot(
  {
    component: () => (
      <TasksRefreshProvider>
        <Fixture />
      </TasksRefreshProvider>
    ),
  },
  {},
  {
    rpc: Object.fromEntries(
      [
        "listTasks",
        "listLabels",
        "listTaskThreads",
        "listAttachments",
        "listProjects",
        "boardMove",
        "updateTask",
      ].map((method) => [method, (input: unknown) => request(method, input)]),
    ),
  },
);
Object.assign(window, { boardFixture: slot.behavior });
