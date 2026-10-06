import { describe, expect, it, vi } from "vitest";
import { makeTask } from "../test-fixtures.js";
import { createTaskPreviews, TASK_PREVIEW_BYTES, TASK_PREVIEW_ENTRIES } from "./task-previews.js";

const task = (n: number, description = `Description ${n}`) =>
  makeTask({ id: `task-${n}`, key: `TSK-${n}`, number: n, title: `Title ${n}`, description });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("session task previews", () => {
  it("normalizes keys, shares in-flight reads and reuses matching current data", async () => {
    const pending = deferred<ReturnType<typeof task> | null>();
    const fetch = vi.fn(() => pending.promise);
    const previews = createTaskPreviews(fetch);
    const first = previews.load(" tsk-1 ");
    expect(previews.load("TSK-1")).toBe(first);
    pending.resolve(task(1));
    await first;
    expect(previews.read("tsk-1")).toMatchObject({
      data: task(1),
      current: true,
      isLoading: false,
    });
    await previews.load("TSK-1");
    expect(fetch.mock.calls).toEqual([["TSK-1"]]);
  });

  it("evicts least recently used unselected data at 32 entries", async () => {
    const previews = createTaskPreviews(async (key) => task(Number(key.split("-")[1])));
    const release = previews.subscribe("TSK-1", () => {});
    for (let n = 1; n <= TASK_PREVIEW_ENTRIES; n++) await previews.load(`TSK-${n}`);
    await previews.load("TSK-2");
    await previews.load("TSK-33");
    expect(previews.read("TSK-1").current).toBe(true);
    expect(previews.read("TSK-2").current).toBe(true);
    expect(previews.read("TSK-3").data).toBeUndefined();
    expect(previews.retention()).toMatchObject({ entries: 32 });
    release();
  });

  it("counts serialized UTF-8 bytes, evicts under 2 MiB, and does not retain oversized tasks", async () => {
    const previews = createTaskPreviews(async (key) =>
      task(Number(key.split("-")[1]), "é".repeat(350_000)),
    );
    for (let n = 1; n <= 4; n++) await previews.load(`TSK-${n}`);
    expect(previews.retention().bytes).toBeLessThanOrEqual(TASK_PREVIEW_BYTES);
    expect(previews.retention().entries).toBe(2);
    const huge = task(5, "x".repeat(TASK_PREVIEW_BYTES));
    const oversize = createTaskPreviews(async () => huge);
    const release = oversize.subscribe("TSK-5", () => {});
    await oversize.load("TSK-5");
    expect(oversize.read("TSK-5").data).toEqual(huge);
    expect(oversize.retention()).toEqual({ entries: 0, bytes: 0 });
    release();
    expect(oversize.read("TSK-5").data).toBeUndefined();
  });

  it("invalidates by task identity and prevents old-generation publication", async () => {
    const first = deferred<ReturnType<typeof task> | null>();
    const fresh = deferred<ReturnType<typeof task> | null>();
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(fresh.promise);
    const previews = createTaskPreviews(fetch);
    const old = previews.load("TSK-1");
    previews.invalidate();
    const next = previews.load("TSK-1");
    fresh.resolve(task(1, "Current"));
    await next;
    first.resolve(task(1, "Obsolete"));
    await old;
    expect(previews.read("TSK-1").data?.description).toBe("Current");
    previews.invalidateTask("task-1");
    expect(previews.read("TSK-1").current).toBe(false);
  });

  it("invalidates unknown in-flight identities but leaves unrelated known data current", async () => {
    const previews = createTaskPreviews(async (key) => task(Number(key.split("-")[1])));
    await previews.load("TSK-1");
    await previews.load("TSK-2");
    previews.invalidateTask("task-1");
    expect(previews.read("TSK-1").current).toBe(false);
    expect(previews.read("TSK-2").current).toBe(true);
  });

  it("keeps failed retained data explicitly stale and allows retry; absence is not retained", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(task(1))
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(task(1, "Fresh"))
      .mockResolvedValueOnce(null);
    const previews = createTaskPreviews(fetch);
    const release = previews.subscribe("TSK-1", () => {});
    await previews.load("TSK-1");
    previews.invalidate("TSK-1");
    await previews.load("TSK-1");
    expect(previews.read("TSK-1")).toMatchObject({
      data: task(1),
      current: false,
      error: "Offline",
    });
    await previews.load("TSK-1");
    expect(previews.read("TSK-1").data?.description).toBe("Fresh");
    previews.invalidate("TSK-1");
    await previews.load("TSK-1");
    expect(previews.read("TSK-1")).toMatchObject({ data: null, current: true });
    release();
    expect(previews.read("TSK-1").data).toBeUndefined();
  });

  it("checks the external refresh generation before publication and reuse", async () => {
    let generation = 0;
    const pending = deferred<ReturnType<typeof task> | null>();
    const previews = createTaskPreviews(
      () => pending.promise,
      () => generation,
    );
    const old = previews.load("TSK-1");
    generation++;
    pending.resolve(task(1));
    await old;
    expect(previews.read("TSK-1").current).toBe(false);
  });

  it("disposal releases retained data and publication rights", async () => {
    const pending = deferred<ReturnType<typeof task> | null>();
    const listener = vi.fn();
    const previews = createTaskPreviews(() => pending.promise);
    previews.subscribe("TSK-1", listener);
    const work = previews.load("TSK-1");
    previews.dispose();
    const calls = listener.mock.calls.length;
    pending.resolve(task(1));
    await work;
    expect(listener).toHaveBeenCalledTimes(calls);
    expect(previews.retention()).toEqual({ entries: 0, bytes: 0 });
    expect(previews.read("TSK-1").data).toBeUndefined();
  });
  it("holds a warm active snapshot when a write revokes reuse, then releases it on switch", async () => {
    const previews = createTaskPreviews(async () => task(1));
    await previews.load("TSK-1");
    const release = previews.subscribe("TSK-1", () => {});
    previews.invalidateReuse("TSK-1");
    expect(previews.read("TSK-1").data).toEqual(task(1));
    release();
    expect(previews.read("TSK-1").data).toBeUndefined();
  });

  it("rejects a wrong-key response without poisoning future reads", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(task(2)).mockResolvedValueOnce(task(1));
    const previews = createTaskPreviews(fetch);
    const release = previews.subscribe("TSK-1", () => {});
    await previews.load("TSK-1");
    expect(previews.read("TSK-1")).toMatchObject({
      current: false,
      error: "Task lookup did not match TSK-1",
      data: undefined,
    });
    await previews.load("TSK-1");
    expect(previews.read("TSK-1").data).toEqual(task(1));
    release();
  });
});
