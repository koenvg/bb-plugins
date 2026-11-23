import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPillTracker } from "../lib/pill-tracker";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const remove = vi.fn(async () => ({}));
  const clearResolved = vi.fn(async (): Promise<{ removed: string[] }> => ({
    removed: ["a", "b"],
  }));
  const hidden = new Set<string>();
  const tracker = createPillTracker({
    remove,
    clearResolved,
    hide: (id) => hidden.add(id),
    show: (id) => hidden.delete(id),
    delayMs: 1000,
  });
  return { tracker, remove, clearResolved, hidden };
}

describe("pill tracker", () => {
  it("removes an annotation whose pill was seen and then deleted", () => {
    const { tracker, remove } = setup();
    tracker.observe("thr", ["a", "b"]);

    tracker.observe("thr", ["b"]);
    vi.advanceTimersByTime(1000);

    expect(remove).toHaveBeenCalledExactlyOnceWith("thr", "a");
  });

  it("hides the pin at once when its pill is deleted", () => {
    const { tracker, remove, hidden } = setup();
    tracker.observe("thr", ["a", "b"]);

    tracker.observe("thr", ["b"]);

    expect([...hidden]).toEqual(["a"]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("shows the pin again when its pill comes back", () => {
    const { tracker, hidden } = setup();
    tracker.observe("thr", ["a"]);
    tracker.observe("thr", []);

    tracker.observe("thr", ["a"]);

    expect(hidden.size).toBe(0);
  });

  it("does not remove an annotation whose pill was never seen", () => {
    const { tracker, remove } = setup();
    tracker.observe("thr", ["a"]);

    tracker.observe("thr", ["a"]);
    vi.advanceTimersByTime(5000);

    expect(remove).not.toHaveBeenCalled();
  });

  it("restores a failed-send draft when its pills return within the removal delay", () => {
    const { tracker, remove, hidden } = setup();
    tracker.observe("thr", ["a"]);

    tracker.observe("thr", []);
    vi.advanceTimersByTime(500);
    tracker.observe("thr", ["a"]);
    vi.advanceTimersByTime(5000);

    expect([...hidden]).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("pauses an existing removal when submission starts without changing the draft", () => {
    const { tracker, remove, hidden } = setup();
    tracker.observe("thr", ["a"]);
    tracker.observe("thr", []);
    tracker.observe("thr", [], true);
    vi.advanceTimersByTime(3100);

    expect([...hidden]).toEqual([]);
    expect(remove).not.toHaveBeenCalled();

    tracker.observe("thr", ["a"], false);
    tracker.observe("thr", [], false);
    vi.advanceTimersByTime(1000);
    expect([...hidden]).toEqual(["a"]);
    expect(remove).toHaveBeenCalledExactlyOnceWith("thr", "a");
  });

  it.each(["empty", "unchanged"] as const)(
    "keeps next-draft annotations visible and tracked when submission first observes %s pills",
    (firstDraft) => {
      const { tracker, hidden, remove } = setup();
      tracker.observe("thr", ["a"]);
      tracker.observe("thr", firstDraft === "empty" ? [] : ["a"], true);
      tracker.observe("thr", ["b"], true);

      tracker.submitted("thr");
      tracker.observe("thr", ["b"], true);
      expect([...hidden]).toEqual(["a"]);
      vi.advanceTimersByTime(5000);
      expect(remove).not.toHaveBeenCalled();

      tracker.observe("thr", ["b"], false);
      tracker.observe("thr", [], false);
      vi.advanceTimersByTime(1000);
      expect(remove).toHaveBeenCalledExactlyOnceWith("thr", "b");
      tracker.dispose();
    },
  );

  it("does not retire a new annotation when the pending send had no annotations", () => {
    const { tracker, hidden, remove } = setup();
    tracker.observe("thr", []);
    tracker.observe("thr", [], true);
    tracker.observe("thr", ["b"], true);
    tracker.submitted("thr");
    tracker.observe("thr", ["b"], false);

    expect([...hidden]).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
    tracker.dispose();
  });

  it.each([true, false])(
    "captures the next send after an unsuccessful send, restored=%s",
    (restored) => {
      const { tracker, hidden, remove } = setup();
      tracker.observe("thr", ["a"]);
      tracker.observe("thr", [], true);
      vi.advanceTimersByTime(5000);
      tracker.observe("thr", restored ? ["a"] : [], false);
      tracker.observe("thr", ["b"], false);
      tracker.observe("thr", [], true);
      tracker.observe("thr", ["c"], true);
      tracker.submitted("thr");
      tracker.observe("thr", ["c"], false);

      expect([...hidden]).toEqual(["a", "b"]);
      expect(remove).not.toHaveBeenCalled();
      tracker.dispose();
    },
  );

  it("clears sent annotations once after a submit, without a second delete", () => {
    const { tracker, remove, clearResolved } = setup();
    tracker.observe("thr", ["a", "b"]);

    tracker.observe("thr", []);
    tracker.submitted("thr");
    vi.advanceTimersByTime(5000);

    expect(clearResolved).toHaveBeenCalledExactlyOnceWith("thr");
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    ["before", false],
    ["after", false],
    ["before", true],
    ["after", true],
  ] as const)(
    "retires submitted pins %s the empty draft, submitting=%s, even before mention resolution",
    async (order, isSubmitting) => {
      const { tracker, remove, clearResolved, hidden } = setup();
      clearResolved.mockResolvedValueOnce({ removed: [] });
      tracker.observe("thr", ["a", "b"]);
      if (order === "after") tracker.observe("thr", [], isSubmitting);

      tracker.submitted("thr");
      if (order === "before") tracker.observe("thr", [], isSubmitting);
      await vi.runAllTimersAsync();

      expect([...hidden]).toEqual(["a", "b"]);
      expect(remove).not.toHaveBeenCalled();
      tracker.observe("thr", ["c"]);
      expect(hidden.has("c")).toBe(false);
      tracker.dispose();
    },
  );

  it("keeps successful submissions hidden if server cleanup fails", async () => {
    const { tracker, clearResolved, hidden } = setup();
    clearResolved.mockRejectedValueOnce(new Error("offline"));
    tracker.observe("thr", ["a"]);
    tracker.observe("thr", []);

    tracker.submitted("thr");
    await vi.runAllTimersAsync();

    expect([...hidden]).toEqual(["a"]);
    tracker.dispose();
  });

  it("keeps a removed pin hidden, and shows it again if the remove fails", async () => {
    const { tracker, remove, hidden } = setup();
    tracker.observe("thr", ["a", "b"]);
    remove.mockRejectedValueOnce(new Error("offline"));

    tracker.observe("thr", ["b"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(hidden.has("a")).toBe(false);

    tracker.observe("thr", []);
    await vi.advanceTimersByTimeAsync(1000);
    expect(hidden.has("b")).toBe(true);
  });

  it("tracks threads separately", () => {
    const { tracker, remove } = setup();
    tracker.observe("one", ["a"]);
    tracker.observe("two", ["b"]);

    tracker.observe("one", []);
    tracker.submitted("two");
    vi.advanceTimersByTime(1000);

    expect(remove).toHaveBeenCalledExactlyOnceWith("one", "a");
  });
});
