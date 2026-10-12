// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPluginApp,
  mountPluginContentScripts,
  renderSlot,
  type MountedPluginContentScripts,
} from "@get-bb/plugin-sdk/testing/app";
import { VIEW_EXTENSION_KIND, type ViewRow, type ViewState } from "../subagents-contract.js";

const app = await loadPluginApp(() => import("../../app.js"));
let scripts: MountedPluginContentScripts | undefined;
afterEach(async () => {
  cleanup();
  await scripts?.lifecycle.dispose();
  scripts = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function root(runId = "run-1", label = "Reviewer"): ViewRow {
  return {
    id: `session/path/${runId}`,
    runId,
    label,
    sessionId: "session",
    generation: 1,
    source: "background",
    kind: "subagent",
    state: "running",
    incomplete: false,
    observedAt: 1,
  };
}
const roots = [root(), root("run-2", "Builder")];
function state(rows = roots): ViewState {
  return {
    kind: "pi-subagents-view",
    version: 1,
    updatedAt: 1,
    availability: "available",
    reason: "",
    omitted: 0,
    rows,
  };
}
function events(rows = roots) {
  return [
    {
      type: "thread/extensionState/updated",
      data: { kind: VIEW_EXTENSION_KIND, payload: state(rows) },
    },
  ];
}

// Shapes from BB 0.45.0 ThreadDetailView-D2XowauQ.js, Dc/Ec and its activity card.
// Preserve structural and accessible attributes, not theme utility class names.
function fixture(
  shape: "singleton" | "aggregate" | "narrow" = "singleton",
  rows = roots,
  expandedOnce = true,
) {
  const card = document.createElement("section");
  card.setAttribute("aria-label", "Background agents");
  const wrapper = document.createElement("div");
  const header = document.createElement(shape === "singleton" ? "div" : "button");
  const description = `${rows[0]!.label} [${rows[0]!.runId}]`;
  header.setAttribute(
    "aria-label",
    `${shape === "singleton" ? "Background agent" : "Background agents"}: ${description} · Model test-model`,
  );
  header.innerHTML = `<span>Running background agent:</span><span title="${description}">${description}</span><span>1s</span>`;
  if (shape !== "singleton") {
    header.id = "thread-background-commands-card-toggle";
    header.setAttribute("type", "button");
    header.setAttribute("aria-controls", "thread-background-commands-card-body");
    header.setAttribute("aria-expanded", "false");
    if (shape === "narrow") {
      header.setAttribute(
        "aria-label",
        `Running ${rows.length} background agent${rows.length === 1 ? "" : "s"}`,
      );
      header.textContent = header.getAttribute("aria-label");
    }
    header.addEventListener("click", () =>
      header.setAttribute("aria-expanded", String(header.getAttribute("aria-expanded") !== "true")),
    );
  }
  if (shape === "aggregate") {
    const more = document.createElement("span");
    more.textContent = `+${rows.length - 1} more`;
    header.append(more);
  }
  wrapper.append(header);
  card.append(wrapper);
  if (shape !== "singleton") {
    const body = document.createElement("section");
    body.id = "thread-background-commands-card-body";
    body.setAttribute("role", "region");
    body.setAttribute("aria-hidden", "true");
    body.setAttribute("aria-labelledby", header.id);
    const inner = document.createElement("div");
    body.append(inner);
    function populate() {
      if (inner.childNodes.length) return;
      for (const row of shape === "narrow" ? rows : rows.slice(1)) {
        const item = document.createElement("div");
        const span = document.createElement("span");
        span.title = `${row.label} [${row.runId}]`;
        span.textContent = span.title;
        item.append(span);
        inner.append(item);
      }
    }
    if (expandedOnce) populate();
    header.addEventListener("click", () => {
      const expanded = header.getAttribute("aria-expanded") === "true";
      body.setAttribute("aria-hidden", String(!expanded));
      if (expanded) populate();
    });
    card.append(body);
  }
  document.body.append(card);
  return { card, header };
}
async function mount(
  rows = roots,
  openThreadPanel = vi.fn(() => true),
  list = vi.fn(async () => events(rows) as never),
  providerId = "pi-subagents",
) {
  const customization = app.composerCustomizations.find(
    (item) => item.id === "native-subagents-navigation",
  );
  expect(customization, "the SDK navigation receiver must be registered").toBeDefined();
  expect(customization!.scopes).toEqual(["thread"]);
  expect(customization!.banners![0]!.chrome).toBe("bare");
  scripts = await mountPluginContentScripts(app, { pluginId: "pi-subagents-provider" });
  expect(scripts.inspection.mountedIds).toContain("native-subagents-navigation");
  const view = renderSlot(
    customization!.banners![0]!,
    {},
    {
      composer: {
        scope: { kind: "thread", threadId: "thread-1" },
        text: "Unsent parent draft",
        selection: { providerId },
      },
      sdk: { threads: { events: { list } } },
      openThreadPanel,
    },
  );
  if (providerId === "pi-subagents") await waitFor(() => expect(list).toHaveBeenCalled());
  return { view, openThreadPanel, list };
}
it.each(["singleton", "aggregate", "narrow"] as const)(
  "binds a validated %s from a full bounded history window",
  async (shape) => {
    const { header } = fixture(shape);
    const list = vi.fn(
      async (_args?: unknown) => Array.from({ length: 64 }, () => events()[0]!) as never,
    );
    const { openThreadPanel } = await mount(
      roots,
      vi.fn(() => true),
      list,
    );
    await waitFor(() => expect(header.hasAttribute("data-pi-subagents-navigation")).toBe(true));
    fireEvent.click(header);
    expect(openThreadPanel).toHaveBeenCalledExactlyOnceWith({
      actionId: "subagents",
      params: shape === "singleton" ? { rowId: roots[0]!.id } : { overview: true },
    });
    expect(list.mock.calls[0]![0]).toMatchObject({ limit: "64" });
  },
);

it("still rejects malformed latest state when older valid data fills the window", async () => {
  const { header } = fixture();
  const list = vi.fn(
    async () =>
      [
        {
          ...events()[0]!,
          data: { kind: VIEW_EXTENSION_KIND, payload: { ...state(), version: 2 } },
        },
        ...Array.from({ length: 63 }, () => events()[0]!),
      ] as never,
  );
  const { openThreadPanel } = await mount(
    roots,
    vi.fn(() => true),
    list,
  );
  await waitFor(() => expect(list).toHaveResolved());
  await act(async () => {});
  expect(header.hasAttribute("data-pi-subagents-navigation")).toBe(false);
  fireEvent.click(header);
  expect(openThreadPanel).not.toHaveBeenCalled();
});

describe("native composer navigation", () => {
  it("uses the existing singleton without rendering another bar or changing the draft", async () => {
    const { card, header } = fixture();
    const originalText = card.textContent;
    const elements = card.querySelectorAll("*").length;
    const { view, openThreadPanel } = await mount();
    await waitFor(() => expect(header.getAttribute("role")).toBe("button"));
    fireEvent.click(header);
    expect(openThreadPanel).toHaveBeenCalledWith({
      actionId: "subagents",
      params: { rowId: roots[0]!.id },
    });
    expect(view.container.childNodes.length).toBe(0);
    expect(card.textContent).toBe(originalText);
    expect(card.querySelectorAll("*").length).toBe(elements);
    expect(view.inspection.composer.text).toBe("Unsent parent draft");
    expect(view.inspection.sdkCalls.map((call) => call.method)).toEqual(["threads.events.list"]);
    fireEvent.click(header);
    expect(openThreadPanel.mock.calls[1]).toEqual(openThreadPanel.mock.calls[0]);
  });

  it.each(["Enter", " "])("makes the singleton keyboard accessible with %s", async (key) => {
    const { header } = fixture();
    const { openThreadPanel } = await mount();
    await waitFor(() => expect(header.tabIndex).toBe(0));
    header.focus();
    expect(document.activeElement).toBe(header);
    expect(fireEvent.keyDown(header, { key })).toBe(false);
    expect(openThreadPanel).toHaveBeenCalledTimes(1);
  });

  it.each(["aggregate", "narrow"] as const)(
    "retains native %s disclosure and uses its click path once",
    async (shape) => {
      const { header } = fixture(shape);
      const { openThreadPanel } = await mount();
      await waitFor(() => expect(header.getAttribute("aria-description")).toContain("Subagents"));
      // jsdom does not synthesize a native button click from a keyboard event.
      fireEvent.keyDown(header, { key: "Enter" });
      expect(openThreadPanel).not.toHaveBeenCalled();
      fireEvent.click(header);
      expect(header.getAttribute("aria-expanded")).toBe("true");
      expect(openThreadPanel).toHaveBeenCalledTimes(1);
      expect(openThreadPanel).toHaveBeenCalledWith({
        actionId: "subagents",
        params: { overview: true },
      });
    },
  );

  it.each(["transcript", "commands", "mixed", "foreign", "changed", "ambiguous"])(
    "leaves %s UI untouched",
    async (kind) => {
      const { card, header } = fixture();
      let rows = roots;
      if (kind === "transcript") card.removeAttribute("aria-label");
      if (kind === "commands") card.setAttribute("aria-label", "Background commands");
      if (kind === "mixed") card.setAttribute("aria-label", "Background activity");
      if (kind === "foreign")
        header.setAttribute("aria-label", "Background agent: Other [foreign-run]");
      if (kind === "changed") header.setAttribute("aria-label", "New BB shape");
      if (kind === "ambiguous")
        rows = [...roots, { ...roots[0]!, id: "other-session/run-1", sessionId: "other-session" }];
      const original = card.outerHTML;
      const { view, openThreadPanel } = await mount(rows);
      await waitFor(() => expect(view.inspection.sdkCalls.length).toBe(1));
      fireEvent.click(header);
      expect(openThreadPanel).not.toHaveBeenCalled();
      expect(card.outerHTML).toBe(original);
    },
  );

  it("does not bind foreground-only observations", async () => {
    const { header } = fixture();
    const { view, openThreadPanel } = await mount(
      roots.map((row) => ({ ...row, source: "foreground" })),
    );
    await waitFor(() => expect(view.inspection.sdkCalls.length).toBe(1));
    fireEvent.click(header);
    expect(header.hasAttribute("role")).toBe(false);
    expect(openThreadPanel).not.toHaveBeenCalled();
  });

  it("reports a declined open on the existing element without retrying", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { card, header } = fixture();
    const text = card.textContent;
    const { openThreadPanel } = await mount(
      roots,
      vi.fn(() => false),
    );
    await waitFor(() => expect(header.tabIndex).toBe(0));
    fireEvent.click(header);
    expect(header.title).toContain("Could not open Subagents");
    expect(header.getAttribute("aria-description")).toContain("panel actions");
    expect(card.textContent).toBe(text);
    expect(openThreadPanel).toHaveBeenCalledTimes(1);
  });

  it("rebinds a replaced bar once and removes detached handlers", async () => {
    const first = fixture();
    const { openThreadPanel } = await mount();
    await waitFor(() => expect(first.header.tabIndex).toBe(0));
    first.card.remove();
    const next = fixture();
    await waitFor(() => expect(next.header.tabIndex).toBe(0));
    expect(first.header.hasAttribute("role")).toBe(false);
    fireEvent.click(first.header);
    expect(openThreadPanel).not.toHaveBeenCalled();
    next.header.querySelector("span:last-child")!.textContent = "2s";
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(next.header);
    expect(openThreadPanel).toHaveBeenCalledTimes(1);
  });

  it("revalidates a reused element before its mutation observer runs", async () => {
    const { header } = fixture();
    const { openThreadPanel } = await mount();
    await waitFor(() => expect(header.tabIndex).toBe(0));
    header.setAttribute("aria-label", "Background agent: Foreign [foreign]");
    fireEvent.click(header);
    expect(openThreadPanel).not.toHaveBeenCalled();
    expect(header.hasAttribute("role")).toBe(false);
  });

  it("restores owned attributes and styles on abort, preserving later host changes", async () => {
    const { header, card } = fixture();
    header.setAttribute("aria-description", "Native hint");
    const original = card.outerHTML;
    const { view, openThreadPanel } = await mount();
    await waitFor(() => expect(header.tabIndex).toBe(0));
    await scripts!.lifecycle.dispose();
    expect(card.outerHTML).toBe(original);
    expect(document.head.querySelector("style")?.textContent ?? "").not.toContain(
      "data-pi-subagents-navigation",
    );
    fireEvent.click(header);
    expect(openThreadPanel).not.toHaveBeenCalled();
    scripts = await mountPluginContentScripts(app, {
      pluginId: "pi-subagents-provider",
      generation: 2,
    });
    await waitFor(() => expect(header.tabIndex).toBe(0));
    header.setAttribute("aria-description", "Updated host hint");
    header.setAttribute("tabindex", "3");
    view.unmount();
    expect(header.getAttribute("aria-description")).toBe("Updated host hint");
    expect(header.tabIndex).toBe(3);
    expect(header.hasAttribute("role")).toBe(false);
    fireEvent.click(header);
    expect(openThreadPanel).not.toHaveBeenCalled();
  });

  it("does not accept late history from a previous thread", async () => {
    let finish!: (value: never) => void;
    const pending = new Promise<never>((resolve) => {
      finish = resolve;
    });
    const nextRoots = [root("run-new", "New reviewer")];
    const list = vi
      .fn(async () => pending)
      .mockImplementationOnce(async () => pending)
      .mockImplementationOnce(async () => events(nextRoots) as never);
    const first = fixture();
    const { view, openThreadPanel } = await mount(
      roots,
      vi.fn(() => true),
      list,
    );
    const signal = (list.mock.calls[0] as unknown as [{ signal: AbortSignal }])[0].signal;
    await view.behavior.setComposerScope({ kind: "thread", threadId: "thread-2" });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      finish(events() as never);
      await Promise.resolve();
    });
    fireEvent.click(first.header);
    expect(first.header.hasAttribute("role")).toBe(false);
    expect(openThreadPanel).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledTimes(2);
    first.card.remove();
    const next = fixture("singleton", nextRoots);
    await waitFor(() => expect(next.header.tabIndex).toBe(0));
    fireEvent.click(next.header);
    expect(openThreadPanel).toHaveBeenCalledWith({
      actionId: "subagents",
      params: { rowId: nextRoots[0]!.id },
    });
  });

  it("does not let an older receiver disposal remove a newer owner", async () => {
    const { header } = fixture();
    const first = await mount();
    await waitFor(() => expect(header.tabIndex).toBe(0));
    const open = vi.fn(() => true);
    const customization = app.composerCustomizations.find(
      (item) => item.id === "native-subagents-navigation",
    )!;
    const second = renderSlot(
      customization.banners![0]!,
      {},
      {
        composer: {
          scope: { kind: "thread", threadId: "thread-2" },
          selection: { providerId: "pi-subagents" },
        },
        sdk: { threads: { events: { list: async () => events() as never } } },
        openThreadPanel: open,
      },
    );
    await waitFor(() => expect(header.hasAttribute("role")).toBe(false));
    fireEvent.click(header);
    expect(first.openThreadPanel).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    first.view.unmount();
    await waitFor(() => expect(header.tabIndex).toBe(0));
    fireEvent.click(header);
    expect(open).toHaveBeenCalledTimes(1);
    second.unmount();
    expect(header.hasAttribute("role")).toBe(false);
  });

  it.each(["aggregate", "narrow"] as const)(
    "opens the %s overview before first expansion without a guessed root",
    async (shape) => {
      const { header, card } = fixture(shape, roots, false);
      const { openThreadPanel } = await mount();
      await waitFor(() => expect(header.getAttribute("aria-description")).toContain("Subagents"));
      expect(card.querySelector("#thread-background-commands-card-body span[title]")).toBeNull();
      fireEvent.click(header);
      expect(header.getAttribute("aria-expanded")).toBe("true");
      expect(openThreadPanel).toHaveBeenCalledExactlyOnceWith({
        actionId: "subagents",
        params: { overview: true },
      });
      fireEvent.click(header);
      expect(openThreadPanel.mock.calls[1]).toEqual(openThreadPanel.mock.calls[0]);
    },
  );

  it.each(["pi", "codex", ""])(
    "does not poll or decorate a different provider: %s",
    async (providerId) => {
      const { header, card } = fixture("narrow", roots, false);
      const original = card.outerHTML;
      const { list, openThreadPanel } = await mount(
        roots,
        vi.fn(() => true),
        vi.fn(async () => events() as never),
        providerId,
      );
      fireEvent.click(header);
      expect(list).not.toHaveBeenCalled();
      expect(openThreadPanel).not.toHaveBeenCalled();
      expect(header.hasAttribute("data-pi-subagents-navigation")).toBe(false);
      expect(card.getAttribute("aria-label")).toBe("Background agents");
      expect(original).not.toContain("data-pi-subagents-navigation");
    },
  );

  it.each([
    ["aggregate", "foreign"],
    ["narrow", "foreign"],
    ["aggregate", "ambiguous"],
    ["narrow", "ambiguous"],
  ] as const)("leaves a %s card with %s exposed body identities untouched", async (shape, kind) => {
    const { card, header } = fixture(shape);
    const span = card.querySelector<HTMLSpanElement>(
      "#thread-background-commands-card-body span[title]",
    )!;
    let observations = roots;
    if (kind === "foreign") {
      span.title = "Foreign [foreign-run]";
      span.textContent = span.title;
    } else {
      const bodyRoot = shape === "aggregate" ? roots[1]! : roots[0]!;
      observations = [
        ...roots,
        { ...bodyRoot, id: "other-session/" + bodyRoot.runId, sessionId: "other-session" },
      ];
    }
    const original = card.outerHTML;
    const { openThreadPanel } = await mount(observations);
    await act(async () => {
      await Promise.resolve();
    });
    expect(card.outerHTML).toBe(original);
    fireEvent.click(header);
    expect(openThreadPanel).not.toHaveBeenCalled();
  });

  it.each([
    ["role", "note", "body"],
    ["type", "submit", "header"],
    ["aria-labelledby", "other-toggle", "body"],
    ["aria-expanded", "invalid", "header"],
  ] as const)(
    "removes lost bindings after %s changes without activation or refresh",
    async (name, value, target) => {
      const { card, header } = fixture("narrow");
      const { openThreadPanel, list } = await mount();
      await waitFor(() => expect(header.hasAttribute("data-pi-subagents-navigation")).toBe(true));
      const element =
        target === "body"
          ? card.querySelector<HTMLElement>("#thread-background-commands-card-body")!
          : header;
      element.setAttribute(name, value);
      await waitFor(() => expect(header.hasAttribute("data-pi-subagents-navigation")).toBe(false));
      expect(header.hasAttribute("aria-description")).toBe(false);
      expect(element.getAttribute(name)).toBe(value);
      expect(openThreadPanel).not.toHaveBeenCalled();
      expect(list).toHaveBeenCalledTimes(1);
    },
  );
});
