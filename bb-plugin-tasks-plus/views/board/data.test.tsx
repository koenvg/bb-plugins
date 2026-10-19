// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { useState } from "react";
import { TasksRefreshProvider } from "../../shell/refresh.js";
import { makeTask, makeAttachment, rpcInput } from "../../test-fixtures.js";
import type { TaskThread } from "../../shared/contract.js";
import { useBoardData } from "./data.js";

const first = makeTask({ id: "task-1", projectId: "project-1" });
const second = makeTask({ id: "task-2", projectId: "project-2", key: "OTHER-1" });
function Probe() {
  const [projectId, setProjectId] = useState("project-1");
  const board = useBoardData(projectId);
  return (
    <>
      <button onClick={() => setProjectId("project-2")}>Switch tracker</button>
      <output>
        {JSON.stringify({
          tasks: board.tasks?.map((task) => task.key),
          statuses: board.tasks?.map((task) => task.status),
          meta: Object.fromEntries(board.metaByTaskId),
        })}
      </output>
    </>
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(cleanup);

it("keeps unfinished resource reads through a task-status update", async () => {
  const attachments = deferred<{ attachments: ReturnType<typeof makeAttachment>[] }>();
  const threads = deferred<{ taskThreads: TaskThread[] }>();
  const workingThread: TaskThread = {
    id: "link-1",
    taskId: first.id,
    threadId: "thr_working",
    presetName: "Working agent",
    title: "Pending work",
    liveStatus: "working",
    attachedAt: first.createdAt,
    updatedAt: first.updatedAt,
  };
  let task = first;
  const slot = renderSlot(
    {
      component: () => (
        <TasksRefreshProvider>
          <Probe />
        </TasksRefreshProvider>
      ),
    },
    {},
    {
      rpc: {
        listTasks: () => ({ tasks: [task], nextCursor: null }),
        listLabels: () => ({ labels: [] }),
        listAttachments: () => attachments.promise,
        listTaskThreads: () => threads.promise,
      },
    },
  );
  const output = () => JSON.parse(slot.container.querySelector("output")!.textContent!);
  await waitFor(() =>
    expect(slot.rpcCalls.filter((call) => call.method === "listTaskThreads")).toHaveLength(1),
  );
  task = { ...first, status: "done" };
  await slot.behavior.emitRealtime("tasks:changed", { taskId: task.id, projectId: task.projectId });
  await waitFor(() => expect(output().statuses).toEqual(["done"]));
  await act(async () => {
    attachments.resolve({ attachments: [makeAttachment(first.id)] });
    threads.resolve({ taskThreads: [workingThread] });
  });
  await waitFor(() => expect(output().meta[first.id]?.attachmentCount).toBe(1));
  await waitFor(() => expect(output().meta[first.id].workingThreads).toEqual([workingThread]));
  expect(slot.rpcCalls.filter((call) => call.method === "listAttachments")).toHaveLength(1);
  expect(slot.rpcCalls.filter((call) => call.method === "listTaskThreads")).toHaveLength(1);
  expect(slot.rpcCalls.filter((call) => call.method === "listLabels")).toHaveLength(1);
  expect(slot.rpcCalls.filter((call) => call.method === "listTasks")).toHaveLength(3);
});

it("rejects an attachment response overtaken by a real attachment change", async () => {
  const old = deferred<{ attachments: ReturnType<typeof makeAttachment>[] }>();
  let reads = 0;
  const slot = renderSlot(
    {
      component: () => (
        <TasksRefreshProvider>
          <Probe />
        </TasksRefreshProvider>
      ),
    },
    {},
    {
      rpc: {
        listTasks: (raw) => ({ tasks: rpcInput(raw).activeOnly ? [] : [first], nextCursor: null }),
        listLabels: () => ({ labels: [] }),
        listAttachments: () =>
          ++reads === 1
            ? old.promise
            : { attachments: [makeAttachment(first.id), makeAttachment(first.id)] },
      },
    },
  );
  const output = () => JSON.parse(slot.container.querySelector("output")!.textContent!);
  await waitFor(() => expect(reads).toBe(1));
  await slot.behavior.emitRealtime("tasks:changed", {
    taskId: first.id,
    projectId: first.projectId,
    resource: "attachments",
  });
  await waitFor(() => expect(output().meta[first.id]?.attachmentCount).toBe(2));
  await act(async () => old.resolve({ attachments: [] }));
  expect(output().meta[first.id].attachmentCount).toBe(2);
});

it("does not publish old tracker inventory or counts after a tracker switch", async () => {
  const old = deferred<{ attachments: ReturnType<typeof makeAttachment>[] }>();
  const next = deferred<{ tasks: (typeof first)[]; nextCursor: null }>();
  const slot = renderSlot(
    {
      component: () => (
        <TasksRefreshProvider>
          <Probe />
        </TasksRefreshProvider>
      ),
    },
    {},
    {
      rpc: {
        listTasks: (raw) =>
          rpcInput(raw).activeOnly
            ? { tasks: [], nextCursor: null }
            : rpcInput(raw).projectId === first.projectId
              ? { tasks: [first], nextCursor: null }
              : next.promise,
        listLabels: () => ({ labels: [] }),
        listAttachments: (raw) =>
          rpcInput(raw).taskId === first.id ? old.promise : { attachments: [] },
      },
    },
  );
  const output = () => JSON.parse(slot.container.querySelector("output")!.textContent!);
  await waitFor(() => expect(output().tasks).toEqual([first.key]));
  fireEvent.click(slot.getByRole("button", { name: "Switch tracker" }));
  expect(output().tasks).toBeUndefined();
  await act(async () => {
    old.resolve({ attachments: [makeAttachment(first.id)] });
    next.resolve({ tasks: [second], nextCursor: null });
  });
  await waitFor(() => expect(output().tasks).toEqual([second.key]));
  expect(output().meta[first.id]).toBeUndefined();
  expect(output().meta[second.id].attachmentCount).toBe(0);
});
