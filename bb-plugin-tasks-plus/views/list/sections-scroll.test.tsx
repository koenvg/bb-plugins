// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { ComponentProps } from "react";
import { ListView, type VisibleTaskOrder } from "./index.js";
import { DEFAULT_LIST_PREFERENCE, storeListPreference } from "./list-preference.js";
import { listScrollScopeKey, readListScroll, writeListScroll } from "./scroll-restoration.js";
import { TASK_STATUSES } from "../../shared/contract.js";
import { makeTask } from "../../test-fixtures.js";
import { TasksRefreshProvider } from "../../shell/refresh.js";

function List(props: ComponentProps<typeof ListView>) {
  return (
    <div hidden={props.visible === false}>
      <TasksRefreshProvider>
        <ListView {...props} />
      </TasksRefreshProvider>
    </div>
  );
}
const records = TASK_STATUSES.map((status, index) =>
  makeTask({ id: `status-${index}`, key: `TSK-${index + 1}`, status }),
);
const rpc = {
  listProjects: () => ({ projects: [] }),
  listLabels: () => ({ labels: [] }),
  listTaskThreads: () => ({ taskThreads: [] }),
  listTasks: () => ({ tasks: records, nextCursor: null }),
};
const scopes = [
  { name: "all" as const, projectId: null, activeOnly: false },
  { name: "active" as const, projectId: null, activeOnly: true },
  { name: "project:project-a" as const, projectId: "project-a", activeOnly: false },
  { name: "project:project-b" as const, projectId: "project-b", activeOnly: false },
];
const scrollKey = (scope: (typeof scopes)[number]) =>
  listScrollScopeKey({
    projectId: scope.projectId,
    activeOnly: scope.activeOnly,
    filters: DEFAULT_LIST_PREFERENCE.filters,
    sort: "manual",
  });
const scrollContainer = (slot: ReturnType<typeof renderSlot>) =>
  slot.container.querySelector<HTMLDivElement>("[data-list-scroll]")!;
let viewportHeight = 100;

