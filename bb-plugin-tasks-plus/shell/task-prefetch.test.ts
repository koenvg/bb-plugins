import { describe, expect, it, vi } from "vitest";
import { makeTask } from "../test-fixtures.js";
import { createTaskPreviews } from "./task-previews.js";

const task = (key: string) => makeTask({ key, id: key });
function transport() {
  const pending: { key: string; resolve: (value: ReturnType<typeof task> | null) => void }[] = [];
  const fetch = vi.fn(
    (key: string) =>
      new Promise<ReturnType<typeof task> | null>((resolve) => {
        pending.push({ key, resolve });
      }),
  );
  return { fetch, pending };
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

describe("adjacent preview queue", () => {
  it("does not issue a transport disposed before its start microtask", async () => {
    const { fetch } = transport();
    const previews = createTaskPreviews(fetch);
    previews.warm(["TSK-1", "TSK-2"]);
    previews.dispose();
    await flush();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("caps issued speculation at two, replaces queued keys, and starts selected reads immediately", async () => {
    const { fetch, pending } = transport();
    const previews = createTaskPreviews(fetch);
    previews.warm([" tsk-1 ", "TSK-2"]);
    await flush();
    previews.warm(["TSK-3", "TSK-4"]);
    previews.warm(["TSK-5", "TSK-6"]);
    await flush();
    expect(fetch.mock.calls).toEqual([["TSK-1"], ["TSK-2"]]);
    const selected = previews.load("TSK-7");
    await flush();
    expect(fetch.mock.calls.at(-1)).toEqual(["TSK-7"]);
    pending[0]!.resolve(task("TSK-1"));
    await flush();
    expect(fetch.mock.calls.at(-1)).toEqual(["TSK-5"]);
    expect(fetch).toHaveBeenCalledTimes(4);
    pending[1]!.resolve(task("TSK-2"));
    await flush();
    expect(fetch.mock.calls.at(-1)).toEqual(["TSK-6"]);
    pending[2]!.resolve(task("TSK-7"));
    await selected;
    previews.dispose();
  });

  it("shares normalized same-key reads in either direction and does not retry current data", async () => {
    const { fetch, pending } = transport();
    const previews = createTaskPreviews(fetch);
    const selected = previews.load("TSK-1");
    previews.warm([" tsk-1 ", "TSK-2"]);
    await flush();
    const shared = previews.load("tsk-2");
    expect(previews.load("TSK-2")).toBe(shared);
    expect(fetch.mock.calls).toEqual([["TSK-1"], ["TSK-2"]]);
    pending.forEach(({ key, resolve }) => resolve(task(key)));
    await Promise.all([selected, shared]);
    previews.warm(["TSK-1", "TSK-2"]);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("clears unwanted queued work without selecting or notifying unrelated subscribers", async () => {
    const { fetch, pending } = transport();
    const previews = createTaskPreviews(fetch);
    const listener = vi.fn();
    previews.subscribe("TSK-9", listener);
    previews.warm(["TSK-1", "TSK-2"]);
    await flush();
    previews.warm(["TSK-3", "TSK-4"]);
    previews.warm([]);
    pending.forEach(({ key, resolve }) => resolve(task(key)));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(listener).not.toHaveBeenCalled();
    expect(previews.read("TSK-9").data).toBeUndefined();
  });

  it.each(["key", "task", "all", "write", "epoch"] as const)(
    "revokes %s invalidation without freeing still-issued slots",
    async (kind) => {
      let epoch = 0;
      const { fetch, pending } = transport();
      const previews = createTaskPreviews(fetch, () => epoch);
      previews.warm(["TSK-1", "TSK-2"]);
      await flush();
      previews.warm(["TSK-3", "TSK-4"]);
      if (kind === "key") previews.invalidate("TSK-1");
      if (kind === "task") previews.invalidateTask("task-1");
      if (kind === "all") previews.invalidate();
      if (kind === "write") previews.invalidateReuse("TSK-1");
      if (kind === "epoch") {
        epoch++;
        previews.read("TSK-1");
      }
      previews.warm(["TSK-5", "TSK-6"]);
      await flush();
      expect(fetch).toHaveBeenCalledTimes(2);
      pending[0]!.resolve(task("TSK-1"));
      await flush();
      expect(previews.read("TSK-1").current).toBe(false);
      expect(fetch.mock.calls.at(-1)).toEqual(["TSK-5"]);
      expect(fetch).toHaveBeenCalledTimes(3);
      previews.dispose();
    },
  );

  it("does not reschedule queued work after invalidation, failure, absence, or disposal", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("Offline"));
    const previews = createTaskPreviews(fetch);
    previews.warm(["TSK-1", "TSK-2"]);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(previews.retention().entries).toBe(0);
    const wire = transport();
    const next = createTaskPreviews(wire.fetch);
    next.warm(["TSK-1", "TSK-2"]);
    await flush();
    next.warm(["TSK-3", "TSK-4"]);
    next.invalidate();
    wire.pending.forEach(({ resolve }) => resolve(null));
    await flush();
    expect(wire.fetch).toHaveBeenCalledTimes(2);
    next.warm(["TSK-5", "TSK-6"]);
    await flush();
    next.warm(["TSK-7", "TSK-8"]);
    const listener = vi.fn();
    next.subscribe("TSK-5", listener);
    next.dispose();
    wire.pending.slice(2).forEach(({ key, resolve }) => resolve(task(key)));
    await flush();
    next.warm(["TSK-9"]);
    await next.load("TSK-10");
    expect(wire.fetch).toHaveBeenCalledTimes(4);
    expect(listener).not.toHaveBeenCalled();
    expect(next.retention()).toEqual({ entries: 0, bytes: 0 });
  });
});
