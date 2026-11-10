import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { ExperimentalPluginBrowserToolbarActionProps } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot, type RenderSlotOptions } from "@get-bb/plugin-sdk/testing/app";
import definition from "../app";
import type { rpcContract } from "../lib/contract";

const app = await loadPluginApp(definition);
const toolbar = app.browserToolbarActions[0]!;

afterEach(cleanup);

function fakePage() {
  let installed = false;
  let listener: ((data: unknown) => void) | null = null;
  return {
    evaluate: vi.fn(async (script: string) => {
      if (script.includes("bb.postMessage")) installed = true;
      return installed;
    }),
    onMessage: vi.fn((next: (data: unknown) => void) => {
      listener = next;
      return () => {
        listener = null;
      };
    }),
    emit: (data: unknown) => listener?.(data),
  };
}

type Rpc = NonNullable<RenderSlotOptions<typeof rpcContract>["rpc"]>;

function rpc(): Rpc {
  return {
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(async () => ({ removed: [] })),
    listForUrl: vi.fn(async () => []),
    listForThread: vi.fn(async () => []),
    clearResolved: vi.fn(async () => ({ removed: [] })),
  } as unknown as Rpc;
}

function props(overrides: Partial<ExperimentalPluginBrowserToolbarActionProps> = {}) {
  return {
    threadId: "thr",
    tabId: "tab",
    url: "https://example.com/a",
    isCompactViewport: false,
    experimental_page: fakePage(),
    ...overrides,
  } as ExperimentalPluginBrowserToolbarActionProps;
}

describe("plugin registration", () => {
  it("adds one Browser toolbar control and one headless overlay", () => {
    expect(app.browserToolbarActions.map((action) => action.id)).toEqual(["annotate"]);
    expect(app.appOverlays.map((overlay) => overlay.id)).toEqual(["pill-sync"]);
  });
});

