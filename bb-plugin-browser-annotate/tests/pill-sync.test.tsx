import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup } from "@testing-library/react";
import type { PluginComposerApi } from "@get-bb/plugin-sdk/app";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { PillSync } from "../app";
import { createHiddenPins } from "../lib/hidden-pins";

const host = vi.hoisted(() => ({ composers: [] as PluginComposerApi[] }));
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@get-bb/plugin-sdk/app")>()),
  useComposers: () => host.composers,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PillSync submission lifecycle", () => {
  it("retains an unsuccessful send beyond the removal delay, then permits manual removal", async () => {
    vi.useFakeTimers();
    const hiddenPins = createHiddenPins();
    const remove = vi.fn(async () => ({ removed: [] }));
    const clearResolved = vi.fn(async () => ({ removed: [] }));
    const draft = {
      text: "1 · button",
      mentions: [
        {
          kind: "plugin" as const,
          pluginId: "browser-annotate",
          provider: "annotation",
          id: "a",
          from: 0,
          to: 10,
          label: "1 · button",
        },
      ],
      attachments: [],
    };
    const composer = {
      key: "thread:thr",
      scope: { kind: "thread", threadId: "thr" },
      draft,
      isSubmitting: false,
      onSubmitted: () => () => {},
    } as unknown as PluginComposerApi;
    host.composers = [composer];
    const view = renderSlot(
      { component: PillSync },
      { hiddenPins },
      {
        rpc: { remove, clearResolved },
      },
    );
    const update = (isSubmitting: boolean, present: boolean) => {
      host.composers = [
        {
          ...composer,
          isSubmitting,
          draft: present ? draft : { text: "", mentions: [], attachments: [] },
        },
      ];
      act(() => view.lifecycle.rerender(<PillSync hiddenPins={hiddenPins} />));
    };

    update(false, false);
    expect(hiddenPins.has("a")).toBe(true);
    update(true, false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(remove).not.toHaveBeenCalled();
    expect(hiddenPins.has("a")).toBe(false);

    update(true, true);
    update(false, true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(remove).not.toHaveBeenCalled();
    expect(clearResolved).not.toHaveBeenCalled();
    expect(hiddenPins.has("a")).toBe(false);

    update(false, false);
    expect(hiddenPins.has("a")).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(remove).toHaveBeenCalledExactlyOnceWith({ threadId: "thr", id: "a" });
  });

  it("keeps the next draft visible across successful submission callbacks and subsequent sends", () => {
    vi.useFakeTimers();
    const hiddenPins = createHiddenPins();
    const clearResolved = vi.fn(async () => ({ removed: [] }));
    const remove = vi.fn(async () => ({ removed: [] }));
    const listeners = new Set<() => void>();
    const composer = {
      key: "thread:thr",
      scope: { kind: "thread", threadId: "thr" },
      onSubmitted: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const update = (ids: string[], isSubmitting: boolean) => {
      host.composers = [
        {
          ...composer,
          isSubmitting,
          draft: {
            text: ids.join(" "),
            attachments: [],
            mentions: ids.map((id) => ({
              kind: "plugin",
              pluginId: "browser-annotate",
              provider: "annotation",
              id,
              from: 0,
              to: 1,
              label: id,
            })),
          },
        } as unknown as PluginComposerApi,
      ];
    };
    update(["a"], false);
    const view = renderSlot(
      { component: PillSync },
      { hiddenPins },
      { rpc: { remove, clearResolved } },
    );
    const observe = (ids: string[], isSubmitting: boolean) => {
      update(ids, isSubmitting);
      act(() => view.lifecycle.rerender(<PillSync hiddenPins={hiddenPins} />));
    };
    const submitted = () => act(() => listeners.forEach((listener) => listener()));

    observe([], true);
    observe(["b"], true);
    submitted();
    observe(["b"], true);
    expect(hiddenPins.has("a")).toBe(true);
    expect(hiddenPins.has("b")).toBe(false);

    observe(["b"], false);
    observe([], true);
    submitted();
    observe([], false);
    vi.advanceTimersByTime(5000);
    expect(hiddenPins.has("b")).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    expect(clearResolved).toHaveBeenCalledTimes(2);
  });
});
