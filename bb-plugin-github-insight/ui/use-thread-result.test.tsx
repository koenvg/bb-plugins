// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useThreadResult, type LoadMode } from "./use-thread-result";

afterEach(cleanup);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("thread result refresh ownership", () => {
  it("reconciles a realtime reload after refresh without cancelling its result", async () => {
    const pending = deferred<{ head: string }>();
    let current = { head: "a" };
    const fetch = vi.fn(async (_id: string, mode: LoadMode) => mode === "refresh" ? pending.promise : current);
    const hook = renderHook(() => useThreadResult("a", fetch));
    await waitFor(() => expect(hook.result.current.result).toEqual(current));
    let refresh!: ReturnType<typeof hook.result.current.refresh>;
    act(() => { refresh = hook.result.current.refresh(); });
    current = { head: "b" };
    act(() => { hook.result.current.reload(); hook.result.current.reload(); });
    await act(async () => { pending.resolve(current); await refresh; });
    expect(await refresh).toEqual(current);
    expect(hook.result.current.result).toEqual(current);
    expect(fetch.mock.calls.map(([, mode]) => mode)).toEqual(["load", "refresh", "load"]);
    expect(hook.result.current.refreshing).toBe(false);
  });

  it("uses newer cache data when another update follows the refresh snapshot", async () => {
    const pending = deferred<{ head: string }>();
    let current = { head: "a" };
    const fetch = vi.fn(async (_id: string, mode: LoadMode) => mode === "refresh" ? pending.promise : current);
    const hook = renderHook(() => useThreadResult("a", fetch));
    await waitFor(() => expect(hook.result.current.result).toEqual(current));
    let refresh!: ReturnType<typeof hook.result.current.refresh>;
    act(() => { refresh = hook.result.current.refresh(); });
    current = { head: "c" };
    act(() => hook.result.current.reload());
    await act(async () => { pending.resolve({ head: "b" }); await refresh; });
    expect(await refresh).toEqual({ head: "c" });
    expect(hook.result.current.result).toEqual({ head: "c" });
  });

  it("does not return an obsolete refresh after a thread switch", async () => {
    const pending = deferred<{ head: string }>();
    const fetch = vi.fn(async (id: string, mode: LoadMode) => mode === "refresh" ? pending.promise : { head: id });
    const hook = renderHook(({ id }) => useThreadResult(id, fetch), { initialProps: { id: "a" } });
    await waitFor(() => expect(hook.result.current.result).toEqual({ head: "a" }));
    let refresh!: ReturnType<typeof hook.result.current.refresh>;
    act(() => { refresh = hook.result.current.refresh(); });
    hook.rerender({ id: "b" });
    await waitFor(() => expect(hook.result.current.result).toEqual({ head: "b" }));
    await act(async () => { pending.resolve({ head: "old" }); await refresh; });
    expect(await refresh).toBeNull();
    expect(hook.result.current.result).toEqual({ head: "b" });
    hook.rerender({ id: "a" });
    await waitFor(() => expect(hook.result.current.result).toEqual({ head: "a" }));
    expect(hook.result.current.refreshing).toBe(false);
  });
});
