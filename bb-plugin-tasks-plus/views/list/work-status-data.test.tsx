// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { useTaskListMeta } from "./data.js";
import { TasksRefreshProvider, useTasksRefresh } from "../../shell/refresh.js";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import type { TaskWorkStatus } from "../../shared/contract.js";

const ID = "01HZZZZZZZZZZZZZZZZZZZZZT1";
const OTHER = "01HZZZZZZZZZZZZZZZZZZZZZT2";
const observation = (execution = "working"): TaskWorkStatus => ({
  availability: "available",
  pullRequests: {
    availability: "available",
    items: [],
    unavailableThreadIds: [],
  },
  observedAt: "2026-10-02T00:00:00.000Z",
  threads: [
    {
      threadId: "thr_worker",
      title: "Worker",
      presetName: "Worker",
      execution: execution as "working",
      archive: "unarchived",
    },
  ],
});
function Probe({ ids, scope }: { ids: string[]; scope: string }) {
  const query = useTaskListMeta(
    ids.map((id) => makeTask({ id })),
    scope,
  );
  const refresh = useTasksRefresh();
  return (
    <>
      <button onClick={refresh.refresh}>Refresh</button>
      <output>
        {JSON.stringify(query.data ? [...query.data] : "loading")}
      </output>
    </>
  );
}
function Root(props: { ids: string[]; scope: string }) {
  return (
    <TasksRefreshProvider>
      <Probe {...props} />
    </TasksRefreshProvider>
  );
}
const result = (ids: string[], execution = "working") => ({
  byTaskId: Object.fromEntries(ids.map((id) => [id, observation(execution)])),
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("visible work status loading", () => {
  it("deduplicates and chunks visible IDs without legacy, comment or media reads", async () => {
    const ids = Array.from(
      { length: 1001 },
      (_, i) => `01H${String(i).padStart(23, "0")}`,
    );
    const calls: string[][] = [];
    const slot = renderSlot(
      { component: Root },
      { ids: [...ids, ids[0]!], scope: "all" },
      {
        rpc: {
          listTaskWorkStatus: (raw) => {
            const taskIds = rpcInput(raw).taskIds as string[];
            calls.push(taskIds);
            return result(taskIds);
          },
        },
      },
    );
    await waitFor(() =>
      expect(slot.container.querySelector("output")!.textContent).toContain(
        ids[1000],
      ),
    );
    expect(calls.map((c) => c.length)).toEqual([500, 500, 1]);
    expect(new Set(calls.flat()).size).toBe(1001);
    expect(slot.inspection.rpcCalls.map((c) => c.method)).toEqual([
      "listTaskWorkStatus",
      "listTaskWorkStatus",
      "listTaskWorkStatus",
    ]);
  });

  it("refreshes at 60 seconds, invalidation, manual refresh and reconnect, then stops on unmount", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const slot = renderSlot(
      { component: Root },
      { ids: [ID], scope: "all" },
      {
        rpc: {
          listTaskWorkStatus: () => {
            calls++;
            return result([ID], calls === 1 ? "working" : "idle");
          },
        },
      },
    );
    await act(async () => {});
    expect(slot.container.querySelector("output")!.textContent).toContain(
      "working",
    );
    await act(() => vi.advanceTimersByTimeAsync(59_999));
    expect(calls).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(calls).toBe(2);
    expect(slot.container.querySelector("output")!.textContent).toContain(
      "idle",
    );
    await slot.behavior.emitRealtime("threads:changed", { taskId: ID });
    expect(calls).toBe(3);
    await slot.behavior.emitRealtime("tasks:changed", { taskId: ID });
    expect(calls).toBe(4);
    fireEvent.click(slot.getByText("Refresh"));
    await act(async () => {});
    expect(calls).toBe(5);
    await slot.behavior.setRealtimeConnectionState("reconnecting");
    await slot.behavior.setRealtimeConnectionState("connected");
    expect(calls).toBe(6);
    slot.lifecycle.unmount();
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(calls).toBe(6);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("coalesces overlapping requests and discards late previous-scope data", async () => {
    const releases: ((v: ReturnType<typeof result>) => void)[] = [];
    const calls: string[][] = [];
    const slot = renderSlot(
      { component: Root },
      { ids: [ID], scope: "one" },
      {
        rpc: {
          listTaskWorkStatus: (raw) => {
            calls.push(rpcInput(raw).taskIds as string[]);
            return new Promise<ReturnType<typeof result>>((resolve) =>
              releases.push(resolve),
            );
          },
        },
      },
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    await slot.behavior.emitRealtime("threads:changed", {});
    await slot.behavior.emitRealtime("threads:changed", {});
    slot.lifecycle.rerender(<Root ids={[OTHER]} scope="two" />);
    expect(calls).toHaveLength(1);
    await act(async () => releases.shift()!(result([ID])));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(slot.container.querySelector("output")!.textContent).not.toContain(
      ID,
    );
    expect(calls[1]).toEqual([OTHER]);
    await act(async () => releases.shift()!(result([OTHER], "failed")));
    expect(slot.container.querySelector("output")!.textContent).toContain(
      "failed",
    );
    expect(slot.container.querySelector("output")!.textContent).not.toContain(
      ID,
    );
  });

  it("rejects an old response even after returning to the same list scope", async () => {
    const releases: ((value: ReturnType<typeof result>) => void)[] = [];
    let calls = 0;
    const slot = renderSlot(
      { component: Root },
      { ids: [ID], scope: "one" },
      {
        rpc: {
          listTaskWorkStatus: () => {
            calls++;
            return new Promise<ReturnType<typeof result>>((resolve) =>
              releases.push(resolve),
            );
          },
        },
      },
    );
    await waitFor(() => expect(calls).toBe(1));
    slot.lifecycle.rerender(<Root ids={[OTHER]} scope="two" />);
    slot.lifecycle.rerender(<Root ids={[ID]} scope="one" />);
    await act(async () => releases.shift()!(result([ID], "failed")));
    expect(slot.container.querySelector("output")!.textContent).not.toContain(
      "failed",
    );
    expect(calls).toBe(2);
    await act(async () => releases.shift()!(result([ID], "idle")));
    expect(slot.container.querySelector("output")!.textContent).toContain(
      "idle",
    );
  });

  it("does not retain a current claim after a failed refresh and preserves identities as unavailable", async () => {
    let fail = false;
    const slot = renderSlot(
      { component: Root },
      { ids: [ID], scope: "all" },
      {
        rpc: {
          listTaskWorkStatus: () => {
            if (fail) throw new Error("offline");
            const value = result([ID]);
            value.byTaskId[ID]!.threads[0]!.archive = "archived";
            return value;
          },
        },
      },
    );
    await waitFor(() =>
      expect(slot.container.querySelector("output")!.textContent).toContain(
        "working",
      ),
    );
    fail = true;
    await slot.behavior.emitRealtime("threads:changed", {});
    await waitFor(() =>
      expect(slot.container.querySelector("output")!.textContent).toContain(
        "unavailable",
      ),
    );
    expect(slot.container.querySelector("output")!.textContent).toContain(
      "thr_worker",
    );
    expect(slot.container.querySelector("output")!.textContent).not.toContain(
      '"execution":"working"',
    );
    expect(slot.container.querySelector("output")!.textContent).toContain(
      '"archive":"unknown"',
    );
    expect(slot.container.querySelector("output")!.textContent).not.toContain(
      '"archive":"archived"',
    );
  });

  it.each(["scope change", "unmount"])(
    "finishes an interrupted chunk session after %s without reading hidden rows",
    async (reason) => {
      const ids = Array.from(
        { length: 501 },
        (_, i) => `01H${String(i).padStart(23, "0")}`,
      );
      const calls: Record<string, unknown>[] = [];
      let release!: (value: ReturnType<typeof result>) => void;
      const slot = renderSlot(
        { component: Root },
        { ids, scope: "all" },
        {
          rpc: {
            listTaskWorkStatus: (raw) => {
              const input = rpcInput(raw);
              calls.push(input);
              if (calls.length === 1)
                return new Promise<ReturnType<typeof result>>((resolve) => {
                  release = resolve;
                });
              return result(input.taskIds as string[], "idle");
            },
          },
        },
      );
      await waitFor(() => expect(calls).toHaveLength(1));
      const session = calls[0]!.refresh as { id: string; step: string };
      expect(session.step).toBe("start");
      if (reason === "unmount") slot.lifecycle.unmount();
      else slot.lifecycle.rerender(<Root ids={[OTHER]} scope="project" />);
      await act(async () => release(result(ids.slice(0, 500), "failed")));
      expect(calls[1]).toEqual({
        taskIds: [],
        refresh: { id: session.id, step: "finish" },
      });
      if (reason === "unmount") expect(calls).toHaveLength(2);
      else {
        expect(calls[2]).toEqual({ taskIds: [OTHER] });
        expect(slot.container.querySelector("output")!.textContent).toContain(
          "idle",
        );
        expect(
          slot.container.querySelector("output")!.textContent,
        ).not.toContain("failed");
      }
    },
  );

  it("retains known PR links but clears lifecycle and absence claims when refresh transport fails", async () => {
    const known = observation();
    known.pullRequests = {
      availability: "available",
      items: [
        {
          url: "https://github.com/acme/bb/pull/42",
          number: 42,
          title: "Work",
          state: "merged",
          updatedAt: "2026-10-02T00:00:00Z",
          threadIds: ["thr_worker"],
          details: "unavailable",
        },
      ],
      unavailableThreadIds: [],
    };
    let calls = 0;
    const slot = renderSlot(
      { component: Root },
      { ids: [ID], scope: "all" },
      {
        rpc: {
          listTaskWorkStatus: () => {
            if (++calls > 1) throw new Error("offline");
            return { byTaskId: { [ID]: known } };
          },
        },
      },
    );
    await waitFor(() =>
      expect(slot.container.querySelector("output")!.textContent).toContain(
        '"state":"merged"',
      ),
    );
    fireEvent.click(slot.getByText("Refresh"));
    await waitFor(() =>
      expect(slot.container.querySelector("output")!.textContent).toContain(
        '"state":"unknown"',
      ),
    );
    const row = JSON.parse(
      slot.container.querySelector("output")!.textContent!,
    )[0][1] as TaskWorkStatus;
    expect(row.pullRequests).toMatchObject({
      availability: "unavailable",
      items: [
        expect.objectContaining({
          url: "https://github.com/acme/bb/pull/42",
          state: "unknown",
        }),
      ],
      unavailableThreadIds: ["thr_worker"],
    });
  });
});
