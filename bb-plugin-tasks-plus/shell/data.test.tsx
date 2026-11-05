// @vitest-environment jsdom
import { useLayoutEffect } from "react";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Task } from "../shared/contract.js";
import { makeTask, rpcInput } from "../test-fixtures.js";
import { useTasksQuery, useTasksQueryWithRefresh } from "./data.js";
import { TasksRefreshProvider, useTasksRefresh, useTasksRefreshSource } from "./refresh.js";

interface Frame {
  taskKey: string;
  resultKey: string | null;
  isLoading: boolean;
  error: string | null;
}
interface ProbeProps {
  taskKey: string;
  onFrame: (frame: Frame) => void;
}

function Probe({ taskKey, onFrame }: ProbeProps) {
  const query = useTasksQuery(
    async (rpc) => (await rpc.call("getTaskByKey", { taskKey })).task,
    ["tasks:changed"],
    [taskKey],
  );
  const refresh = useTasksRefresh();
  const frame: Frame = {
    taskKey,
    resultKey: query.data?.key ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
  // Capture what a caller sees before passive fetching effects can correct it.
  useLayoutEffect(() => {
    onFrame(frame);
  });
  return (
    <>
      <output aria-label="Query">{JSON.stringify(frame)}</output>
      <button onClick={query.refresh}>Retry query</button>
      <button onClick={refresh.refresh}>Refresh tasks</button>
    </>
  );
}
function Root(props: ProbeProps) {
  return (
    <TasksRefreshProvider>
      <Probe {...props} />
    </TasksRefreshProvider>
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const first = makeTask();
const second = makeTask({ key: "TSK-2", number: 2 });
type Response = { task: Task | null };
function setup(load: (key: string) => Response | Promise<Response>) {
  const frames: Frame[] = [];
  const onFrame = (frame: Frame) => frames.push(frame);
  const slot = renderSlot(
    { component: Root },
    { taskKey: first.key, onFrame },
    { rpc: { getTaskByKey: (raw) => load(rpcInput(raw).taskKey as string) } },
  );
  return {
    slot,
    frames,
    change(key: string) {
      slot.lifecycle.rerender(<Root taskKey={key} onFrame={onFrame} />);
    },
    current: () => JSON.parse(slot.getByLabelText("Query").textContent!) as Frame,
  };
}
afterEach(cleanup);

describe("Tasks query identity", () => {
  it("keeps retained results loading from the first render with changed inputs", async () => {
    const pending = deferred<Response>();
    const probe = setup((key) => (key === first.key ? { task: first } : pending.promise));
    await waitFor(() => expect(probe.current().isLoading).toBe(false));

    probe.change(second.key);
    expect(probe.current()).toEqual({
      taskKey: second.key,
      resultKey: first.key,
      isLoading: true,
      error: null,
    });
    expect(probe.frames.filter((frame) => frame.taskKey === second.key)).not.toContainEqual(
      expect.objectContaining({ isLoading: false }),
    );

    await act(async () => pending.resolve({ task: second }));
    expect(probe.current()).toEqual({
      taskKey: second.key,
      resultKey: second.key,
      isLoading: false,
      error: null,
    });
  });

  it("does not report an earlier input's error while new inputs load", async () => {
    const pending = deferred<Response>();
    const probe = setup((key) =>
      key === first.key ? Promise.reject(new Error("First request failed")) : pending.promise,
    );
    await waitFor(() => expect(probe.current().error).toBe("First request failed"));

    probe.change(second.key);
    expect(probe.frames.filter((frame) => frame.taskKey === second.key)).not.toContainEqual(
      expect.objectContaining({ error: "First request failed" }),
    );
    expect(probe.current()).toEqual({
      taskKey: second.key,
      resultKey: null,
      isLoading: true,
      error: null,
    });

    await act(async () => pending.reject(new Error("Second request failed")));
    expect(probe.current()).toEqual({
      taskKey: second.key,
      resultKey: null,
      isLoading: false,
      error: "Second request failed",
    });
  });

  it.each([false, true])(
    "retains data only for matching inputs after a failed request, changed inputs=%s",
    async (changed) => {
      let response: Response | Promise<Response> = { task: first };
      const probe = setup(() => response);
      await waitFor(() => expect(probe.current().isLoading).toBe(false));
      const pending = deferred<Response>();
      response = pending.promise;
      if (changed) probe.change(second.key);
      else await probe.slot.behavior.emitRealtime("tasks:changed", {});
      expect(probe.current().isLoading).toBe(true);
      expect(probe.current().resultKey).toBe(first.key);

      await act(async () => pending.reject(new Error("Request failed")));
      expect(probe.current()).toEqual({
        taskKey: changed ? second.key : first.key,
        resultKey: changed ? null : first.key,
        isLoading: false,
        error: "Request failed",
      });

      response = { task: changed ? second : first };
      fireEvent.click(probe.slot.getByRole("button", { name: "Retry query" }));
      await waitFor(() =>
        expect(probe.current()).toEqual({
          taskKey: changed ? second.key : first.key,
          resultKey: changed ? second.key : first.key,
          isLoading: false,
          error: null,
        }),
      );
    },
  );

  it.each(["success", "failure"] as const)(
    "ignores a late %s for previous inputs",
    async (outcome) => {
      const pending = deferred<Response>();
      const probe = setup((key) => (key === first.key ? pending.promise : { task: second }));
      probe.change(second.key);
      await waitFor(() => expect(probe.current().isLoading).toBe(false));

      await act(async () => {
        if (outcome === "success") pending.resolve({ task: first });
        else pending.reject(new Error("Old request failed"));
      });
      expect(probe.current()).toEqual({
        taskKey: second.key,
        resultKey: second.key,
        isLoading: false,
        error: null,
      });
    },
  );

  it("keeps results loading from the first render of a manual refresh", async () => {
    let response: Response | Promise<Response> = { task: first };
    const probe = setup(() => response);
    await waitFor(() => expect(probe.current().isLoading).toBe(false));
    probe.frames.length = 0;
    const pending = deferred<Response>();
    response = pending.promise;

    fireEvent.click(probe.slot.getByRole("button", { name: "Refresh tasks" }));
    expect(probe.frames).not.toContainEqual(expect.objectContaining({ isLoading: false }));
    expect(probe.current().resultKey).toBe(first.key);
    await act(async () => pending.resolve({ task: null }));
    expect(probe.current()).toEqual({
      taskKey: first.key,
      resultKey: null,
      isLoading: false,
      error: null,
    });
  });
});

function StandaloneProbe() {
  const refresh = useTasksRefreshSource();
  const query = useTasksQueryWithRefresh(
    refresh,
    async (rpc) => (await rpc.call("getTaskByKey", { taskKey: first.key })).task,
    ["tasks:changed"],
  );
  return (
    <>
      <output aria-label="Standalone query">
        {JSON.stringify({
          key: query.data?.key ?? null,
          error: query.error,
          loading: query.isLoading,
        })}
      </output>
      <button onClick={refresh.refresh} disabled={refresh.isRefreshing}>
        Refresh standalone
      </button>
    </>
  );
}

describe("Tasks query without a context provider", () => {
  it("shares generation accounting and retains accepted data on read failure", async () => {
    let response: Response | Promise<Response> = { task: first };
    const slot = renderSlot(
      { component: StandaloneProbe },
      {},
      { rpc: { getTaskByKey: () => response } },
    );
    const current = () => JSON.parse(slot.getByLabelText("Standalone query").textContent!);
    await waitFor(() => expect(current()).toEqual({ key: first.key, error: null, loading: false }));
    const pending = deferred<Response>();
    response = pending.promise;
    fireEvent.click(slot.getByRole("button", { name: "Refresh standalone" }));
    expect(current()).toEqual({ key: first.key, error: null, loading: true });
    expect(slot.getByRole("button").hasAttribute("disabled")).toBe(true);
    await act(async () => pending.reject(new Error("offline")));
    expect(current()).toEqual({ key: first.key, error: "offline", loading: false });
    expect(slot.getByRole("button").hasAttribute("disabled")).toBe(false);
    response = { task: second };
    await slot.behavior.emitRealtime("tasks:changed", {});
    await waitFor(() =>
      expect(current()).toEqual({ key: second.key, error: null, loading: false }),
    );
  });

  it("keeps the strict provider guard on the context adapter", () => {
    function MissingProvider() {
      useTasksRefresh();
      return null;
    }
    expect(() => renderSlot({ component: MissingProvider }, {})).toThrow(
      "useTasksRefresh must be used within TasksRefreshProvider",
    );
  });
});
