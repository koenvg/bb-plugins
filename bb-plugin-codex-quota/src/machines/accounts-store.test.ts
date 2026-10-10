import { describe, expect, it, vi } from "vitest";
import { MachineAccountsStore } from "./accounts-store.js";
import { accountsFixture } from "./machines.test-support.js";

describe("account refresh ownership", () => {
  it("returns refresh ownership to a remaining pane when the newest pane closes", async () => {
    const store = new MachineAccountsStore();
    const first = vi.fn(async () => accountsFixture()),
      second = vi.fn(async () => accountsFixture());
    const stopFirst = store.start(first);
    await vi.waitFor(() => expect(store.getSnapshot().loading).toBe(false));
    const stopSecond = store.start(second);
    stopSecond();
    await store.refresh(true);
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).not.toHaveBeenCalled();
    stopFirst();
  });
  it("clears observations on disposal and ignores a late result from the old owner", async () => {
    const store = new MachineAccountsStore();
    let resolve!: (value: unknown) => void;
    const stop = store.start(
      async () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    stop();
    const stopNew = store.start(async () => accountsFixture());
    await vi.waitFor(() => expect(store.getSnapshot().data?.accounts).toHaveLength(1));
    const old = accountsFixture(Date.now(), true);
    resolve(old);
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getSnapshot().data?.accounts).toHaveLength(1);
    stopNew();
    expect(store.getSnapshot().data).toBeNull();
  });
});
