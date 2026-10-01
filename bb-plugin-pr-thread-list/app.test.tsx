// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { RenderSlotOptions } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThreadsState } from "@get-bb/plugin-sdk/app";
import type { PluginSidebarThreadRowStatus, PluginSidebarThreadShortcut, PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { project, thread } from "./fixtures";

const app = await loadPluginApp(() => import("./app"));
let mounted: ReturnType<typeof renderSlot> | undefined;
afterEach(() => { mounted?.lifecycle.unmount(); mounted = undefined; localStorage.clear(); });

function showLifecycle(slot: ReturnType<typeof renderSlot>, name: string) {
  fireEvent.click(slot.getByRole("radio", { name }));
}
function chooseOption(slot: ReturnType<typeof renderSlot>, name: string) {
  fireEvent.click(slot.getByRole("button", { name: "List options" }));
  fireEvent.click(screen.getByRole("menuitemradio", { name }));
}
function optionChecked(slot: ReturnType<typeof renderSlot>, name: string) {
  fireEvent.click(slot.getByRole("button", { name: "List options" }));
  const checked = screen.getByRole("menuitemradio", { name }).getAttribute("aria-checked") === "true";
  fireEvent.keyDown(document, { key: "Escape" });
  return checked;
}

function tip(slot: ReturnType<typeof renderSlot>, text: string) {
  return Array.from(slot.container.querySelectorAll("[data-tip]")).find((node) => node.textContent === text);
}

function mount(threads = [thread()], state: Partial<PluginSidebarThreadsState> = {},
  extras: Partial<RenderSlotOptions> = {}, props: Partial<PluginThreadListProps> = {}) {
  const slot = app.threadLists[0]!;
  mounted = renderSlot(slot, {
    activeThreadId: null, activeProjectId: null, isCompactViewport: false,
    onNavigate: () => {}, searchQuery: "", ...props,
  }, { sidebarThreads: { threads, projects: [project], sections: [], ...state }, ...extras });
  return mounted;
}

describe("thread list slot", () => {
  it("registers one selectable list and renders a seeded thread", () => {
    expect(app.threadLists).toHaveLength(1);
    expect(app.threadLists[0]?.title).toBe("Threads with PRs");
    expect(mount().getByRole("link", { name: /Prepare release/ }).getAttribute("href"))
      .toBe("/projects/p1/threads/t1");
  });
  it("stores options and collapsed groups across remounts", () => {
    const first = mount();
    chooseOption(first, "Machine");
    showLifecycle(first, "Both");
    chooseOption(first, "Title");
    first.lifecycle.unmount();
    mounted = undefined;
    const second = mount();
    expect(optionChecked(second, "Machine")).toBe(true);
    expect(second.getByRole("radio", { name: "Both" })).toHaveProperty("checked", true);
    expect(optionChecked(second, "Title")).toBe(true);
    fireEvent.click(second.getByRole("button", { name: "Collapse Threads" }));
    expect(second.queryByRole("link", { name: /Prepare release/ })).toBeNull();
    second.lifecycle.unmount();
    mounted = undefined;
    const third = mount();
    expect(third.queryByRole("link", { name: /Prepare release/ })).toBeNull();
    fireEvent.click(third.getByRole("button", { name: "List options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reset list preferences" }));
    expect(optionChecked(third, "Project")).toBe(true);
  });
  it("pages archived threads and handles loading, errors, emptiness and exhaustion", () => {
    const fetchNextPage = vi.fn().mockResolvedValue(undefined);
    const page = { status: "ready" as const, hasNextPage: true, isFetchingNextPage: false,
      isFetchNextPageError: false, fetchNextPage };
    const first = mount([thread({ isArchived: true })], { experimental_archived: page });
    showLifecycle(first, "Archived");
    expect(first.getByRole("link", { name: /Prepare release/ })).toBeTruthy();
    fireEvent.click(first.getByRole("button", { name: "Show more" }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
    first.lifecycle.unmount();
    const loading = mount([], { experimental_archived: { ...page, status: "loading", isFetchingNextPage: true } });
    showLifecycle(loading, "Archived");
    expect(loading.getByRole("status").textContent).toContain("Loading archived");
    expect(loading.queryByRole("button", { name: "Show more" })).toBeNull();
    loading.lifecycle.unmount();
    const error = mount([], { experimental_archived: { ...page, status: "error", isFetchNextPageError: true } });
    showLifecycle(error, "Archived");
    expect(error.getByRole("alert").textContent).toContain("Archived threads");
    fireEvent.click(error.getByRole("button", { name: "Retry archive" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(2);
    error.lifecycle.unmount();
    const initialError = mount([], { status: "error", experimental_archived: { ...page, status: "error", hasNextPage: false } });
    showLifecycle(initialError, "Archived");
    fireEvent.click(initialError.getByRole("button", { name: "Retry archive" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(3);
    initialError.lifecycle.unmount();
    const empty = mount([], { experimental_archived: { ...page, hasNextPage: false } });
    showLifecycle(empty, "Archived");
    expect(empty.getByText("No threads")).toBeTruthy();
    expect(empty.queryByRole("button", { name: "Show more" })).toBeNull();
  });
  it("windows large lists and excludes offscreen and collapsed PR consumers", () => {
    const rows = Array.from({ length: 240 }, (_, index) => thread({ id: `t${index}`,
      displayTitle: `Thread ${index}`, updatedAt: 240 - index, isUnread: true }));
    const slot = mount(rows);
    expect(slot.queryAllByTestId("pr-hook-consumer").length).toBeLessThan(40);
    expect(slot.queryByRole("link", { name: /Thread 180$/ })).toBeNull();
    const scroller = slot.getByTestId("thread-scroll");
    scroller.scrollTop = 36 + 48 * 180;
    fireEvent.scroll(scroller);
    expect(slot.getByRole("link", { name: /Thread 180$/ })).toBeTruthy();
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    fireEvent.click(slot.getByRole("button", { name: "Collapse Sample project" }));
    expect(slot.queryAllByTestId("pr-hook-consumer")).toHaveLength(0);
  });
  it("shows activity, selected/unread, draft or plugin status, and shortcut cues", () => {
    const busy = thread({ status: "active", runtimeStatus: "active", isUnread: true,
      indicator: "waiting-for-input", indicatorLabel: "Thread needs user input", queuedWork: "waiting",
      activity: { workflows: 2, backgroundAgents: 1, backgroundCommands: 0, planMode: 0, goals: 0 },
    });
    const slot = mount([busy], {}, { sidebarDraftThreadIds: ["t1"],
      sidebarRowStatuses: { t1: { icon: "Clock", label: "Scheduled", tone: "running" } },
      sidebarShortcuts: { t1: { label: "⌘1", ariaKeyshortcuts: "Meta+1" } },
    }, { activeThreadId: "t1" });
    const link = slot.getByRole("link", { name: /Prepare release/ });
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.getAttribute("aria-keyshortcuts")).toBe("Meta+1");
    expect(link.className).toContain("font-semibold");
    expect(slot.getByTitle("Thread needs user input").textContent).toBe("Needs you");
    expect(tip(slot, "Scheduled")).toBeTruthy();
    expect(slot.queryByTitle("Unsent draft")).toBeNull();
    expect(slot.getByText("⌘1")).toBeTruthy();
    expect(tip(slot, "2 workflows")).toBeTruthy();
    expect(slot.getByText("1 background agent", { selector: ".sr-only" })).toBeTruthy();
    expect(tip(slot, "Queued message waiting")).toBeTruthy();
    expect(slot.getByRole("button", { name: "Collapse Needs you" })).toBeTruthy();
  });
  it("marks a running thread and shows its branch when nothing else needs saying", () => {
    const environment = { id: "e1", name: "Worktree", branchName: "feature/sidebar", path: "/tmp/feature",
      isWorktree: true, providerId: null, workspaceDisplayKind: null };
    const slot = mount([thread({ status: "active", runtimeStatus: "active", environment })]);
    const working = slot.getByTitle("Thread active");
    expect(working.querySelector(".sr-only")?.textContent).toBe("Working");
    expect(working.textContent).toBe("Working");
    expect(slot.container.querySelector("time")).toBeNull();
    expect(slot.getByText("feature/sidebar")).toBeTruthy();
  });
  it("groups list options into labelled radio sets and names the order for the sort field", () => {
    const slot = mount();
    fireEvent.click(slot.getByRole("button", { name: "List options" }));
    const order = screen.getByRole("group", { name: "Order" });
    expect(Array.from(order.querySelectorAll("[role=menuitemradio]"), (item) => item.textContent)).toEqual(["Newest first", "Oldest first"]);
    expect(screen.getByRole("group", { name: "Group by" }).querySelectorAll("[role=menuitemradio]")).toHaveLength(3);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Oldest first" }));
    expect(optionChecked(slot, "Oldest first")).toBe(true);
    chooseOption(slot, "Title");
    fireEvent.click(slot.getByRole("button", { name: "List options" }));
    expect(Array.from(screen.getByRole("group", { name: "Order" }).querySelectorAll("[role=menuitemradio]"), (item) => item.textContent))
      .toEqual(["A to Z", "Z to A"]);
    expect(screen.getByRole("menuitemradio", { name: "A to Z" }).getAttribute("aria-checked")).toBe("true");
  });
  it("moves through every option with the arrow keys across sections", () => {
    const slot = mount();
    fireEvent.click(slot.getByRole("button", { name: "List options" }));
    const menu = screen.getByRole("menu", { name: "List options" });
    expect(document.activeElement?.textContent).toBe("Project");
    for (let step = 0; step < 3; step += 1) fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("Last updated");
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement?.textContent).toBe("Reset list preferences");
  });
  it("badges project headers and scopes new threads to projects only", () => {
    const onNavigate = vi.fn();
    const slot = mount([thread(), thread({ id: "t2", displayTitle: "Asks", indicator: "waiting-for-input" })], {}, {}, { onNavigate });
    expect(slot.container.querySelector("[data-project-badge]")?.textContent).toBe("S");
    fireEvent.click(slot.getByRole("button", { name: "New thread in Sample project" }));
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "openNewThread", options: { projectId: "p1", focusPrompt: true } });
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(slot.queryByRole("button", { name: "New thread in Needs you" })).toBeNull();
    expect(slot.queryByRole("button", { name: "More for Sample project" })).toBeNull();
    expect(slot.queryByRole("button", { name: "More for Needs you" })).toBeNull();
  });
  it("lists quiet threads with the others and counts only the Needs you group", () => {
    const slot = mount([thread(), thread({ id: "t2", displayTitle: "Asks", hasPendingInteraction: true })]);
    expect(slot.getByRole("link", { name: /Prepare release/ })).toBeTruthy();
    expect(slot.queryByRole("button", { name: /settled/ })).toBeNull();
    expect(slot.getByRole("button", { name: "Collapse Needs you" }).parentElement?.textContent).toContain("1");
    expect(slot.getByRole("button", { name: "Collapse Sample project" }).parentElement?.textContent).not.toMatch(/\d/);
  });
  it("shows a draft when no plugin row status replaces it", () => {
    const slot = mount([thread()], {}, { sidebarDraftThreadIds: ["t1"] });
    expect(slot.getByTitle("Unsent draft").textContent).toBe("Draft");
  });
  it("routes row menu actions through BB and reorders pinned threads", () => {
    const rename = vi.spyOn(window, "prompt").mockReturnValue("Renamed");
    const sdk = { threads: { reorderPinned: vi.fn(async () => ({} as never)),
      unarchive: vi.fn(async () => ({} as never)), update: vi.fn(async () => ({} as never)) } };
    const pinned = [thread({ id: "t1", isPinned: true, pinnedAt: 10, pinSortKey: "a" }),
      thread({ id: "t2", displayTitle: "Second", isPinned: true, pinnedAt: 9, pinSortKey: "b" })];
    const slot = mount(pinned, {}, { sdk });
    const open = () => fireEvent.click(slot.getByRole("button", { name: "Actions for Prepare release" }));
    open(); fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(sdk.threads.reorderPinned).toHaveBeenCalledWith({ threadId: "t1", previousThreadId: "t2", nextThreadId: null });
    open(); fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(rename).toHaveBeenCalled();
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "rename", threadId: "t1", title: "Renamed" });
    open(); fireEvent.click(screen.getByRole("menuitem", { name: "Mark unread" }));
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "setRead", threadId: "t1", read: false });
    open(); fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "archive", threadId: "t1" });
    open(); fireEvent.click(screen.getByRole("menuitem", { name: "Delete…" }));
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "requestDelete", threadId: "t1" });
    rename.mockRestore();
  });
  it("uses public SDK operations for section changes and unarchiving", () => {
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("Later renamed");
    const sdk = { threads: { update: vi.fn(async () => ({} as never)), unarchive: vi.fn(async () => ({} as never)) },
      threadSections: { create: vi.fn(async () => ({} as never)), update: vi.fn(async () => ({} as never)) } };
    const slot = mount([thread({ isArchived: true })], {
      sections: [{ id: "s1", name: "Later", createdAt: 1, updatedAt: 1 }],
    }, { sdk });
    showLifecycle(slot, "Both");
    chooseOption(slot, "Section");
    fireEvent.click(slot.getByRole("button", { name: "Actions for Prepare release" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to Later" }));
    expect(sdk.threads.update).toHaveBeenCalledWith({ threadId: "t1", sectionId: "s1" });
    fireEvent.click(slot.getByRole("button", { name: "Actions for Prepare release" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Unarchive" }));
    expect(sdk.threads.unarchive).toHaveBeenCalledWith({ threadId: "t1" });
    fireEvent.click(slot.getByRole("button", { name: "Create section" }));
    expect(sdk.threadSections.create).toHaveBeenCalledWith({ name: "Later renamed" });
    prompt.mockRestore();
  });
  it("offers section group creation, rename and a scoped new-thread action", () => {
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("Renamed section");
    const sdk = { threadSections: { update: vi.fn(async () => ({} as never)) } };
    const slot = mount([], { sections: [{ id: "s1", name: "Later", createdAt: 1, updatedAt: 1 }] }, { sdk });
    chooseOption(slot, "Section");
    fireEvent.click(slot.getByRole("button", { name: "More for Later" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename section" }));
    expect(sdk.threadSections.update).toHaveBeenCalledWith({ id: "s1", name: "Renamed section" });
    fireEvent.click(slot.getByRole("button", { name: "New thread in Later" }));
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "openNewThread", options: { sectionId: "s1", focusPrompt: true } });
    prompt.mockRestore();
  });
  it("keeps native link semantics, keyboard targets, split drag and compact navigation", () => {
    const onNavigate = vi.fn();
    const slot = mount([thread()], {}, {}, { isCompactViewport: true, onNavigate });
    const link = slot.getByRole("link", { name: /Prepare release/ });
    expect(link.getAttribute("href")).toBe("/projects/p1/threads/t1");
    expect(link.hasAttribute("data-sidebar-thread-shortcut-target")).toBe(true);
    expect(link.getAttribute("data-sidebar-thread-id")).toBe("t1");
    fireEvent.click(link);
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "open", threadId: "t1" });
    expect(onNavigate).toHaveBeenCalledOnce();
    const preventModifiedNavigation = (event: MouseEvent) => { if (event.metaKey) event.preventDefault(); };
    document.addEventListener("click", preventModifiedNavigation);
    fireEvent.click(link, { metaKey: true });
    document.removeEventListener("click", preventModifiedNavigation);
    expect(onNavigate).toHaveBeenCalledOnce();
    fireEvent.pointerDown(link);
    expect(slot.inspection.sidebarActionCalls.filter((call) => call.method === "open")).toHaveLength(2);
    fireEvent.click(slot.getByRole("button", { name: "Actions for Prepare release" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open in split" }));
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "open", threadId: "t1", options: { split: true } });
  });
  it("renders a linked PR badge without opening the thread", () => {
    const onNavigate = vi.fn();
    const slot = mount([thread()], {}, { sidebarPullRequests: {
      t1: { number: 42, title: "Ship it", url: "https://example.com/pull/42", state: "open", attention: "checks_failed" },
    } }, { onNavigate });
    const pr = slot.getByRole("link", { name: "PR #42: checks failed" });
    expect(pr.getAttribute("href")).toBe("https://example.com/pull/42");
    expect(slot.queryByText("#42")).toBeNull();
    expect(pr.textContent).toContain("Checks failed");
    expect(slot.getByRole("link", { name: "PR #42: checks failed" })).toBe(pr);
    fireEvent.click(pr);
    expect(slot.inspection.sidebarActionCalls).toHaveLength(0);
    expect(onNavigate).not.toHaveBeenCalled();
  });
  it("shows one environment PR on both visible threads and none on an unrelated row", () => {
    const environment = { id: "e1", name: "Worktree", branchName: "feature", path: "/tmp/feature",
      isWorktree: true, providerId: null, workspaceDisplayKind: null };
    const shared = { number: 42, title: "Ship it", url: "https://example.com/pull/42",
      state: "open" as const, attention: "review_requested" as const };
    const slot = mount([thread({ id: "t1", environment }),
      thread({ id: "t2", displayTitle: "Second", environment }),
      thread({ id: "t3", displayTitle: "No PR" })], {}, { sidebarPullRequests: { t1: shared, t2: shared } });
    expect(slot.getAllByRole("link", { name: "PR #42: awaiting review" })).toHaveLength(2);
    expect(slot.queryByRole("link", { name: /PR #3/ })).toBeNull();
    expect(slot.getByRole("link", { name: "No PR" })).toBeTruthy();
  });
  it("names the reason behind a blocked PR and counts pending reviews from github-insight", async () => {
    const summary = { version: 1, updatedAt: new Date().toISOString(),
      pr: { number: 42, url: "https://example.com/pull/42", state: "open" },
      checks: { failed: 0, running: 0, cancelled: 0, passed: 4, skipped: 0, failedNames: [] },
      reviewers: { pending: 1, approved: 0, changesRequested: 0, pendingNames: ["ana"] },
      blockers: ["review_required"], error: null };
    const getPluginMetadata = vi.fn(async ({ pluginId }: { pluginId?: string }): Promise<Record<string, typeof summary>> =>
      pluginId === "github-insight" ? { prSummary: summary } : {});
    const slot = mount([thread()], {}, {
      sidebarPullRequests: { t1: { number: 42, title: "Ship it", url: "https://example.com/pull/42", state: "open", attention: "blocked" } },
      sdk: { threads: { getPluginMetadata } },
    });
    const pr = await slot.findByRole("link", { name: "PR #42: 1 review pending" });
    expect(tip(slot, "1 review pending\nWaiting on: ana")).toBeTruthy();
    expect(tip(slot, "PR #42: Ship it\nAll checks passed")).toBeTruthy();
    expect(slot.queryByText("Blocked")).toBeNull();
    expect(getPluginMetadata).toHaveBeenCalledTimes(1);
    expect(getPluginMetadata).toHaveBeenCalledWith(expect.objectContaining({ threadId: "t1", pluginId: "github-insight" }));
  });
  it("keeps BB's word when github-insight has no summary", () => {
    const slot = mount([thread()], {}, { sidebarPullRequests: {
      t1: { number: 42, title: "Ship it", url: "https://example.com/pull/42", state: "open", attention: "blocked" } } });
    expect(slot.getByRole("link", { name: "PR #42: merge blocked" }).textContent).toContain("Blocked");
  });
  it("asks github-insight only about open PRs, and reuses a fresh answer after a remount", async () => {
    const getPluginMetadata = vi.fn(async (): Promise<Record<string, never>> => ({}));
    const merged = { number: 7, title: "Old", url: "https://example.com/pull/7", state: "merged" as const, attention: "merged" as const };
    const open = { number: 42, title: "Ship it", url: "https://example.com/pull/42", state: "open" as const, attention: "none" as const };
    const slot = mount([thread(), thread({ id: "t2", displayTitle: "Old work" })], {}, {
      sidebarPullRequests: { t1: open, t2: merged }, sdk: { threads: { getPluginMetadata } } });
    await vi.waitFor(() => expect(getPluginMetadata).toHaveBeenCalledTimes(1));
    expect(getPluginMetadata).toHaveBeenCalledWith(expect.objectContaining({ threadId: "t1" }));
    fireEvent.click(slot.getByRole("button", { name: "Collapse Sample project" }));
    fireEvent.click(slot.getByRole("button", { name: "Expand Sample project" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getPluginMetadata).toHaveBeenCalledTimes(1);
  });
  it("shows the agent's logo on every row, quiet or busy", () => {
    const slot = mount([thread(), thread({ id: "t2", displayTitle: "Busy", status: "active", runtimeStatus: "active" })]);
    expect(slot.container.querySelectorAll("[data-provider-glyph]")).toHaveLength(2);
  });
});
