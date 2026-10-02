import { describe, expect, it, vi } from "vitest";
import {
  createTaskEditSession,
  type SaveOutcome,
  type TaskEditPatch,
} from "./edit-session.js";
import { createSafeTaskTransition } from "./safe-transition.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("task edits and safe transitions", () => {
  it("serializes every field and commits only the latest destination after newer edits save", async () => {
    const attempts: {
      taskId: string;
      patch: TaskEditPatch;
      reply: ReturnType<typeof deferred<SaveOutcome>>;
    }[] = [];
    const edit = createTaskEditSession("A", {
      save: (taskId, patch) => {
        const reply = deferred<SaveOutcome>();
        attempts.push({ taskId, patch, reply });
        return reply.promise;
      },
    });
    const transition = createSafeTaskTransition();
    transition.register(edit);
    const committed: string[] = [];
    edit.stage({ description: "first" }, 800);
    const switching = transition.request(() => committed.push("B"));
    edit.stage(
      { title: "latest title", priority: "high", description: "second" },
      800,
    );
    const latest = transition.request(() => committed.push("C"));
    expect(attempts).toHaveLength(1);
    expect(committed).toEqual([]);
    attempts[0]!.reply.resolve({ ok: true });
    await vi.waitFor(() => expect(attempts).toHaveLength(2));
    expect(attempts[1]).toMatchObject({
      taskId: "A",
      patch: {
        title: "latest title",
        priority: "high",
        description: "second",
      },
    });
    expect(committed).toEqual([]);
    attempts[1]!.reply.resolve({ ok: true });
    expect(await switching).toBe(true);
    expect(await latest).toBe(true);
    expect(committed).toEqual(["C"]);
  });

  it("retains the latest rejected draft and destination until an explicit retry", async () => {
    const reply = deferred<SaveOutcome>();
    const save = vi
      .fn()
      .mockReturnValueOnce(reply.promise)
      .mockResolvedValue({ ok: true });
    const edit = createTaskEditSession("A", { save });
    const transition = createSafeTaskTransition();
    transition.register(edit);
    const commit = vi.fn();
    edit.stage({ title: "old" });
    const result = transition.request(commit);
    edit.stage({ title: "new" }, 800);
    reply.resolve({ ok: false, errorMessage: "Rejected" });
    expect(await result).toBe(false);
    expect(edit.getSnapshot()).toMatchObject({
      draft: { title: "new" },
      pending: true,
      error: "Rejected",
    });
    expect(commit).not.toHaveBeenCalled();
    expect(await transition.retry()).toBe(true);
    expect(save).toHaveBeenLastCalledWith("A", { title: "new" });
    expect(commit).toHaveBeenCalledOnce();
  });

  it("commits clean navigation synchronously without a confirmation and cancels pending navigation on disposal", async () => {
    const transition = createSafeTaskTransition();
    const commit = vi.fn();
    void transition.request(commit);
    expect(commit).toHaveBeenCalledOnce();
    const reply = deferred<SaveOutcome>();
    const edit = createTaskEditSession("A", { save: () => reply.promise });
    transition.register(edit);
    edit.stage({ description: "draft" });
    const pending = transition.request(commit);
    transition.cancel();
    reply.resolve({ ok: true });
    expect(await pending).toBe(false);
    expect(commit).toHaveBeenCalledOnce();
  });
});
