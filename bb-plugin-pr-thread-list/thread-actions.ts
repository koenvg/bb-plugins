import type {
  PluginBrowserBbSdk,
  PluginSidebarSection,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import type { ThreadListActions } from "./sidebar-actions";
import type { MenuItem } from "./action-menu";
import type { ListItem } from "./list-model";
import { snoozePresets, type SnoozeControls } from "./snooze-model";
import { cancelPrPanelRequest } from "../bb-plugin-github-insight/pr-panel-navigation";
import type { NameRequest } from "./name-dialog";

export function threadMenuItems(
  thread: PluginSidebarThread,
  actions: ThreadListActions,
  sdk: PluginBrowserBbSdk,
  sections: readonly PluginSidebarSection[],
  pinned: readonly PluginSidebarThread[],
  splitAvailable: boolean,
  onNavigate: () => void,
  requestName: (request: NameRequest) => void,
): MenuItem[] {
  const id = thread.id;
  const index = pinned.findIndex((row) => row.id === id);
  const items: MenuItem[] = [
    {
      label: thread.isPinned ? "Unpin" : "Pin",
      run: () => actions.togglePinned(),
    },
    {
      label: thread.isUnread ? "Mark read" : "Mark unread",
      run: () => actions.toggleRead(),
    },
    {
      label: "Rename",
      run: () =>
        requestName({
          title: "Rename thread",
          initialName: thread.displayTitle,
          action: "Rename",
          save: actions.rename,
          failure: "Could not rename.",
        }),
    },
  ];
  if (splitAvailable)
    items.push({
      label: "Open in split",
      run: () => {
        cancelPrPanelRequest();
        actions.open(id, { split: true });
        onNavigate();
      },
    });
  const before = pinned[index - 1];
  if (index > 0 && before)
    items.push({
      label: "Move up",
      run: () =>
        sdk.threads.reorderPinned({
          threadId: id,
          previousThreadId: pinned[index - 2]?.id ?? null,
          nextThreadId: before.id,
        }),
    });
  const after = pinned[index + 1];
  if (index >= 0 && after)
    items.push({
      label: "Move down",
      run: () =>
        sdk.threads.reorderPinned({
          threadId: id,
          previousThreadId: after.id,
          nextThreadId: pinned[index + 2]?.id ?? null,
        }),
    });
  if (thread.sectionId !== null)
    items.push({
      label: "Move to Threads",
      run: () => sdk.threads.update({ threadId: id, sectionId: null }),
    });
  for (const section of sections)
    if (section.id !== thread.sectionId) {
      items.push({
        label: `Move to ${section.name}`,
        run: () => sdk.threads.update({ threadId: id, sectionId: section.id }),
      });
    }
  const environmentId = thread.environment?.id;
  if (environmentId)
    items.push({
      label: "New thread in environment",
      run: () =>
        actions.openNewThread({
          projectId: thread.projectId,
          environmentId,
        }),
    });
  items.push(
    thread.isArchived
      ? { label: "Unarchive", run: () => sdk.threads.unarchive({ threadId: id }) }
      : { label: "Archive", run: () => actions.archive() },
  );
  items.push({ label: "Delete…", run: () => actions.requestDelete() });
  return items;
}

export function snoozeMenuItems(
  thread: PluginSidebarThread,
  wakeAt: number | undefined,
  { snooze, wake, canSnooze }: Pick<SnoozeControls, "snooze" | "wake" | "canSnooze">,
): MenuItem[] {
  const section = "Snooze";
  if (wakeAt !== undefined)
    return [
      {
        section,
        label: "Wake now",
        failure: "Could not wake the thread.",
        run: () => wake(thread.id),
      },
    ];
  if (!canSnooze(thread.id)) return [];
  // Recomputed at click time: a menu rendered yesterday must not snooze into the past.
  return snoozePresets(new Date()).map(({ label, wakeAt: shown }) => ({
    section,
    label,
    failure: "Could not snooze the thread.",
    run: () =>
      snooze(
        thread.id,
        snoozePresets(new Date()).find((preset) => preset.label === label)?.wakeAt ?? shown,
      ),
  }));
}

export function newThreadScope({
  scope,
}: Extract<ListItem, { kind: "group" }>): { projectId?: string; sectionId?: string } | null {
  if (scope.kind === "project") return { projectId: scope.projectId };
  if (scope.kind === "section") return { sectionId: scope.sectionId };
  return null;
}

export function groupMenuItems(
  group: Extract<ListItem, { kind: "group" }>,
  sdk: PluginBrowserBbSdk,
  requestName: (request: NameRequest) => void,
): MenuItem[] {
  const { scope } = group;
  if (scope.kind !== "section") return [];
  return [
    {
      label: "Rename section",
      run: () =>
        requestName({
          title: "Rename section",
          initialName: group.label,
          action: "Rename",
          save: (name) => sdk.threadSections.update({ id: scope.sectionId, name }),
          failure: "Could not rename section.",
        }),
    },
  ];
}
