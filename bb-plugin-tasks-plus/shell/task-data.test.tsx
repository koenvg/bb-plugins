// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeTask } from "../test-fixtures.js";
import { TasksRefreshProvider } from "./refresh.js";
import { TaskDataProvider, useSessionProjects, useTaskPreview } from "./task-data.js";
import { project } from "./browse-workspace.test-support.js";

const app = await loadPluginApp(() => import("../app.js"));
afterEach(() => {
  cleanup();
  configure({ reactStrictMode: false });
});
function Projects() {
  const query = useSessionProjects();
  return <p>{query.isLoading ? "Loading inventory" : (query.data?.[0]?.name ?? query.error)}</p>;
}
function Preview() {
  const query = useTaskPreview("TSK-1");
  return <p>{query.isLoading ? "Loading preview" : (query.data?.title ?? query.error)}</p>;
}

describe("session data bindings", () => {
  it("keeps a fallback inventory live through React effect replay", async () => {
    configure({ reactStrictMode: true });
    const component = () => (
      <TasksRefreshProvider>
        <StrictMode>
          <Projects />
        </StrictMode>
      </TasksRefreshProvider>
    );
    const slot = renderSlot(
      { ...app.navPanels[0]!, component },
      { subPath: "" },
      {
        rpc: {
          listProjects: () => ({ projects: [{ ...project, name: "Fallback current inventory" }] }),
        },
      },
    );
    await slot.findByText("Fallback current inventory");
    expect(slot.inspection.rpcCalls.filter((call) => call.method === "listProjects")).toHaveLength(
      1,
    );
    expect(slot.queryByText("Loading inventory")).toBeNull();
  });

  it("keeps the provider preview live through React effect replay", async () => {
    configure({ reactStrictMode: true });
    const component = () => (
      <TasksRefreshProvider>
        <TaskDataProvider>
          <Preview />
        </TaskDataProvider>
      </TasksRefreshProvider>
    );
    const slot = renderSlot(
      { ...app.navPanels[0]!, component },
      { subPath: "" },
      {
        rpc: {
          getTaskByKey: () => ({
            task: makeTask({ key: "TSK-1", title: "Replay current preview" }),
          }),
        },
      },
    );
    await slot.findByText("Replay current preview");
    expect(slot.inspection.rpcCalls.filter((call) => call.method === "getTaskByKey")).toHaveLength(
      1,
    );
  });

  it("does not share matching keys across separate RPC binding sessions", async () => {
    const component = () => (
      <TasksRefreshProvider>
        <TaskDataProvider>
          <Preview />
        </TaskDataProvider>
      </TasksRefreshProvider>
    );
    const registration = { ...app.navPanels[0]!, component };
    const first = renderSlot(
      registration,
      { subPath: "" },
      {
        rpc: { getTaskByKey: () => ({ task: makeTask({ key: "TSK-1", title: "First binding" }) }) },
      },
    );
    await first.findByText("First binding");
    const second = renderSlot(
      registration,
      { subPath: "" },
      {
        rpc: {
          getTaskByKey: () => ({ task: makeTask({ key: "TSK-1", title: "Second binding" }) }),
        },
      },
    );
    await second.findByText("Second binding");
    expect(first.inspection.rpcCalls.filter((call) => call.method === "getTaskByKey")).toHaveLength(
      1,
    );
    expect(
      second.inspection.rpcCalls.filter((call) => call.method === "getTaskByKey"),
    ).toHaveLength(1);
    expect(first.container.textContent).toBe("First binding");
    expect(second.container.textContent).toBe("Second binding");
  });
});
