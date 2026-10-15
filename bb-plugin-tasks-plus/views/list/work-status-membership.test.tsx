// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { TasksRefreshProvider, useTasksRefresh } from "../../shell/refresh.js";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import type { TaskWorkStatus } from "../../shared/contract.js";
import { useTaskListMeta } from "./work-status-data.js";

const A = "01HZZZZZZZZZZZZZZZZZZZZZT1";
const B = "01HZZZZZZZZZZZZZZZZZZZZZT2";
const C = "01HZZZZZZZZZZZZZZZZZZZZZT3";
const status = (execution: "idle" | "working" | "failed" = "working"): TaskWorkStatus => ({
  availability: "available",
  observedAt: "2026-10-02T00:00:00Z",
  threads: [
    {
      threadId: "thr_worker",
      title: "Worker",
      presetName: "Worker",
      execution,
      archive: "unarchived",
    },
  ],
  pullRequests: { availability: "available", items: [], unavailableThreadIds: [] },
});
const result = (ids: string[], execution: "idle" | "working" | "failed" = "working") => ({
  byTaskId: Object.fromEntries(ids.map((id) => [id, status(execution)])),
});
type Result = ReturnType<typeof result>;
function deferred() {
  let resolve!: (value: Result) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Result>((pass, fail) => {
    resolve = pass;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function fixture(
  ids: string[],
  handler: (input: Record<string, unknown>) => Result | Promise<Result>,
) {
  let latest!: ReturnType<typeof useTaskListMeta>;
  let sharedRefresh!: () => void;
  const history: ReturnType<typeof useTaskListMeta>[] = [];
  function Probe({ ids, scope }: { ids: string[]; scope: string }) {
    latest = useTaskListMeta(
      ids.map((id) => makeTask({ id })),
      scope,
    );
    sharedRefresh = useTasksRefresh().refresh;
    history.push(latest);
    return <button onClick={latest.refresh}>Refresh work</button>;
  }
  function Root(props: { ids: string[]; scope: string }) {
    return (
      <TasksRefreshProvider>
        <Probe {...props} />
      </TasksRefreshProvider>
    );
  }
  const calls: Record<string, unknown>[] = [];
  const slot = renderSlot(
    { component: Root },
    { ids, scope: "all" },
    {
      rpc: {
        listTaskWorkStatus: (raw) => {
          const input = rpcInput(raw);
          calls.push(input);
          return handler(input);
        },
      },
    },
  );
  return {
    slot,
    calls,
    history,
    get latest() {
      return latest;
    },
    sharedRefresh: () => sharedRefresh(),
    rerender: (ids: string[], scope = "all") =>
      slot.lifecycle.rerender(<Root ids={ids} scope={scope} />),
  };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("retains survivors immediately on shrink, reads only additions, and refetches evicted rows on reentry", async () => {
  let pending: ReturnType<typeof deferred> | undefined;
  const f = fixture([A, B], (input) => pending?.promise ?? result(input.taskIds as string[]));
  await waitFor(() => expect(f.latest.data?.size).toBe(2));
  const survivor = f.latest.data!.get(B);
  const start = f.history.length;
  f.rerender([B]);
  expect(f.calls).toEqual([{ taskIds: [A, B] }]);
  expect(f.latest.data?.get(B)).toBe(survivor);
  expect(f.latest.isLoading).toBe(false);
  pending = deferred();
  f.rerender([B, C]);
  expect(f.calls).toEqual([{ taskIds: [A, B] }, { taskIds: [C] }]);
  expect(f.latest.data?.get(B)).toBe(survivor);
  expect(f.latest.isLoading).toBe(true);
  await act(async () => pending!.resolve(result([C], "idle")));
  expect(f.latest.data?.get(C)?.threads[0]?.execution).toBe("idle");
  f.rerender([B]);
  pending = undefined;
  f.rerender([B, C]);
  await waitFor(() => expect(f.latest.isLoading).toBe(false));
  expect(f.calls).toEqual([{ taskIds: [A, B] }, { taskIds: [C] }, { taskIds: [C] }]);
  expect(f.latest.data?.get(C)?.threads[0]?.execution).toBe("working");
  expect(f.history.slice(start).every((snapshot) => snapshot.data?.get(B) === survivor)).toBe(true);
});

it("does not restart the polling deadline when membership changes", async () => {
  vi.useFakeTimers();
  const f = fixture([A, B], (input) => result(input.taskIds as string[]));
  await act(async () => {});
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  f.rerender([B]);
  expect(f.calls).toEqual([{ taskIds: [A, B] }]);
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(f.calls).toEqual([{ taskIds: [A, B] }, { taskIds: [B] }]);
  expect(f.latest.data?.get(B)?.threads[0]?.execution).toBe("working");
});

it.each(["missing", "full"])(
  "keeps a full refresh obligation when membership interrupts a %s pass",
  async (mode) => {
    const pending = deferred();
    const trailing = deferred();
    let count = 0;
    const f = fixture(mode === "missing" ? [A] : [A, B], (input) => {
      count++;
      return count === 2
        ? pending.promise
        : count === 3
          ? trailing.promise
          : result(input.taskIds as string[]);
    });
    await waitFor(() => expect(f.latest.isLoading).toBe(false));
    if (mode === "missing") f.rerender([A, B]);
    else fireEvent.click(f.slot.getByText("Refresh work"));
    if (mode === "missing") {
      await f.slot.behavior.emitRealtime("threads:changed", {});
      await f.slot.behavior.emitRealtime("threads:changed", {});
    }
    f.rerender([A]);
    expect(f.latest.data?.get(A)?.threads[0]?.execution).toBe("working");
    await act(async () => pending.resolve(result(mode === "missing" ? [B] : [A, B], "failed")));
    expect(f.calls).toEqual([
      { taskIds: mode === "missing" ? [A] : [A, B] },
      { taskIds: mode === "missing" ? [B] : [A, B] },
      { taskIds: [A] },
    ]);
    expect(f.latest.isLoading).toBe(true);
    expect(f.latest.data?.get(A)?.threads[0]?.execution).toBe("working");
    await act(async () => trailing.resolve(result([A], "idle")));
    expect(f.latest.isLoading).toBe(false);
    expect(f.latest.data?.get(A)?.threads[0]?.execution).toBe("idle");
    expect(f.calls).toHaveLength(3);
  },
);

it("rejects obsolete shared-generation responses before React processes the new generation and counts it once", async () => {
  const pending = deferred();
  const trailing = deferred();
  let count = 0;
  const f = fixture([A], () => (++count === 1 ? pending.promise : trailing.promise));
  await waitFor(() => expect(f.calls).toHaveLength(1));
  await act(async () => {
    f.sharedRefresh();
    pending.resolve(result([A], "failed"));
    await Promise.resolve();
  });
  expect(f.calls).toEqual([{ taskIds: [A] }, { taskIds: [A] }]);
  expect(f.latest.isLoading).toBe(true);
  expect(
    f.history.some((snapshot) => snapshot.data?.get(A)?.threads[0]?.execution === "failed"),
  ).toBe(false);
  await act(async () => trailing.resolve(result([A], "idle")));
  expect(f.latest.data?.get(A)?.threads[0]?.execution).toBe("idle");
  expect(f.latest.isLoading).toBe(false);
  expect(f.calls).toHaveLength(2);
});

it("keeps an owning row's error across successful additions until that row is refetched or removed", async () => {
  let fail = true;
  const f = fixture([A], (input) => {
    if (fail) throw new Error("offline A");
    return result(input.taskIds as string[]);
  });
  await waitFor(() => expect(f.latest.error).toContain("offline A"));
  expect(f.latest.data?.get(A)?.availability).toBe("unavailable");
  expect(f.latest.isLoading).toBe(false);
  fail = false;
  f.rerender([A, B]);
  await waitFor(() => expect(f.latest.data?.get(B)?.availability).toBe("available"));
  expect(f.latest.error).toContain("offline A");
  expect(f.calls).toEqual([{ taskIds: [A] }, { taskIds: [B] }]);
  fireEvent.click(f.slot.getByText("Refresh work"));
  await waitFor(() => expect(f.latest.error).toBeNull());
  expect(f.latest.data?.get(A)?.availability).toBe("available");
  fail = true;
  fireEvent.click(f.slot.getByText("Refresh work"));
  await waitFor(() => expect(f.latest.error).toContain("offline A"));
  fail = false;
  f.rerender([C]);
  await waitFor(() => expect(f.latest.data?.get(C)?.availability).toBe("available"));
  expect(f.latest.error).toBeNull();
  expect([...f.latest.data!.keys()]).toEqual([C]);
});

it("sizes chunk sessions by missing IDs rather than total retained membership", async () => {
  const ids = Array.from({ length: 500 }, (_, i) => `01H${String(i).padStart(23, "0")}`);
  const f = fixture(ids, (input) => result(input.taskIds as string[]));
  await waitFor(() => expect(f.latest.data?.size).toBe(500));
  f.rerender([...ids, C]);
  await waitFor(() => expect(f.latest.data?.size).toBe(501));
  expect(f.calls).toEqual([{ taskIds: [...ids].sort() }, { taskIds: [C] }]);
  expect(f.latest.data?.get(C)?.threads[0]?.execution).toBe("working");
});

it("ages rich PR claims during membership churn while a full refresh remains pending", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  const known = status();
  known.pullRequests.items.push({
    url: "https://github.com/acme/bb/pull/42",
    number: 42,
    title: "Work",
    state: "open",
    updatedAt: "2026-10-02T12:00:00Z",
    threadIds: ["thr_worker"],
    details: "available",
    rich: {
      refreshedAt: "2026-10-02T11:01:00Z",
      conditions: [],
      readiness: "ready",
      checks: { failed: 0, running: 0, cancelled: 0, passed: 1, skipped: 0, failedNames: [] },
      reviewers: { pending: 0, approved: 1, changesRequested: 0, pendingNames: [] },
    },
  });
  const pending = deferred();
  let calls = 0;
  const f = fixture([A, B], () =>
    ++calls === 1 ? { byTaskId: { [A]: known, [B]: status() } } : pending.promise,
  );
  await act(async () => {});
  expect(f.latest.data?.get(A)?.pullRequests.items[0]?.details).toBe("available");
  const beforeExpiry = f.latest.data?.get(A);
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  f.rerender([A]);
  expect(f.latest.data?.get(A)?.pullRequests.items[0]?.details).toBe("available");
  expect(f.latest.data?.get(A)).toBe(beforeExpiry);
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(f.latest.data?.get(A)?.pullRequests.items[0]?.details).toBe("stale");
  await act(async () => pending.reject(new Error("offline")));
  expect(f.latest.data?.get(A)?.pullRequests.items[0]).toMatchObject({
    state: "unknown",
    details: "stale",
  });
  expect(f.latest.isLoading).toBe(false);
  expect(f.calls.map((call) => call.taskIds)).toEqual([[A, B], [A, B], [A]]);
});
