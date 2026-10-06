// @vitest-environment jsdom
import { act, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TASK_STATUSES } from "../shared/contract.js";
import { DEFAULT_LIST_PREFERENCE, storeListPreference } from "../views/list/list-preference.js";
import {
  listScrollScopeKey,
  readListScroll,
  writeListScroll,
} from "../views/list/scroll-restoration.js";
import { rpcInput } from "../test-fixtures.js";
import { panel, setup, tasks, useWorkspaceTestLifecycle } from "./browse-workspace.test-support.js";

useWorkspaceTestLifecycle();
const TasksPage = panel.component;
const records = TASK_STATUSES.map((status, index) => ({
  ...tasks[0]!,
  id: `scroll-task-${index}`,
  key: `TSK-${index + 1}`,
  number: index + 1,
  status,
}));
const rpc = {
  listTasks: (raw: unknown) => ({
    tasks: rpcInput(raw).parentTaskId ? [] : records,
    nextCursor: null,
  }),
  getTaskByKey: (raw: unknown) => ({
    task: records.find((task) => task.key === rpcInput(raw).taskKey) ?? null,
  }),
};
const scopeKey = listScrollScopeKey({
  projectId: null,
  activeOnly: false,
  filters: DEFAULT_LIST_PREFERENCE.filters,
  sort: "manual",
});
const scrollContainer = (page: ReturnType<typeof setup>) =>
  page.container.querySelector<HTMLDivElement>("[data-list-scroll]")!;
let viewportHeight = 100;
beforeEach(() => {
  viewportHeight = 100;
  writeListScroll(scopeKey, 70);
  // jsdom has no layout. Simulate geometry at the browser boundary from actual
  // rendered controls/rows and the workspace's real hidden ancestor.
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (!this.hasAttribute("data-list-scroll") || this.closest("[hidden]")) return 0;
    return (
      this.querySelectorAll("[data-status-group-header]").length * 44 +
      this.querySelectorAll("[data-task-key]").length * 34
    );
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute("data-list-scroll") && !this.closest("[hidden]") ? viewportHeight : 0;
  });
});

for (const collapsed of [true, false]) {
  it(`preserves ${collapsed ? "header-only" : "row-containing"} workspace scroll after hidden recovery events and unmount, then restores visible return`, async () => {
    storeListPreference("all", {
      ...DEFAULT_LIST_PREFERENCE,
      collapsedStatuses: collapsed ? [...TASK_STATUSES] : [],
    });
    const page = setup("all", rpc, { nativeTab: false, openFixedTab: () => false });
    await waitFor(() => expect(scrollContainer(page).scrollTop).toBe(70));
    expect(page.container.querySelectorAll("[data-task-key]")).toHaveLength(collapsed ? 0 : 6);
    // Deliver an accepted selected route while BB declines the native Ticket tab.
    // This drives the real workspace recovery composition, not ListView props.
    page.lifecycle.rerender(<TasksPage subPath="all?task=TSK-2" />);
    await page.findByText(/couldn't open the Ticket pane/);
    const scroll = scrollContainer(page);
    expect(scroll.closest('[aria-label="Ticket list"]')?.hasAttribute("hidden")).toBe(true);
    expect(scroll.closest('[aria-label="Ticket list"]')?.hasAttribute("inert")).toBe(true);
    await act(async () => {
      scroll.scrollTop = 0;
      fireEvent.scroll(scroll);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    expect(readListScroll(scopeKey)).toBe(70);
    // Also unmount before a second event can reach an animation frame.
    act(() => {
      scroll.scrollTop = 0;
      fireEvent.scroll(scroll);
    });
    page.lifecycle.unmount();
    expect(readListScroll(scopeKey)).toBe(70);
    const returned = setup("all", rpc, { nativeTab: false });
    await waitFor(() => expect(scrollContainer(returned).scrollTop).toBe(70));
    expect(returned.getByRole("region", { name: "Ticket list" }).hasAttribute("hidden")).toBe(
      false,
    );
    expect(returned.container.querySelectorAll("[data-task-key]")).toHaveLength(collapsed ? 0 : 6);
  });

  it(`clamps ${collapsed ? "header-only" : "row-containing"} scroll on visible return from mounted workspace recovery`, async () => {
    storeListPreference("all", {
      ...DEFAULT_LIST_PREFERENCE,
      collapsedStatuses: collapsed ? [...TASK_STATUSES] : [],
    });
    const page = setup("all", rpc, { nativeTab: false, openFixedTab: () => false });
    await waitFor(() => expect(scrollContainer(page).scrollTop).toBe(70));
    page.lifecycle.rerender(<TasksPage subPath="all?task=TSK-2" />);
    await page.findByText(/couldn't open the Ticket pane/);
    const scroll = scrollContainer(page);
    expect(scroll.closest("[hidden]")).not.toBeNull();
    act(() => {
      scroll.scrollTop = 0;
      fireEvent.scroll(scroll);
    });
    // Six 44 px headers give 264 px. Six rows add 204 px. The resized
    // viewport leaves a literal 34 px or 38 px range for the returned layout.
    viewportHeight = collapsed ? 230 : 430;
    page.lifecycle.rerender(<TasksPage subPath="all" />);
    await waitFor(() =>
      expect(page.getByRole("region", { name: "Ticket list" }).hasAttribute("hidden")).toBe(false),
    );
    await waitFor(() => expect(scroll.scrollTop).toBe(collapsed ? 34 : 38));
    expect(page.container.querySelectorAll("[data-task-key]")).toHaveLength(collapsed ? 0 : 6);
    expect(page.queryByText(/couldn't open the Ticket pane/)).toBeNull();
  });
}
