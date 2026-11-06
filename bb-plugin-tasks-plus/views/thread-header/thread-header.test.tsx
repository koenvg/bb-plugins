// @vitest-environment jsdom
import { useLayoutEffect } from "react";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { experimental_useAppPanel, useBbNavigate, useSdk } from "@get-bb/plugin-sdk/app";
import type { PluginThreadActionTarget } from "@get-bb/plugin-sdk/app";
import type { Task } from "../../shared/contract.js";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import { TasksRefreshProvider, useTasksRefresh } from "../../shell/refresh.js";
import { threadTaskAction, type ThreadTaskData } from "./index.js";

const app = await loadPluginApp(() => import("../../app"));
afterEach(cleanup);
const reviewTask = makeTask({
  key: "ABC-12",
  number: 12,
  title: "Show the task chip",
  status: "in_review",
});
const laterTask = makeTask({ key: "ABC-15", number: 15, title: "Linked later", status: "todo" });

function target(id: string): PluginThreadActionTarget {
  return {
    id,
    projectId: "prj_1",
    parentThreadId: null,
    parentNotifications: "auto",
    archivedAt: null,
    pinnedAt: null,
    sectionId: null,
    isUnread: false,
    status: "idle",
    environment: null,
  };
}
interface ProbeProps {
  threadIds: readonly string[];
  onData?: (data: ThreadTaskData) => void;
}
function Probe({ threadIds, onData }: ProbeProps) {
  const data = threadTaskAction.useData!({ threadIds });
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const experimental_panel = experimental_useAppPanel();
  useLayoutEffect(() => {
    onData?.(data);
  }, [data, onData]);
  return (
    <>
      {threadIds.map((id) => {
        const item = threadTaskAction.item({
          thread: target(id),
          data,
          sdk,
          navigate,
          experimental_panel,
        });
        return item ? (
          <button
            key={id}
            data-thread={id}
            data-icon={item.icon}
            title={item.detail}
            onClick={() => void item.run({ requestRename: () => {} })}
          >
            {item.label}
          </button>
        ) : null;
      })}
    </>
  );
}
function RefreshButton() {
  const refresh = useTasksRefresh();
  return (
    <button onClick={refresh.refresh} disabled={refresh.isRefreshing}>
      Refresh tasks
    </button>
  );
}
function RefreshRoot() {
  return (
    <TasksRefreshProvider>
      <RefreshButton />
    </TasksRefreshProvider>
  );
}
type Response = { tasks: Task[] };
function deferred() {
  let resolve!: (value: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function setup(load: (id: string) => Response | Promise<Response>, ids = ["A"], accepted = true) {
  const frames: ThreadTaskData[] = [];
  const onData = (data: ThreadTaskData) => frames.push(data);
  const openTab = vi.fn(() => accepted);
  const slot = renderSlot(
    { component: Probe },
    { threadIds: ids, onData },
    {
      rpc: { getTasksForThread: (raw) => load(String(rpcInput(raw).threadId)) },
      experimental_panel: { openTab },
    },
  );
  return {
    slot,
    frames,
    openTab,
    current: () => frames.at(-1)!,
    change: (threadIds: string[]) =>
      slot.lifecycle.rerender(<Probe threadIds={threadIds} onData={onData} />),
  };
}
async function invalidate(slot: ReturnType<typeof setup>["slot"], channel = "tasks:changed") {
  await slot.behavior.emitRealtime(channel, {});
}

describe("Thread header task action", () => {
  it("registers the production semantic header action", () => {
    expect(app.threadActions).toHaveLength(1);
    expect(app.threadActions[0]).toMatchObject({
      id: "task",
      title: "Task",
      icon: "ListTodo",
      group: "open",
      placement: "header",
      useData: threadTaskAction.useData,
      item: threadTaskAction.item,
    });
  });

  it.each([true, false])(
    "opens the first linked Done task read-only, accepted=%s",
    async (accepted) => {
      const done = { ...reviewTask, status: "done" as const };
      const probe = setup(() => ({ tasks: [done, laterTask] }), ["A"], accepted);
      const button = await probe.slot.findByRole("button", { name: "ABC-12 Done +1" });
      expect(button.getAttribute("title")).toBe("Show the task chip");
      expect(button.getAttribute("data-icon")).toBe("ListTodo");
      expect(probe.slot.queryByText(/ABC-15/)).toBeNull();
      fireEvent.click(button);
      const options = {
        tab: { id: "task", context: { kind: "thread" }, availability: "action" },
        title: "ABC-12",
        params: { taskKey: "ABC-12" },
      };
      expect(probe.openTab).toHaveBeenCalledExactlyOnceWith(options);
      expect(probe.slot.inspection.experimental_panelCalls).toEqual([
        { method: "openTab", options },
      ]);
      expect(probe.slot.inspection.navigateCalls).toEqual(
        accepted
          ? []
          : [{ method: "toPluginPanel", path: "tasks", options: { subPath: "task/ABC-12" } }],
      );
      expect(probe.slot.inspection.rpcCalls).toEqual([
        { method: "getTasksForThread", input: { threadId: "A" } },
      ]);
    },
  );

  it("adds links, updates status, and clears a successful empty unlink", async () => {
    let tasks: Task[] = [];
    const { slot, current } = setup(() => ({ tasks }));
    await waitFor(() => expect(current().get("A")).toEqual([]));
    expect(slot.queryByRole("button")).toBeNull();
    tasks = [reviewTask, laterTask];
    await invalidate(slot, "threads:changed");
    await slot.findByRole("button", { name: "ABC-12 In Review +1" });
    tasks = [{ ...reviewTask, status: "done" }];
    await invalidate(slot);
    await slot.findByRole("button", { name: "ABC-12 Done" });
    tasks = [];
    await invalidate(slot, "threads:changed");
    await waitFor(() => expect(slot.queryByRole("button")).toBeNull());
    expect(current().get("A")).toEqual([]);
    expect(slot.inspection.rpcCalls.map(({ method }) => method)).toEqual(
      Array(4).fill("getTasksForThread"),
    );
  });

  it("isolates partial failures and retains each published array on total failure", async () => {
    let phase = 0;
    const probe = setup(
      (id) => {
        if (phase === 2 || (phase === 1 && id === "A")) throw new Error("offline");
        return { tasks: id === "A" ? [reviewTask] : phase === 1 ? [] : [laterTask] };
      },
      ["A", "B"],
    );
    await waitFor(() => expect(probe.current().size).toBe(2));
    const published = probe.current().get("A");
    phase = 1;
    await invalidate(probe.slot);
    await waitFor(() => expect(probe.current().get("B")).toEqual([]));
    expect(probe.current().get("A")).toBe(published);
    phase = 2;
    await invalidate(probe.slot);
    await waitFor(() => expect(probe.slot.inspection.rpcCalls).toHaveLength(6));
    expect(probe.current().get("A")).toBe(published);
    expect(probe.current().get("B")).toEqual([]);
  });

  it("leaves first failures absent without hiding another thread's successful read", async () => {
    const probe = setup(
      (id) => {
        if (id === "A") throw new Error("offline");
        return { tasks: [laterTask] };
      },
      ["A", "B"],
    );
    await probe.slot.findByRole("button", { name: "ABC-15 Todo" });
    expect([...probe.current().keys()]).toEqual(["B"]);
  });

  it("projects overlapping visible IDs while pending and never assigns A's data to C", async () => {
    const pendingB = deferred();
    const pendingC = deferred();
    let phase = 0;
    const probe = setup(
      (id) =>
        phase === 0
          ? { tasks: id === "A" ? [reviewTask] : [laterTask] }
          : id === "B"
            ? pendingB.promise
            : pendingC.promise,
      ["A", "B"],
    );
    await waitFor(() => expect(probe.current().size).toBe(2));
    const publishedB = probe.current().get("B");
    phase = 1;
    const start = probe.frames.length;
    probe.change(["B", "C"]);
    expect([...probe.current().keys()]).toEqual(["B"]);
    expect(probe.current().get("B")).toBe(publishedB);
    await act(async () => {
      pendingB.reject(new Error("offline"));
      pendingC.reject(new Error("offline"));
    });
    expect([...probe.current().keys()]).toEqual(["B"]);
    expect(probe.frames.slice(start).every((data) => !data.has("A") && !data.has("C"))).toBe(true);
  });

  it("does not retain individual results from an obsolete aggregate", async () => {
    const oldA = deferred();
    const oldB = deferred();
    let phase = 0;
    const probe = setup(
      (id) => {
        if (phase === 0) return { tasks: id === "A" ? [reviewTask] : [laterTask] };
        if (phase === 1) return id === "A" ? oldA.promise : oldB.promise;
        throw new Error("offline");
      },
      ["A", "B"],
    );
    await waitFor(() => expect(probe.current().size).toBe(2));
    const published = probe.current().get("B");
    phase = 1;
    await invalidate(probe.slot);
    await act(async () => oldB.resolve({ tasks: [reviewTask] }));
    expect(probe.current().get("B")).toBe(published);
    phase = 2;
    probe.change(["B", "C"]);
    await waitFor(() => expect(probe.slot.inspection.rpcCalls).toHaveLength(6));
    await act(async () => oldA.resolve({ tasks: [] }));
    expect([...probe.current().keys()]).toEqual(["B"]);
    expect(probe.current().get("B")).toBe(published);
    await invalidate(probe.slot);
    await waitFor(() => expect(probe.slot.inspection.rpcCalls).toHaveLength(8));
    expect([...probe.current().keys()]).toEqual(["B"]);
    expect(probe.current().get("B")).toBe(published);
  });

  it("shares separate-provider manual refresh, reconnect, and unmount cleanup", async () => {
    let tasks = [reviewTask];
    const probe = setup(() => ({ tasks }));
    await probe.slot.findByRole("button", { name: "ABC-12 In Review" });
    const refresh = renderSlot({ component: RefreshRoot }, {});
    tasks = [laterTask];
    fireEvent.click(refresh.getByRole("button", { name: "Refresh tasks" }));
    await probe.slot.findByRole("button", { name: "ABC-15 Todo" });
    await waitFor(() =>
      expect(refresh.getByRole("button", { name: "Refresh tasks" }).hasAttribute("disabled")).toBe(
        false,
      ),
    );
    tasks = [reviewTask];
    await probe.slot.behavior.setRealtimeConnectionState("reconnecting");
    await probe.slot.behavior.setRealtimeConnectionState("connected");
    await probe.slot.findByRole("button", { name: "ABC-12 In Review" });
    probe.slot.lifecycle.unmount();
    const reads = probe.slot.inspection.rpcCalls.length;
    fireEvent.click(refresh.getByRole("button", { name: "Refresh tasks" }));
    await refresh.behavior.setRealtimeConnectionState("reconnecting");
    await refresh.behavior.setRealtimeConnectionState("connected");
    await waitFor(() =>
      expect(refresh.getByRole("button", { name: "Refresh tasks" }).hasAttribute("disabled")).toBe(
        false,
      ),
    );
    expect(probe.slot.inspection.rpcCalls).toHaveLength(reads);
  });
});
