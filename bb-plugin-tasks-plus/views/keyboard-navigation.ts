const NAV_ITEM = "[data-nav-item]";
const COLUMN = "[data-board-column]";

function navItems(scope: ParentNode): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(NAV_ITEM)];
}

function focusItem(item: HTMLElement | undefined): boolean {
  if (item === undefined) return false;
  item.focus();
  item.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

function clamp(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length - 1);
}

export function focusedNavItem(container: HTMLElement | null): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.matches(NAV_ITEM)) return null;
  return container?.contains(active) ? active : null;
}

export function focusedTaskKey(container: HTMLElement | null): string | null {
  return (
    focusedNavItem(container)?.closest<HTMLElement>("[data-task-key]")?.dataset.taskKey ?? null
  );
}

export function forFocusedTask(
  container: () => HTMLElement | null,
  act: (taskKey: string) => void,
): () => boolean | void {
  return () => {
    const taskKey = focusedTaskKey(container());
    if (taskKey === null) return false;
    act(taskKey);
  };
}

function currentItem(
  container: HTMLElement,
  items: readonly HTMLElement[],
): HTMLElement | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !container.contains(active)) {
    return undefined;
  }
  const task = active.closest("[data-task-key]");
  return items.find((item) => item === active || item.closest("[data-task-key]") === task);
}

export function moveFocusInList(container: HTMLElement | null, delta: 1 | -1): boolean {
  if (container === null) return false;
  const items = navItems(container);
  if (items.length === 0) return false;
  const current = currentItem(container, items);
  return focusItem(
    current === undefined ? items[0] : items[clamp(items.indexOf(current) + delta, items.length)],
  );
}

export function moveFocusAcrossColumns(container: HTMLElement | null, delta: 1 | -1): boolean {
  if (container === null) return false;
  const columns = [...container.querySelectorAll<HTMLElement>(COLUMN)].filter(
    (column) => navItems(column).length > 0,
  );
  const current = focusedNavItem(container);
  const columnIndex = columns.findIndex((column) => current !== null && column.contains(current));
  if (columnIndex === -1) return focusItem(navItems(container)[0]);
  const target = columns[columnIndex + delta];
  if (target === undefined) return true;
  const row = navItems(columns[columnIndex]!).indexOf(current!);
  const targetItems = navItems(target);
  return focusItem(targetItems[clamp(row, targetItems.length)]);
}

export function moveFocusInColumn(container: HTMLElement | null, delta: 1 | -1): boolean {
  if (container === null) return false;
  const current = focusedNavItem(container);
  const column = current?.closest<HTMLElement>(COLUMN);
  if (!current || !column) return focusItem(navItems(container)[0]);
  const items = navItems(column);
  return focusItem(items[clamp(items.indexOf(current) + delta, items.length)]);
}
