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
  it.each(["pending", "settled"])(
    "shares an identified save revalidation while its read is %s",
    async (timing) => {
      const pending = deferred<ReturnType<typeof task>>();
      const fetch = vi.fn().mockResolvedValueOnce(task(1)).mockReturnValueOnce(pending.promise);
      const previews = createTaskPreviews(fetch);
      const release = previews.subscribe("TSK-1", () => {});
      await previews.load("TSK-1");
      previews.invalidateTask("task-1", "save-1");
      const read = previews.load("TSK-1");
      await Promise.resolve();
      if (timing === "settled") {
        pending.resolve(task(1, "Saved"));
        await read;
      }
      previews.invalidateReuse("TSK-1", "save-1");
      previews.invalidate("TSK-1", "save-1");
      const shared = previews.load("TSK-1");
      pending.resolve(task(1, "Saved"));
      await read;
      await shared;
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(previews.read("TSK-1")).toMatchObject({
        current: true,
        data: { description: "Saved" },
      });
      release();
    },
  );

  it("coalesces the saved key but still revalidates dependencies and later external edits", async () => {
    let description = "Initial";
    const blocker = task(1);
    const linked = {
      ...task(2),
      blockedBy: [
        { id: blocker.id, key: blocker.key, title: blocker.title, status: blocker.status },
      ],
    };
    const fetch = vi.fn(async (key: string) => ({
      ...(key === blocker.key ? blocker : linked),
      description,
    }));
    const previews = createTaskPreviews(fetch);
    await previews.load("TSK-1");
    await previews.load("TSK-2");
    previews.invalidateReuse("TSK-1", "save-1");
    previews.invalidate("TSK-1", "save-1");
    description = "Saved";
    await previews.load("TSK-1");
    previews.invalidateTask("task-1", "save-1");
    await previews.load("TSK-1");
    await previews.load("TSK-2");
    expect(fetch.mock.calls).toEqual([["TSK-1"], ["TSK-2"], ["TSK-1"], ["TSK-2"]]);
    const obsolete = deferred<ReturnType<typeof task>>();
    fetch.mockImplementationOnce(() => obsolete.promise);
    previews.invalidateTask("task-1", "external-1");
    const old = previews.load("TSK-1");
    await Promise.resolve();
    description = "Latest external edit";
    previews.invalidateTask("task-1");
    await previews.load("TSK-1");
    obsolete.resolve(task(1, "Obsolete external edit"));
    await old;
    expect(previews.read("TSK-1")).toMatchObject({ current: true, data: { description } });
  });

  it("bounds change history and permits a safe extra read after eviction", async () => {
    const fetch = vi.fn(async () => task(1));
    const previews = createTaskPreviews(fetch);
    await previews.load("TSK-1");
    for (let n = 0; n <= TASK_PREVIEW_ENTRIES; n++) {
      previews.invalidate("TSK-1", `save-${n}`);
      await previews.load("TSK-1");
    }
    const before = fetch.mock.calls.length;
    previews.invalidate("TSK-1", "save-0");
    await previews.load("TSK-1");
    expect(fetch).toHaveBeenCalledTimes(before + 1);
  });

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
    await Promise.resolve(); // Issue the first transport before invalidating it.
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
  it.each(["blockedBy", "blocks"] as const)(
    "invalidates retained %s references while preserving unrelated current tasks",
    async (relationship) => {
      const linked = task(1);
      const reference = {
        id: linked.id,
        key: linked.key,
        title: linked.title,
        status: linked.status,
      };
      const dependent = { ...task(2), [relationship]: [reference] };
      const fetch = vi.fn(async (key: string) =>
        key === "TSK-2" ? dependent : task(Number(key.split("-")[1])),
      );
      const previews = createTaskPreviews(fetch);
      await previews.load("TSK-1");
      await previews.load("TSK-2");
      await previews.load("TSK-3");
      previews.invalidateTask(linked.id);
      expect(previews.read("TSK-2").current).toBe(false);
      expect(previews.read("TSK-3").current).toBe(true);
      dependent[relationship] = [{ ...reference, title: "Changed", status: "done" }];
      await previews.load("TSK-2");
      expect(previews.read("TSK-2").data?.[relationship]).toEqual(dependent[relationship]);
      expect(fetch.mock.calls.filter(([key]) => key === "TSK-2")).toHaveLength(2);
    },
  );

  it("revokes a revalidation whose newly linked identity is not in its old snapshot", async () => {
    const old = deferred<ReturnType<typeof task>>();
    const fresh = deferred<ReturnType<typeof task>>();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(task(2))
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    const previews = createTaskPreviews(fetch);
    await previews.load("TSK-2");
    previews.invalidate("TSK-2");
    const obsolete = previews.load("TSK-2");
    await Promise.resolve();
    previews.invalidateTask("task-1");
    const current = previews.load("TSK-2");
    expect(current).not.toBe(obsolete);
    const reference = {
      id: "task-1",
      key: "TSK-1",
      title: "Fresh blocker",
      status: "done" as const,
    };
    fresh.resolve({ ...task(2, "Fresh"), blockedBy: [reference] });
    await current;
    old.resolve({ ...task(2, "Obsolete"), blockedBy: [{ ...reference, status: "todo" }] });
    await obsolete;
    expect(previews.read("TSK-2")).toMatchObject({
      current: true,
      data: { description: "Fresh", blockedBy: [reference] },
    });
  });
});
