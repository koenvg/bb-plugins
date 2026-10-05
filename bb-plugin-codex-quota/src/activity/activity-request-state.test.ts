import { describe, expect, it, vi } from "vitest";
import { ActivityRequestState } from "./activity-request-state.js";
import { normalizeActivity } from "./activity.js";
const time = Date.UTC(2026, 3, 23, 12);
const snapshot = normalizeActivity({ stats: { lifetime_tokens: 12 } }, time)!;
const fresh = { state: "fresh" as const, reason: "ok" as const, snapshot };
describe("activity-only browser request state", () => {
  it("coalesces requests and recalculates expiry without network", async () => {
    let now = time;
    const read = vi.fn(async () => fresh);
    const store = new ActivityRequestState(read, () => now);
    store.open({ hostId: "a", generation: 1 });
    await Promise.all([store.refresh(), store.refresh(true)]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().view.state).toBe("fresh");
    now += 300_000;
    store.tick();
    expect(store.getSnapshot().view.state).toBe("stale");
    now = time + 86_400_000;
    store.tick();
    expect(store.getSnapshot().view.snapshot).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
    store.close();
  });
  it("discards unconfirmed stale data on transport failure", async () => {
    let now = time;
    let fail = false;
    const store = new ActivityRequestState(
      async () => {
        if (fail) throw new Error("private");
        return fresh;
      },
      () => now,
    );
    store.open({ hostId: "a", generation: 1 });
    await store.refresh();
    now += 300_000;
    fail = true;
    await store.refresh();
    expect(store.getSnapshot().view.snapshot).toBeNull();
    store.close();
  });
  it("rejects late host/generation output and cancels pending work on close", async () => {
    let finish!: (value: typeof fresh) => void;
    const read = vi.fn(
      (_input: unknown, _signal: AbortSignal) =>
        new Promise<typeof fresh>((resolve) => {
          finish = resolve;
        }),
    );
    const store = new ActivityRequestState(read, () => time);
    store.open({ hostId: "a", generation: 1 });
    const pending = store.refresh();
    await Promise.resolve();
    store.open({ hostId: "b", generation: 2 });
    finish(fresh);
    await pending;
    expect(store.getSnapshot().view.snapshot).toBeNull();
    const next = store.refresh();
    store.close();
    await next;
    expect(store.getSnapshot().view.snapshot).toBeNull();
    expect(read.mock.calls[0]![1].aborted).toBe(true);
  });
  it("limits manual retries and rejects raw/unsupported output", async () => {
    let now = time;
    const read = vi.fn(async () => ({ ...fresh, raw: "private" }));
    const store = new ActivityRequestState(read, () => now);
    store.open({ hostId: "a", generation: 1 });
    await store.refresh(true);
    await store.refresh(true);
    expect(read).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().view.reason).toBe("unsupported");
    now += 30_000;
    await store.refresh(true);
    expect(read).toHaveBeenCalledTimes(2);
    store.close();
  });
  it.each([false, true])(
    "does not dispatch a cancelled queued read, reopened=%s",
    async (reopen) => {
      const read = vi.fn(
        async (
          _input: { hostId: string; generation: number; refresh: boolean },
          _signal: AbortSignal,
        ) => fresh,
      );
      const store = new ActivityRequestState(read, () => time);
      store.open({ hostId: "a", generation: 1 });
      const cancelled = store.refresh();
      store.close();
      if (reopen) store.open({ hostId: "b", generation: 2 });
      await cancelled;
      expect(read).not.toHaveBeenCalled();
      expect(store.getSnapshot().view.snapshot).toBeNull();
      if (reopen) {
        await store.refresh();
        expect(read).toHaveBeenCalledTimes(1);
        expect(read.mock.calls[0]![0]).toEqual({ hostId: "b", generation: 2, refresh: false });
      }
      store.close();
    },
  );
});
