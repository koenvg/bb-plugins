import { describe, expect, it, vi } from "vitest";
import { createTaskInventory } from "./task-inventory.js";

function deferred<T>() {
  let resolve!: (data: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe("current session inventories", () => {
  it("shares one current read and stable snapshots without treating a seed as current", async () => {
    const fetch = vi.fn().mockResolvedValue(["Current"]);
    const resource = createTaskInventory<string[]>(fetch, () => 0, ["Seed"]);
    expect(resource.read()).toMatchObject({ data: ["Seed"], current: false, isLoading: true });
    const first = resource.load();
    expect(resource.load()).toBe(first);
    await first;
    expect(resource.read()).toBe(resource.read());
    await resource.load();
    expect(fetch).toHaveBeenCalledOnce();
    expect(resource.read()).toMatchObject({ data: ["Current"], current: true });
  });
  it("revokes old requests even when a cold inventory is already loading", async () => {
    const old = deferred<string[]>();
    const fetch = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(["New"]);
    const resource = createTaskInventory<string[]>(fetch, () => 0);
    const first = resource.load();
    await Promise.resolve();
    resource.invalidate();
    await resource.load();
    old.resolve(["Old"]);
    await first;
    expect(resource.read()).toMatchObject({ data: ["New"], current: true });
  });
  it("checks the refresh generation before publication, and allows failed reads to retry", async () => {
    let generation = 0;
    const pending = deferred<string[]>();
    const current = vi.fn();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce([]);
    const resource = createTaskInventory<string[]>(fetch, () => generation, ["Seed"], current);
    const old = resource.load();
    generation++;
    pending.resolve(["Old"]);
    await old;
    expect(current).not.toHaveBeenCalled();
    await resource.load();
    expect(resource.read()).toMatchObject({ data: ["Seed"], current: false, error: "Offline" });
    await resource.load();
    expect(resource.read()).toMatchObject({ data: [], current: true, error: null });
    expect(current).toHaveBeenCalledWith([]);
  });
  it("keeps RPC bindings separate and releases publication rights on disposal", async () => {
    const pending = deferred<string[]>();
    const current = vi.fn();
    const resource = createTaskInventory(
      () => pending.promise,
      () => 0,
      undefined,
      current,
    );
    const other = createTaskInventory(
      async () => ["Other binding"],
      () => 0,
    );
    const work = resource.load();
    resource.dispose();
    pending.resolve(["Disposed"]);
    await work;
    await other.load();
    expect(current).not.toHaveBeenCalled();
    expect(resource.read().data).toBeUndefined();
    expect(other.read().data).toEqual(["Other binding"]);
  });
});