describe("Annotate control", () => {
  it("is not shown without page script access", () => {
    const view = renderSlot(toolbar, props({ experimental_page: null }), { rpc: rpc() });

    expect(view.queryByRole("button")).toBeNull();
  });

  it("shows activation failures and waits for success before showing active", async () => {
    const page = fakePage();
    const view = renderSlot(toolbar, props({ experimental_page: page }), { rpc: rpc() });
    await act(async () => {});
    const button = view.getByRole("button", { name: "Annotate page" });
    let reject!: (error: Error) => void;
    page.evaluate.mockImplementationOnce(
      () =>
        new Promise<boolean>((_resolve, fail) => {
          reject = fail;
        }),
    );

    fireEvent.click(button);
    await act(async () => {});

    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(true);
    await act(async () => reject(new Error("Page scripting denied")));
    expect(view.getByRole("alert").textContent).toContain("Page scripting denied");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.hasAttribute("disabled")).toBe(false);

    let resolve!: (value: boolean) => void;
    page.evaluate.mockImplementationOnce(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    fireEvent.click(button);
    await act(async () => {});
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await act(async () => resolve(true));

    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(view.queryByRole("alert")).toBeNull();
    expect(
      page.evaluate.mock.calls.filter(([script]) => script.includes("bb.postMessage")),
    ).toHaveLength(1);
    page.evaluate.mockRejectedValueOnce(new Error("Stop blocked"));
    fireEvent.click(button);
    await act(async () => {});
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(view.getByRole("alert").textContent).toContain("Stop blocked");
    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute("aria-pressed")).toBe("false"));
  });

  it("shows an initial installation failure without retrying it through the theme or watchdog", async () => {
    vi.useFakeTimers();
    try {
      const page = fakePage();
      page.evaluate.mockRejectedValueOnce(new Error("Installation blocked"));
      const view = renderSlot(toolbar, props({ experimental_page: page }), { rpc: rpc() });
      await act(async () => {});
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(view.getByRole("alert").textContent).toContain("Installation blocked");
      expect(view.getByRole("button").getAttribute("aria-pressed")).toBe("false");
      expect(
        page.evaluate.mock.calls.filter(([script]) => script.includes("bb.postMessage")),
      ).toHaveLength(1);

      page.evaluate.mockRejectedValueOnce(new Error("Activation blocked"));
      fireEvent.click(view.getByRole("button"));
      await act(async () => {});
      expect(view.getByRole("alert").textContent).toContain("Activation blocked");
      expect(view.getByRole("alert").textContent).not.toContain("Installation blocked");
      expect(view.getByRole("button").getAttribute("aria-pressed")).toBe("false");

      fireEvent.click(view.getByRole("button"));
      await act(async () => {});
      expect(view.getByRole("button").getAttribute("aria-pressed")).toBe("true");
      expect(view.queryByRole("alert")).toBeNull();
      expect(
        page.evaluate.mock.calls.filter(([script]) => script.includes("bb.postMessage")),
      ).toHaveLength(2);
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it("clears stale activation after a failed page attach and restores confirmed mode after healthy navigation", async () => {
    const page = fakePage();
    const view = renderSlot(toolbar, props({ experimental_page: page }), { rpc: rpc() });
    await act(async () => {});
    const button = view.getByRole("button");
    fireEvent.click(button);
    await act(async () => {});
    expect(button.getAttribute("aria-pressed")).toBe("true");
    page.evaluate.mockRejectedValueOnce(new Error("New page blocked"));
    const Toolbar = toolbar.component;

    act(() =>
      view.lifecycle.rerender(
        <Toolbar {...props({ experimental_page: page, url: "https://example.com/b" })} />,
      ),
    );
    await act(async () => {});

    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(view.getByRole("alert").textContent).toContain("New page blocked");

    act(() =>
      view.lifecycle.rerender(
        <Toolbar {...props({ experimental_page: page, url: "https://example.com/c" })} />,
      ),
    );
    await act(async () => {});
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(view.queryByRole("alert")).toBeNull();
  });

  it("shows a fallback for unknown failures and keeps the composer draft on manual recovery", async () => {
    const page = fakePage();
    const draft = {
      text: "Review 1 · button",
      mentions: [
        {
          kind: "plugin" as const,
          pluginId: "browser-annotate",
          provider: "annotation",
          id: "a",
          from: 7,
          to: 17,
          label: "1 · button",
        },
      ],
    };
    const view = renderSlot(toolbar, props({ experimental_page: page }), {
      rpc: rpc(),
      composer: { ...draft, scope: { kind: "thread", threadId: "thr" } },
    });
    await act(async () => {});
    page.evaluate.mockRejectedValueOnce(null);

    fireEvent.click(view.getByRole("button"));
    await act(async () => {});

    expect(view.getByRole("alert").textContent).toContain(
      "Browser Annotate could not run on this page.",
    );
    expect(view.inspection.composer.draft).toEqual({ ...draft, attachments: [] });
    fireEvent.click(view.getByRole("button"));
    await act(async () => {});
    expect(view.getByRole("button").getAttribute("aria-pressed")).toBe("true");
    expect(view.queryByRole("alert")).toBeNull();
    expect(view.inspection.composer.draft).toEqual({ ...draft, attachments: [] });
  });

  it("reports a watchdog failure once and resumes checks only after manual success", async () => {
    vi.useFakeTimers();
    try {
      const page = fakePage();
      const view = renderSlot(toolbar, props({ experimental_page: page }), { rpc: rpc() });
      await act(async () => {});
      page.evaluate.mockClear();
      page.evaluate.mockRejectedValueOnce(new Error("Watchdog blocked"));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(view.getByRole("alert").textContent).toContain("Watchdog blocked");
      expect(page.evaluate).toHaveBeenCalledTimes(1);
      fireEvent.click(view.getByRole("button"));
      await act(async () => {});
      expect(view.getByRole("button").getAttribute("aria-pressed")).toBe("true");
      expect(view.queryByRole("alert")).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(page.evaluate.mock.calls.at(-1)?.[0]).toContain("await api.ping()");
      expect(page.evaluate).toHaveBeenCalledTimes(3);
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it("shows internal page-message failures", async () => {
    const page = fakePage();
    const handlers = rpc();
    vi.mocked(handlers.update!).mockRejectedValueOnce(new Error("Comment update failed"));
    const view = renderSlot(toolbar, props({ experimental_page: page }), { rpc: handlers });
    await act(async () => {});

    await act(async () => page.emit({ type: "update", id: "a", comment: "Keep this" }));

    expect(view.getByRole("alert").textContent).toContain("Comment update failed");
    expect(view.getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });

  it("turns annotate mode off with Esc while the control has focus", async () => {
    const page = fakePage();
    const view = renderSlot(toolbar, props({ experimental_page: page }), { rpc: rpc() });
    const button = view.getByRole("button", { name: "Annotate page" });
    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute("aria-pressed")).toBe("true"));

    fireEvent.keyDown(button, { key: "Escape" });

    await waitFor(() => expect(button.getAttribute("aria-pressed")).toBe("false"));

    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute("aria-pressed")).toBe("true"));
    await act(async () => page.emit({ type: "mode", on: false }));
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps one controller across host re-renders", async () => {
    const page = fakePage();
    const view = renderSlot(toolbar, props({ experimental_page: page }), { rpc: rpc() });
    await waitFor(() => expect(page.onMessage).toHaveBeenCalledTimes(1));

    const Toolbar = toolbar.component;
    act(() => view.lifecycle.rerender(<Toolbar {...props({ experimental_page: page })} />));
    act(() => view.lifecycle.rerender(<Toolbar {...props({ experimental_page: page })} />));

    expect(page.onMessage).toHaveBeenCalledTimes(1);
    expect(
      page.evaluate.mock.calls.some(([script]) => script.includes("await api.teardown(")),
    ).toBe(false);
  });

  it("loads the pins of the new page when the URL changes", async () => {
    const handlers = rpc();
    const page = fakePage();
    const view = renderSlot(toolbar, props({ experimental_page: page }), { rpc: handlers });
    await waitFor(() =>
      expect(handlers.listForUrl).toHaveBeenCalledWith({
        threadId: "thr",
        url: "https://example.com/a",
      }),
    );

    const Toolbar = toolbar.component;
    act(() =>
      view.lifecycle.rerender(
        <Toolbar {...props({ experimental_page: page, url: "https://example.com/b" })} />,
      ),
    );

    await waitFor(() =>
      expect(handlers.listForUrl).toHaveBeenCalledWith({
        threadId: "thr",
        url: "https://example.com/b",
      }),
    );
  });

  it("reloads pins when another surface changes the thread's annotations", async () => {
    const handlers = rpc();
    const view = renderSlot(toolbar, props(), { rpc: handlers });
    await waitFor(() => expect(handlers.listForUrl).toHaveBeenCalledTimes(1));

    await view.behavior.emitRealtime("annotations:changed", { threadId: "other" });
    await view.behavior.emitRealtime("annotations:changed", { threadId: "thr" });

    await waitFor(() => expect(handlers.listForUrl).toHaveBeenCalledTimes(2));
  });
});
