import type { PluginSidebarProject, PluginSidebarSection, PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { isBusy, needsAttention } from "./row-cues";
import { tabFor, threadsWithActiveDescendant, type Tab } from "./tabs";
import type { PrSummary } from "./pr-insight";

export type Organization = "project" | "machine" | "section";
export type Lifecycle = "active" | "archived";
export type SortField = "updated" | "created" | "title";
export interface ListOptions {
  tab: Tab;
  mode: Organization;
  lifecycles: readonly Lifecycle[];
  sort: SortField;
  direction: "asc" | "desc";
  collapsedGroups: readonly string[];
  collapsedThreads: readonly string[];
}
export type GroupScope =
  | { kind: "attention" } | { kind: "pinned" } | { kind: "threads" }
  | { kind: "project"; projectId: string }
  | { kind: "section"; sectionId: string }
  | { kind: "machine"; hostId: string; name: string };

const groupKey = (scope: GroupScope): string => {
  switch (scope.kind) {
    case "project": return `project:${scope.projectId}`;
    case "section": return `section:${scope.sectionId}`;
    case "machine": return `machine:${scope.hostId}`;
    default: return scope.kind;
  }
};

export type ListItem =
  | { kind: "group"; id: string; scope: GroupScope; label: string; count: number; collapsed: boolean }
  | { kind: "thread"; id: string; thread: PluginSidebarThread; depth: number; hasChildren: boolean; collapsed: boolean };

function compare(a: PluginSidebarThread, b: PluginSidebarThread, options: ListOptions): number {
  if (a.isPinned && b.isPinned) {
    if (a.pinSortKey !== null || b.pinSortKey !== null) {
      if (a.pinSortKey === null) return 1;
      if (b.pinSortKey === null) return -1;
      if (a.pinSortKey !== b.pinSortKey) return a.pinSortKey.localeCompare(b.pinSortKey);
    }
    if (a.pinnedAt !== b.pinnedAt) return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
  }
  if (options.sort === "updated" && isBusy(a) !== isBusy(b)) return isBusy(a) ? -1 : 1;
  const value = options.sort === "title"
    ? a.displayTitle.localeCompare(b.displayTitle)
    : a[options.sort === "created" ? "createdAt" : "updatedAt"] -
      b[options.sort === "created" ? "createdAt" : "updatedAt"];
  return (options.direction === "asc" ? value : -value) || a.id.localeCompare(b.id);
}

/** One stable, flattened tree for rendering and windowing. Never mutates host rows. */
export function visibleItems(
  threads: readonly PluginSidebarThread[],
  projects: readonly PluginSidebarProject[],
  sections: readonly PluginSidebarSection[],
  options: ListOptions,
  pullRequests: ReadonlyMap<string, PrSummary | null> = new Map(),
): ListItem[] {
  const { tab } = options;
  const withActiveDescendant = tab === "all" ? new Set<string>() : threadsWithActiveDescendant(threads);
  const filtered = threads.filter((t) => !t.isHidden && (tab === "all"
    ? options.lifecycles.includes(t.isArchived ? "archived" : "active")
    : !t.isArchived && tabFor(t, pullRequests.get(t.id) ?? null, withActiveDescendant.has(t.id)) === tab));
  const byId = new Map(filtered.map((t) => [t.id, t]));
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const sectionNames = new Map(sections.map((s) => [s.id, s.name]));
  const pinnedCache = new Map<string, boolean>();
  const belongsToPinned = (thread: PluginSidebarThread): boolean => {
    const seen = new Set<string>();
    const path: string[] = [];
    let cursor: PluginSidebarThread | undefined = thread;
    let pinned = false;
    while (cursor && !seen.has(cursor.id)) {
      const cached = pinnedCache.get(cursor.id);
      if (cached !== undefined) { pinned = cached; break; }
      path.push(cursor.id);
      if (cursor.isPinned) { pinned = true; break; }
      seen.add(cursor.id);
      cursor = cursor.parentThreadId ? byId.get(cursor.parentThreadId) : undefined;
    }
    for (const id of path) pinnedCache.set(id, pinned);
    return pinned;
  };
  const scopeOf = (thread: PluginSidebarThread): GroupScope => {
    if (tab === "all" && needsAttention(thread)) return { kind: "attention" };
    if (belongsToPinned(thread)) return { kind: "pinned" };
    if (options.mode === "section") return thread.sectionId && sectionNames.has(thread.sectionId)
      ? { kind: "section", sectionId: thread.sectionId } : { kind: "threads" };
    if (options.mode === "machine") return thread.host ? { kind: "machine", hostId: thread.host.id, name: thread.host.name } : { kind: "threads" };
    return projectNames.has(thread.projectId) ? { kind: "project", projectId: thread.projectId } : { kind: "threads" };
  };
  const labelOf = (scope: GroupScope): string => {
    switch (scope.kind) {
      case "attention": return "Needs you";
      case "pinned": return "Pinned";
      case "threads": return "Threads";
      case "project": return projectNames.get(scope.projectId) ?? "Threads";
      case "section": return sectionNames.get(scope.sectionId) ?? "Threads";
      case "machine": return scope.name;
    }
  };
  const groups = new Map<string, { scope: GroupScope; bucket: PluginSidebarThread[] }>();
  const sectionOrder = new Map(sections.map((section, index) => [section.id, index]));
  if (options.mode === "section") for (const section of sections) {
    const scope: GroupScope = { kind: "section", sectionId: section.id };
    groups.set(groupKey(scope), { scope, bucket: [] });
  }
  for (const thread of filtered) {
    const scope = scopeOf(thread);
    const key = groupKey(scope);
    let group = groups.get(key);
    if (!group) { group = { scope, bucket: [] }; groups.set(key, group); }
    group.bucket.push(thread);
  }
  const rank = (scope: GroupScope) => scope.kind === "attention" ? 0 : scope.kind === "pinned" ? 1 : scope.kind === "threads" ? 3 : 2;
  const groupOrder = [...groups.values()].sort(({ scope: a }, { scope: b }) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.kind === "section" && b.kind === "section") return (sectionOrder.get(a.sectionId) ?? 0) - (sectionOrder.get(b.sectionId) ?? 0);
    return labelOf(a).localeCompare(labelOf(b));
  });
  const result: ListItem[] = [];
  for (const { scope, bucket } of groupOrder) {
    const key = groupKey(scope);
    const label = labelOf(scope);
    const collapsed = options.collapsedGroups.includes(key);
    result.push({ kind: "group", id: key, scope, label, count: bucket.length, collapsed });
    if (collapsed) continue;
    const members = new Map(bucket.map((t) => [t.id, t]));
    const children = new Map<string, PluginSidebarThread[]>();
    const roots: PluginSidebarThread[] = [];
    for (const thread of bucket) {
      const parent = thread.parentThreadId && members.get(thread.parentThreadId);
      if (parent && parent.id !== thread.id && scope.kind !== "attention" && !(thread.isPinned && scope.kind === "pinned")) {
        let siblings = children.get(parent.id);
        if (!siblings) { siblings = []; children.set(parent.id, siblings); }
        siblings.push(thread);
      } else roots.push(thread);
    }
    const visited = new Set<string>();
    const append = (thread: PluginSidebarThread, depth: number): void => {
      if (visited.has(thread.id)) return;
      visited.add(thread.id);
      const descendants = children.get(thread.id) ?? [];
      const folded = options.collapsedThreads.includes(thread.id);
      result.push({ kind: "thread", id: thread.id, thread, depth, hasChildren: descendants.length > 0, collapsed: folded });
      if (folded) {
        const stack = [...descendants];
        while (stack.length > 0) {
          const child = stack.pop()!;
          if (visited.has(child.id)) continue;
          visited.add(child.id);
          stack.push(...(children.get(child.id) ?? []));
        }
      } else {
        for (const child of descendants.sort((a, b) => compare(a, b, options))) append(child, depth + 1);
      }
    };
    for (const root of roots.sort((a, b) => compare(a, b, options))) append(root, 0);
    // Malformed/cyclic parent references should not make a navigable thread disappear.
    for (const thread of bucket) if (!visited.has(thread.id)) append(thread, 0);
  }
  return result;
}