beforeEach(() => {
  window.sessionStorage.clear();
  viewportHeight = 100;
  for (const scope of scopes)
    storeListPreference(scope.name, {
      ...DEFAULT_LIST_PREFERENCE,
      collapsedStatuses: [...TASK_STATUSES],
    });
  // jsdom has no layout. Model the browser geometry from the public rendered rows
  // and controls: each header occupies 44 px, each task row occupies 34 px.
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

for (const scope of scopes) {
  const scopeKey = scrollKey(scope);
  it(`restores and clamps ${scope.name} scroll with only collapsed headers after navigation return`, async () => {
    writeListScroll(scopeKey, 500);
    const report = vi.fn<(order: VisibleTaskOrder) => void>();
    const props = {
      projectId: scope.projectId,
      activeOnly: scope.activeOnly,
      onVisibleOrderChange: report,
    };
    const slot = renderSlot({ component: List }, props, { rpc });
    await slot.findByRole("button", { name: "Backlog" });
    const scroll = scrollContainer(slot);
    // Six 44 px headers and a 100 px viewport leave a 164 px scroll range.
    await waitFor(() => expect(scroll.scrollTop).toBe(164));
    expect(slot.container.querySelectorAll("[data-task-key]")).toHaveLength(0);
    expect(slot.container.querySelectorAll("[data-status-group-header]")).toHaveLength(6);
    expect(report.mock.calls.at(-1)?.[0]).toEqual({ keys: [], settled: true });
    expect(slot.queryByText("No tasks yet")).toBeNull();
    act(() => {
      scroll.scrollTop = 70;
      fireEvent.scroll(scroll);
    });
    slot.lifecycle.unmount();
    expect(readListScroll(scopeKey)).toBe(70);
    const returned = renderSlot({ component: List }, props, { rpc });
    await returned.findByRole("button", { name: "Backlog" });
    await waitFor(() => expect(scrollContainer(returned).scrollTop).toBe(70));
    expect(returned.container.querySelectorAll("[data-task-key]")).toHaveLength(0);
  });

  it(`waits for loaded ${scope.name} before restoring header-only scroll`, async () => {
    writeListScroll(scopeKey, 70);
    let resolve!: (value: unknown) => void;
    const response = new Promise((done) => {
      resolve = done;
    });
    const report = vi.fn<(order: VisibleTaskOrder) => void>();
    const slot = renderSlot(
      { component: List },
      { projectId: scope.projectId, activeOnly: scope.activeOnly, onVisibleOrderChange: report },
      {
        rpc: { ...rpc, listTasks: () => response },
      },
    );
    const scroll = scrollContainer(slot);
    expect(scroll.scrollTop).toBe(0);
    expect(report.mock.calls.at(-1)?.[0]).toEqual({ keys: [], settled: false });
    act(() => {
      scroll.scrollTop = 40;
      fireEvent.scroll(scroll);
    });
    expect(readListScroll(scopeKey)).toBe(70);
    await act(async () => resolve({ tasks: records, nextCursor: null }));
    await slot.findByRole("button", { name: "Backlog" });
    await waitFor(() => expect(scroll.scrollTop).toBe(70));
    expect(report.mock.calls.at(-1)?.[0]).toEqual({ keys: [], settled: true });
    expect(slot.container.querySelectorAll("[data-task-key]")).toHaveLength(0);
  });

  it(`does not restore or save hidden ${scope.name} scroll until the header-only pane is visible`, async () => {
    writeListScroll(scopeKey, 70);
    const props = { projectId: scope.projectId, activeOnly: scope.activeOnly, visible: false };
    const slot = renderSlot({ component: List }, props, { rpc });
    await waitFor(() =>
      expect(slot.container.querySelectorAll("[data-status-group-header]")).toHaveLength(6),
    );
    const scroll = scrollContainer(slot);
    expect(scroll.scrollTop).toBe(0);
    act(() => {
      scroll.scrollTop = 40;
      fireEvent.scroll(scroll);
    });
    expect(readListScroll(scopeKey)).toBe(70);
    slot.lifecycle.rerender(<List {...props} visible />);
    await slot.findByRole("button", { name: "Backlog" });
    await waitFor(() => expect(scroll.scrollTop).toBe(70));
    expect(slot.container.querySelectorAll("[data-task-key]")).toHaveLength(0);
  });

  it(`clamps ${scope.name} saved row offset to zero for a settled header-only list with no scroll range`, async () => {
    viewportHeight = 500;
    writeListScroll(scopeKey, 500);
    const slot = renderSlot(
      { component: List },
      { projectId: scope.projectId, activeOnly: scope.activeOnly },
      { rpc },
    );
    await slot.findByRole("button", { name: "Backlog" });
    const scroll = scrollContainer(slot);
    expect(scroll.scrollTop).toBe(0);
    // A settled header-only view accepts scroll observations, unlike loading content.
    act(() => fireEvent.scroll(scroll));
    slot.lifecycle.unmount();
    expect(readListScroll(scopeKey)).toBe(0);
    viewportHeight = 100;
    const returned = renderSlot(
      { component: List },
      { projectId: scope.projectId, activeOnly: scope.activeOnly },
      { rpc },
    );
    await returned.findByRole("button", { name: "Backlog" });
    expect(scrollContainer(returned).scrollTop).toBe(0);
    expect(returned.container.querySelectorAll("[data-task-key]")).toHaveLength(0);
  });
}

it("restores each scope against its own saved layout during mounted transitions without overwriting hidden offsets", async () => {
  storeListPreference("active", { ...DEFAULT_LIST_PREFERENCE, collapsedStatuses: ["todo"] });
  storeListPreference("project:project-a", { ...DEFAULT_LIST_PREFERENCE, collapsedStatuses: [] });
  const offsets = [150, 300, 250, 500];
  for (const [index, scope] of scopes.entries()) writeListScroll(scrollKey(scope), offsets[index]!);
  const report = vi.fn<(order: VisibleTaskOrder) => void>();
  const slot = renderSlot(
    { component: List },
    { ...scopes[0]!, onVisibleOrderChange: report },
    { rpc },
  );
  await waitFor(() => expect(scrollContainer(slot).scrollTop).toBe(150));
  act(() => fireEvent.scroll(scrollContainer(slot)));
  for (const [index, scope] of scopes.entries()) {
    slot.lifecycle.rerender(
      <List
        projectId={scope.projectId}
        activeOnly={scope.activeOnly}
        visible={false}
        onVisibleOrderChange={report}
      />,
    );
    act(() => {
      scrollContainer(slot).scrollTop = 0;
      fireEvent.scroll(scrollContainer(slot));
    });
    expect(readListScroll(scrollKey(scope))).toBe(offsets[index]);
    slot.lifecycle.rerender(
      <List
        projectId={scope.projectId}
        activeOnly={scope.activeOnly}
        onVisibleOrderChange={report}
      />,
    );
    await waitFor(() => expect(report.mock.calls.at(-1)?.[0].settled).toBe(true));
    // All/B have six headers only. Active has five rows; A has six rows.
    await waitFor(() => expect(scrollContainer(slot).scrollTop).toBe([150, 300, 250, 164][index]));
    expect(slot.container.querySelectorAll("[data-task-key]")).toHaveLength([0, 5, 6, 0][index]!);
  }
  slot.lifecycle.rerender(<List projectId={null} onVisibleOrderChange={report} />);
  await waitFor(() => expect(scrollContainer(slot).scrollTop).toBe(150));
  expect(readListScroll(scrollKey(scopes[1]!))).toBe(300);
  expect(readListScroll(scrollKey(scopes[2]!))).toBe(250);
});
