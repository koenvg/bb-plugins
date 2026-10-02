// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { postIntent, useCommandIntent, type CommandTab, type IntentOf } from "./command-intents";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function listen<Tab extends CommandTab>(threadId: string, tab: Tab) {
  const received: IntentOf<Tab>[] = [];
  const hook = renderHook(() => useCommandIntent(threadId, tab, (intent) => received.push(intent)));
  return { received, unmount: hook.unmount };
}

describe("command intents", () => {
  it("hands an intent to the mounted tab of its thread at once", () => {
    const tab = listen("thr_mounted", "pr");

    postIntent("thr_mounted", "pr", "refresh");

    expect(tab.received).toEqual(["refresh"]);
  });

  it("keeps an intent until the tab of its thread mounts", () => {
    postIntent("thr_later", "review", "submit");

    expect(listen("thr_later", "review").received).toEqual(["submit"]);
  });

  it("hands an intent to its thread and tab only", () => {
    const otherThread = listen("thr_other", "pr");
    const otherTab = listen("thr_own", "review");

    postIntent("thr_own", "pr", "merge");

    expect(otherThread.received).toEqual([]);
    expect(otherTab.received).toEqual([]);
    expect(listen("thr_own", "pr").received).toEqual(["merge"]);
  });

  it("hands a pending intent over once", () => {
    postIntent("thr_once", "pr", "merge");
    listen("thr_once", "pr").unmount();

    expect(listen("thr_once", "pr").received).toEqual([]);
  });

  it("keeps only the last pending intent", () => {
    postIntent("thr_last", "pr", "merge");
    postIntent("thr_last", "pr", "refresh");

    expect(listen("thr_last", "pr").received).toEqual(["refresh"]);
  });

  it("drops a pending intent older than 10 seconds", () => {
    vi.useFakeTimers();
    postIntent("thr_old", "pr", "merge");
    vi.advanceTimersByTime(10_001);

    expect(listen("thr_old", "pr").received).toEqual([]);
  });

  it("hands intents to the last mounted tab, and back to the earlier one when it unmounts", () => {
    const earlier = listen("thr_two", "pr");
    const later = listen("thr_two", "pr");

    postIntent("thr_two", "pr", "refresh");
    later.unmount();
    postIntent("thr_two", "pr", "merge");

    expect(later.received).toEqual(["refresh"]);
    expect(earlier.received).toEqual(["merge"]);
  });

  it("stops handing intents to an unmounted tab", () => {
    const tab = listen("thr_gone", "pr");
    tab.unmount();

    postIntent("thr_gone", "pr", "refresh");

    expect(tab.received).toEqual([]);
  });
});
