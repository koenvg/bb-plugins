import { describe, expect, it } from "vitest";
import { project, thread } from "./fixtures";
import { visibleItems, type ListOptions } from "./list-model";
import type { PrSummary } from "./pr-insight";

const defaults: ListOptions = {
  tab: "all", mode: "project", lifecycles: ["active"], sort: "updated",
  direction: "desc", collapsedGroups: [], collapsedThreads: [],
};
const titles = (items: ReturnType<typeof visibleItems>) =>
  items.filter((item) => item.kind === "thread").map((item) => item.thread.displayTitle);

const rows = [
  thread({ id: "parent", displayTitle: "Parent", updatedAt: 300 }),
  thread({ id: "child", displayTitle: "Child", parentThreadId: "parent", updatedAt: 400 }),
  thread({ id: "pin", displayTitle: "Pin", isPinned: true, pinnedAt: 10, pinSortKey: "a" }),
  thread({ id: "hidden", displayTitle: "Hidden", isHidden: true }),
  thread({ id: "arch", displayTitle: "Archived", isArchived: true, archivedAt: 400 }),
];

describe("visibleItems", () => {
  it("places pinned rows once and nests children beneath the parent", () => {
    const items = visibleItems(rows, [project], [], defaults);
    expect(titles(items)).toEqual(["Pin", "Parent", "Child"]);
    expect(items.find((item) => item.kind === "thread" && item.thread.id === "child"))
      .toMatchObject({ depth: 1 });
    expect(items.filter((item) => item.kind === "thread" && item.thread.id === "pin")).toHaveLength(1);
  });

  it("hides descendants or groups when collapsed, and keeps hidden threads out", () => {
    expect(titles(visibleItems(rows, [project], [], { ...defaults, collapsedThreads: ["parent"] })))
      .toEqual(["Pin", "Parent"]);
    expect(titles(visibleItems(rows, [project], [], { ...defaults, collapsedGroups: ["project:p1"] })))
      .toEqual(["Pin"]);
  });

  it("groups by machine, projects, and custom sections with stable fallback", () => {
    const scoped = [thread({ id: "machine", host: { id: "m1", name: "Mac" }, sectionId: "s1" }),
      thread({ id: "loose", displayTitle: "Loose", projectId: "missing", updatedAt: 1 })];
    expect(visibleItems(scoped, [project], [], defaults).map((x) => x.kind === "group" ? x.label : x.thread.id))
      .toEqual(["Sample project", "machine", "Threads", "loose"]);
    expect(visibleItems(scoped, [project], [], { ...defaults, mode: "machine" })
      .some((x) => x.kind === "group" && x.label === "Mac")).toBe(true);
    expect(visibleItems(scoped, [project], [{ id: "s1", name: "Later", createdAt: 1, updatedAt: 1 }],
      { ...defaults, mode: "section" }).map((x) => x.kind === "group" ? x.label : x.thread.id))
      .toEqual(["Later", "machine", "Threads", "loose"]);
  });

  it("supports sorting and archive lifecycle without duplicating pinned children", () => {
    const items = visibleItems(rows, [project], [], { ...defaults, sort: "title", direction: "asc", lifecycles: ["active", "archived"] });
    expect(titles(items)).toContain("Archived");
    expect(titles(items)).not.toContain("Hidden");
    const pinnedChild = thread({ id: "pinnedChild", displayTitle: "Pinned child", parentThreadId: "parent", isPinned: true, pinnedAt: 11 });
    expect(titles(visibleItems([...rows, pinnedChild], [project], [], defaults)).filter((t) => t === "Pinned child")).toHaveLength(1);
  });
  it("retains empty sections for scoped creation and collapse", () => {
    const sections = [{ id: "s1", name: "Empty", createdAt: 1, updatedAt: 1 },
      { id: "s2", name: "Populated", createdAt: 2, updatedAt: 2 }];
    const items = visibleItems([thread({ sectionId: "s2" })], [project], sections, { ...defaults, mode: "section" });
    expect(items.filter((item) => item.kind === "group")).toMatchObject([
      { id: "section:s1", label: "Empty", count: 0 },
      { id: "section:s2", label: "Populated", count: 1 },
    ]);
    expect(visibleItems([], [project], sections, { ...defaults, mode: "section", collapsedGroups: ["section:s1"] }))
      .toMatchObject([{ kind: "group", id: "section:s1", count: 0, collapsed: true },
        { kind: "group", id: "section:s2", count: 0, collapsed: false }]);
  });
  it("derives thousands of rows without losing entries or mutating host arrays", () => {
    const many = Array.from({ length: 3000 }, (_, index) => thread({ id: `t${index}`,
      displayTitle: `Thread ${index}`, updatedAt: index }));
    const items = visibleItems(many, [project], [], defaults);
    expect(items[0]).toMatchObject({ kind: "group", count: 3000 });
    expect(items).toHaveLength(3001);
    expect(items[1]).toMatchObject({ kind: "thread", id: "t2999" });
    expect(many[0]?.id).toBe("t0");
  });
  it("lifts threads that need the user into a first Needs you group, flattened out of their parents", () => {
    const other = { ...project, id: "p2", name: "Other project" };
    const items = visibleItems([
      thread({ id: "parent", displayTitle: "Parent", isUnread: true }),
      thread({ id: "asks", displayTitle: "Asks", parentThreadId: "parent", indicator: "waiting-for-input" }),
      thread({ id: "failed", displayTitle: "Failed", projectId: "p2", queuedWork: "failed" }),
      thread({ id: "approval", displayTitle: "Approval", isPinned: true, pinnedAt: 1, hasPendingInteraction: true }),
    ], [project, other], [], defaults);
    expect(items[0]).toMatchObject({ kind: "group", id: "attention", label: "Needs you", count: 3 });
    expect(items.slice(1, 4).map((item) => item.kind === "thread" ? [item.thread.id, item.depth] : null))
      .toEqual([["approval", 0], ["asks", 0], ["failed", 0]]);
    expect(items.filter((item) => item.kind === "group").map((item) => item.id))
      .toEqual(["attention", "project:p1"]);
  });

  describe("attention tabs", () => {
    const running: PrSummary = { number: 1, url: "https://example.com/pull/1", state: "open", failedChecks: 0, passedChecks: 0,
      runningChecks: 1, pendingReviews: 0, blockers: ["checks_running"], failedNames: [], pendingNames: [], mergeQueue: null };
    const other = { ...project, id: "p2", name: "Other project" };
    const tabRows = [
      thread({ id: "idle", displayTitle: "Idle" }),
      thread({ id: "busy", displayTitle: "Busy", status: "active" }),
      thread({ id: "waits", displayTitle: "Waits on CI", projectId: "p2" }),
      thread({ id: "child", displayTitle: "Child asks", parentThreadId: "busy", indicator: "waiting-for-input" }),
      thread({ id: "pin", displayTitle: "Pin", isPinned: true, pinnedAt: 1, isUnread: true }),
      thread({ id: "arch", displayTitle: "Archived", isArchived: true, archivedAt: 1 }),
      thread({ id: "hidden", displayTitle: "Hidden", isHidden: true }),
    ];
    const prs = new Map([["waits", running]]);
    const tab = (name: "attention" | "inflight", extra: Partial<ListOptions> = {}) =>
      visibleItems(tabRows, [project, other], [], { ...defaults, tab: name, ...extra }, prs);

    it("puts each active thread in one tab and keeps archived and hidden threads out", () => {
      expect(titles(tab("attention"))).toEqual(["Pin", "Child asks", "Idle"]);
      expect(titles(tab("inflight"))).toEqual(["Waits on CI", "Busy"]);
      expect(titles(tab("attention", { lifecycles: ["archived"] }))).not.toContain("Archived");
    });
    it("keeps pinned first, flattens a child whose parent is in the other tab, and shows no Needs you group", () => {
      const items = tab("attention");
      expect(items.filter((item) => item.kind === "group").map((item) => item.id)).toEqual(["pinned", "project:p1"]);
      expect(items.find((item) => item.kind === "thread" && item.id === "child")).toMatchObject({ depth: 0 });
    });
    it("groups the threads of a tab by project", () => {
      expect(tab("inflight").map((item) => item.kind === "group" ? item.label : item.id))
        .toEqual(["Other project", "waits", "Sample project", "busy"]);
    });
  });
});
