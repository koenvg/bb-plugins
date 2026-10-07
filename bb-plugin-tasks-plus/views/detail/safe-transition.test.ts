import { describe, expect, it, vi } from "vitest";
import { createTaskEditSession, type SaveOutcome } from "./edit-session.js";
import { createSafeTaskTransition } from "./safe-transition.js";

function setup() {
  let resolve!: (value: SaveOutcome) => void;
  const reply = new Promise<SaveOutcome>((done) => {
    resolve = done;
  });
  const save = vi.fn().mockReturnValueOnce(reply).mockResolvedValue({ ok: true });
  const edit = createTaskEditSession("A", { save, schedule: () => () => {} });
  const transition = createSafeTaskTransition();
  transition.register(edit);
  return { transition, edit, save, resolve };
}

const diagnostic =
  "Safe task transition cannot request a destination during another request or commit";

describe("reentrant safe task transitions", () => {
  it.each([false, true])(
    "rejects a nested commit request with pending edits = %s",
    async (pending) => {
      const { transition, edit, resolve } = setup();
      const inner = vi.fn();
      const outer = vi.fn(() => {
        expect(() => transition.request(inner)).toThrow(diagnostic);
      });
      if (pending) edit.stage({ title: "draft" });
      const flight = transition.request(outer);
      resolve({ ok: true });
      expect(await flight).toBe(true);
      expect(outer).toHaveBeenCalledOnce();
      expect(inner).not.toHaveBeenCalled();
      await transition.retry();
      expect(inner).not.toHaveBeenCalled();
      expect(await transition.request(inner)).toBe(true);
      expect(inner).toHaveBeenCalledOnce();
    },
  );

  it("rejects a request in the commit's microtask before the save flight settles", async () => {
    const { transition, edit, resolve } = setup();
    const inner = vi.fn();
    let nested!: Promise<void>;
    edit.stage({ title: "draft" });
    const flight = transition.request(() => {
      nested = Promise.resolve().then(() => {
        expect(() => transition.request(inner)).toThrow(diagnostic);
      });
    });
    resolve({ ok: true });
    expect(await flight).toBe(true);
    await nested;
    await transition.retry();
    expect(inner).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "does not signal success for an uncaught nested request with pending edits = %s",
    async (pending) => {
      const { transition, edit, resolve } = setup();
      const inner = vi.fn();
      const outer = () => transition.request(inner);
      if (pending) {
        edit.stage({ title: "draft" });
        const flight = transition.request(outer);
        resolve({ ok: true });
        await expect(flight).rejects.toThrow(diagnostic);
      } else {
        expect(() => transition.request(outer)).toThrow(diagnostic);
      }
      await transition.retry();
      expect(inner).not.toHaveBeenCalled();
      expect(await transition.request(inner)).toBe(true);
      expect(inner).toHaveBeenCalledOnce();
    },
  );

  it("does not let cancellation inside a commit bypass the nested-request rejection", async () => {
    const { transition, edit, resolve } = setup();
    const inner = vi.fn();
    edit.stage({ title: "draft" });
    const flight = transition.request(() => {
      transition.cancel();
      expect(() => transition.request(inner)).toThrow(diagnostic);
    });
    resolve({ ok: true });
    expect(await flight).toBe(true);
    await transition.retry();
    expect(inner).not.toHaveBeenCalled();
  });

  it("accepts a replacement after cancellation while a save is pending", async () => {
    const { transition, edit, resolve } = setup();
    const original = vi.fn();
    const replacement = vi.fn();
    let nested!: Promise<boolean>;
    edit.stage({ title: "draft" });
    const flight = transition.request(original);
    const unsubscribe = edit.subscribe(() => {
      if (edit.getSnapshot().saving) return;
      unsubscribe();
      transition.cancel();
      nested = transition.request(replacement);
    });
    resolve({ ok: true });
    expect(await flight).toBe(true);
    expect(nested).toBe(flight);
    expect(await nested).toBe(true);
    expect(original).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledOnce();
  });

  it("retains a destination requested from a failed-save notification for explicit retry", async () => {
    const { transition, edit, save, resolve } = setup();
    const original = vi.fn();
    const inner = vi.fn();
    const replacement = vi.fn(() => {
      expect(() => transition.request(inner)).toThrow(diagnostic);
    });
    let nested!: Promise<boolean>;
    edit.stage({ title: "draft" });
    const flight = transition.request(original);
    const unsubscribe = edit.subscribe(() => {
      if (!edit.getSnapshot().error) return;
      unsubscribe();
      nested = transition.request(replacement);
    });
    resolve({ ok: false, errorMessage: "Cannot save" });
    expect(await flight).toBe(false);
    expect(nested).toBe(flight);
    expect(await nested).toBe(false);
    expect(original).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
    expect(edit.getSnapshot()).toMatchObject({ pending: true, draft: { title: "draft" } });
    expect(await transition.retry()).toBe(true);
    expect(replacement).toHaveBeenCalledOnce();
    await transition.retry();
    expect(inner).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("rejects a nested request from a pending-transition listener without replacing the destination", async () => {
    const { transition, edit, resolve } = setup();
    const outer = vi.fn();
    const inner = vi.fn();
    transition.onPendingTransition(() => {
      expect(() => transition.request(inner)).toThrow(diagnostic);
    });
    edit.stage({ title: "draft" });
    const flight = transition.request(outer);
    resolve({ ok: true });
    expect(await flight).toBe(true);
    expect(outer).toHaveBeenCalledOnce();
    await transition.retry();
    expect(inner).not.toHaveBeenCalled();
  });
});
