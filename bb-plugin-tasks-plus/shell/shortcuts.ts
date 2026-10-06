export type ShortcutScope = "panel" | "list" | "board" | "detail";

interface ShortcutDefinition {
  id: string;
  scope: ShortcutScope;
  keys: readonly string[];
  label: string;
  repeatable?: boolean;
}

export const SHORTCUTS = [
  { id: "panel.newTask", scope: "panel", keys: ["c"], label: "New task" },
  {
    id: "panel.help",
    scope: "panel",
    keys: ["?"],
    label: "Show keyboard shortcuts",
  },
  {
    id: "panel.toggleView",
    scope: "panel",
    keys: ["v"],
    label: "Switch between list and board",
  },
  {
    id: "list.next",
    scope: "list",
    keys: ["j", "ArrowDown"],
    label: "Select next preview",
    repeatable: true,
  },
  {
    id: "list.previous",
    scope: "list",
    keys: ["k", "ArrowUp"],
    label: "Select previous preview",
    repeatable: true,
  },
  {
    id: "list.open",
    scope: "list",
    keys: ["Enter", "o"],
    label: "Focus ticket preview",
  },
  { id: "list.status", scope: "list", keys: ["s"], label: "Change status" },
  { id: "list.priority", scope: "list", keys: ["p"], label: "Set priority" },
  { id: "list.labels", scope: "list", keys: ["l"], label: "Edit labels" },
  {
    id: "board.down",
    scope: "board",
    keys: ["j", "ArrowDown"],
    label: "Next card in column",
    repeatable: true,
  },
  {
    id: "board.up",
    scope: "board",
    keys: ["k", "ArrowUp"],
    label: "Previous card in column",
    repeatable: true,
  },
  {
    id: "board.right",
    scope: "board",
    keys: ["l", "ArrowRight"],
    label: "Next column",
    repeatable: true,
  },
  {
    id: "board.left",
    scope: "board",
    keys: ["h", "ArrowLeft"],
    label: "Previous column",
    repeatable: true,
  },
  {
    id: "board.open",
    scope: "board",
    keys: ["Enter", "o"],
    label: "Open task",
  },
  { id: "board.status", scope: "board", keys: ["s"], label: "Change status" },
  { id: "board.priority", scope: "board", keys: ["p"], label: "Set priority" },
  {
    id: "detail.back",
    scope: "detail",
    keys: ["Escape"],
    label: "Return to row / back from standalone task",
  },
  {
    id: "detail.previous",
    scope: "detail",
    keys: ["["],
    label: "Previous visible ticket / standalone task",
    repeatable: true,
  },
  {
    id: "detail.next",
    scope: "detail",
    keys: ["]"],
    label: "Next visible ticket / standalone task",
    repeatable: true,
  },
  { id: "detail.status", scope: "detail", keys: ["s"], label: "Change status" },
  {
    id: "detail.priority",
    scope: "detail",
    keys: ["p"],
    label: "Set priority",
  },
  { id: "detail.labels", scope: "detail", keys: ["l"], label: "Edit labels" },
  {
    id: "detail.dispatch",
    scope: "detail",
    keys: ["d"],
    label: "Choose dispatch preset",
  },
  {
    id: "detail.comment",
    scope: "detail",
    keys: ["m"],
    label: "Write a comment",
  },
] as const satisfies readonly ShortcutDefinition[];

export type Shortcut = (typeof SHORTCUTS)[number];
export type ShortcutId = Shortcut["id"];

export const SHORTCUT_SCOPE_LABELS: Record<ShortcutScope, string> = {
  panel: "Anywhere",
  list: "List",
  board: "Board",
  detail: "Task",
};

const KEY_LABELS: Record<string, string> = {
  ArrowDown: "↓",
  ArrowUp: "↑",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
  Enter: "Enter",
};

export function keyLabel(key: string): string {
  return KEY_LABELS[key] ?? key;
}

function normalizedKey(event: Pick<KeyboardEvent, "key" | "shiftKey">) {
  return event.key.length === 1 && !event.shiftKey ? event.key.toLowerCase() : event.key;
}

export function shortcutMatches(
  shortcut: Shortcut,
  event: Pick<KeyboardEvent, "key" | "shiftKey" | "repeat">,
): boolean {
  const keys: readonly string[] = shortcut.keys;
  if (!keys.includes(normalizedKey(event))) return false;
  return !event.repeat || "repeatable" in shortcut;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

export function hasOpenOverlay(): boolean {
  return (
    document.querySelector(
      '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
    ) !== null
  );
}

/** Recheck ownership when asynchronous work finishes, not only on keydown.
 * Mandatory focus transfer out of a hidden pane is handled separately. */
export function canRestoreBrowseFocus(list: HTMLElement, detail?: HTMLElement): boolean {
  const active = document.activeElement;
  return (
    !hasOpenOverlay() &&
    !isEditableTarget(active) &&
    (active === document.body || list.contains(active) || detail?.contains(active) === true)
  );
}

function isOutside(target: EventTarget | null, root: HTMLElement): boolean {
  if (!(target instanceof Node)) return false;
  if (target === document.body || target === document.documentElement) return false;
  return !root.contains(target);
}

export function shouldIgnoreKey(event: KeyboardEvent, root: HTMLElement | null): boolean {
  if (event.defaultPrevented) return true;
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  if (event.isComposing) return true;
  const active = document.activeElement;
  if (isEditableTarget(event.target) || isEditableTarget(active)) return true;
  if (active instanceof HTMLElement && active.closest("[hidden], [inert]")) return true;
  if (hasOpenOverlay()) return true;
  return root !== null && (isOutside(event.target, root) || isOutside(active, root));
}
