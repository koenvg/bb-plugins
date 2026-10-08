// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command, CommandInput, CommandItem, CommandList } from "../components/ui/command.js";
import { useRef, useState } from "react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { CompactViewportOverrideProvider } from "../components/ui/hooks/use-compact-viewport.js";
import { ShortcutProvider, useShortcuts } from "./shortcut-provider.js";
import { ProjectSwitcher } from "./project-switcher.js";
import type { useProjects } from "./data.js";
import { TasksRefreshProvider } from "./refresh.js";

const projects = [
  { id: "one", name: "Product", prefix: "PROD", folderId: "child" },
  { id: "two", name: "Product", prefix: "APP", folderId: null },
  { id: "three", name: "Support", prefix: "SUP", folderId: null },
].map((project) => ({
  ...project,
  color: "blue",
  createdAt: "2026-07-15T00:00:00.000Z",
  linkedBbProjectId: null,
  nextTaskNumber: 1,
}));
type Inventory = ReturnType<typeof useProjects>;
const readyInventory = (): Inventory => ({
  data: projects,
  isLoading: false,
  error: null,
  refresh: vi.fn(),
  revision: 1,
  readRevision: () => 1,
});
function setupPicker(inventory = readyInventory(), compact = false) {
  const onSelect = vi.fn();
  const backgroundAction = vi.fn();
  function Background() {
    useShortcuts({ "panel.newTask": backgroundAction });
    return null;
  }
  function Picker({ inventory }: { inventory: Inventory }) {
    const [open, setOpen] = useState(true);
    const root = useRef<HTMLDivElement>(null);
    return (
      <TasksRefreshProvider>
        <CompactViewportOverrideProvider isCompactViewport={compact}>
          <ShortcutProvider rootRef={root}>
            <div ref={root} tabIndex={-1} aria-label="Tasks">
              <Background />
              <button onClick={() => setOpen(true)}>Open picker</button>
              <ProjectSwitcher
                open={open}
                onOpenChange={setOpen}
                inventory={inventory}
                currentProjectId="one"
                focusReturnRef={root}
                onSelect={(id) => {
                  onSelect(id);
                  setOpen(false);
                }}
              />
            </div>
          </ShortcutProvider>
        </CompactViewportOverrideProvider>
      </TasksRefreshProvider>
    );
  }
  const slot = renderSlot(
    { component: Picker },
    { inventory },
    {
      rpc: {
        listFolders: () => ({
          folders: [
            {
              id: "parent",
              name: "Work",
              parentFolderId: null,
              createdAt: projects[0]!.createdAt,
            },
            {
              id: "child",
              name: "Products",
              parentFolderId: "parent",
              createdAt: projects[0]!.createdAt,
            },
          ],
        }),
      },
    },
  );
  return {
    ...slot,
    onSelect,
    backgroundAction,
    rerenderInventory: (inventory: Inventory) =>
      slot.lifecycle.rerender(<Picker inventory={inventory} />),
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("project picker command contract", () => {
  it("uses real cmdk Ctrl+N/P and arrows without wrapping or moving input focus", async () => {
    const onSelect = vi.fn();
    const slot = render(
      <Command shouldFilter={false} loop={false} vimBindings>
        <CommandInput aria-label="Search projects" />
        <CommandList>
          <CommandItem value="one" onSelect={onSelect}>
            One
          </CommandItem>
          <CommandItem value="two" onSelect={onSelect}>
            Two
          </CommandItem>
        </CommandList>
      </Command>,
    );
    const input = slot.getByRole("combobox");
    input.focus();
    const selected = (name: string) =>
      expect(slot.getByRole("option", { name }).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => selected("One"));
    fireEvent.keyDown(input, { key: "n", ctrlKey: true });
    selected("Two");
    fireEvent.keyDown(input, { key: "n", ctrlKey: true });
    selected("Two");
    fireEvent.keyDown(input, { key: "p", ctrlKey: true });
    selected("One");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    selected("One");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    selected("Two");
    expect(document.activeElement).toBe(input);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("two");
  });
});

describe("Tasks project switcher", () => {
  it.each([false, true])(
    "shows distinct accessible projects and focuses search, compact=%s",
    async (compact) => {
      const slot = setupPicker(readyInventory(), compact);
      await slot.findByRole("dialog", { name: "Switch project" });
      const input = await slot.findByRole("combobox", {
        name: "Search projects",
      });
      await waitFor(() => expect(document.activeElement).toBe(input));
      const options = await slot.findAllByRole("option");
      expect(options).toHaveLength(3);
      expect(options[0]!.textContent).toContain("Work / Products");
      expect(options[0]!.textContent).toContain("Current");
      expect(options[0]!.getAttribute("data-value")).toBe("one");
      expect(options[1]!.getAttribute("data-value")).toBe("two");
      expect(slot.getByRole("button", { name: "Close" })).toBeDefined();
      await slot.findByText("Selected Product, PROD");
    },
  );

  it("filters names and prefixes, resets the highlight, scrolls it into view and selects once", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    const slot = setupPicker();
    const input = await slot.findByRole("combobox");
    fireEvent.change(input, { target: { value: "pRoD" } });
    await waitFor(() => expect(slot.getAllByRole("option")).toHaveLength(2));
    fireEvent.keyDown(input, { key: "n", ctrlKey: true });
    expect(slot.getAllByRole("option")[1]!.getAttribute("aria-selected")).toBe("true");
    expect((input as HTMLInputElement).value).toBe("pRoD");
    expect(document.activeElement).toBe(input);
    expect(slot.onSelect).not.toHaveBeenCalled();
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    fireEvent.change(input, { target: { value: "aPp" } });
    await waitFor(() => expect(slot.getAllByRole("option")).toHaveLength(1));
    expect(slot.getByRole("option").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(slot.onSelect).toHaveBeenCalledExactlyOnceWith("two");
  });

  it.each([false, true])(
    "cancels without selection, restores Tasks focus and resets on reopen, compact=%s",
    async (compact) => {
      const slot = setupPicker(readyInventory(), compact);
      const input = await slot.findByRole("combobox");
      fireEvent.change(input, { target: { value: "SUP" } });
      await waitFor(() => expect(slot.getAllByRole("option")).toHaveLength(1));
      fireEvent.keyDown(input, { key: "Escape" });
      await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("Tasks"));
      expect(slot.onSelect).not.toHaveBeenCalled();
      expect(fireEvent.keyDown(document.activeElement!, { key: "n", ctrlKey: true })).toBe(true);
      expect(fireEvent.keyDown(document.activeElement!, { key: "p", ctrlKey: true })).toBe(true);
      fireEvent.click(slot.getByRole("button", { name: "Open picker" }));
      const reopened = await slot.findByRole("combobox");
      expect((reopened as HTMLInputElement).value).toBe("");
      await waitFor(() =>
        expect(slot.getAllByRole("option")[0]!.getAttribute("aria-selected")).toBe("true"),
      );
      fireEvent.click(slot.getByRole("button", { name: "Close" }));
      await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
      expect(slot.onSelect).not.toHaveBeenCalled();
    },
  );

  it("ignores composition and unrelated modifiers and blocks background shortcuts", async () => {
    const slot = setupPicker();
    const input = await slot.findByRole("combobox");
    for (const key of ["c", "p", "v"]) {
      fireEvent.keyDown(input, { key });
      fireEvent.change(input, { target: { value: key } });
      expect((input as HTMLInputElement).value).toBe(key);
    }
    fireEvent.change(input, { target: { value: "" } });
    await waitFor(() => expect(slot.getAllByRole("option")).toHaveLength(3));
    for (const event of [
      { key: "n", ctrlKey: true, isComposing: true },
      { key: "Enter", isComposing: true },
      { key: "n", ctrlKey: true, altKey: true },
      { key: "p", ctrlKey: true, metaKey: true },
      { key: "ArrowDown", shiftKey: true },
    ]) {
      expect(fireEvent.keyDown(input, event)).toBe(true);
      expect(slot.getAllByRole("option")[0]!.getAttribute("aria-selected")).toBe("true");
    }
    const hostShortcut = vi.fn();
    window.addEventListener("keydown", hostShortcut);
    fireEvent.keyDown(input, { key: "k", metaKey: true });
    window.removeEventListener("keydown", hostShortcut);
    expect(hostShortcut).toHaveBeenCalledOnce();
    expect(slot.backgroundAction).not.toHaveBeenCalled();
    expect(slot.onSelect).not.toHaveBeenCalled();
  });

  it("shows no matches and does not select status text", async () => {
    const slot = setupPicker();
    const input = await slot.findByRole("combobox");
    fireEvent.change(input, { target: { value: "nothing matches" } });
    await slot.findByText("No matching projects");
    expect(slot.queryAllByRole("option")).toHaveLength(0);
    for (const key of ["n", "p", "Enter"])
      fireEvent.keyDown(input, { key, ctrlKey: key !== "Enter" });
    expect(slot.onSelect).not.toHaveBeenCalled();
  });

  it.each([
    [{ data: undefined, isLoading: true, error: null }, "Loading projects"],
    [{ data: projects, isLoading: true, error: null }, "Loading projects"],
    [{ data: [], isLoading: false, error: null }, "No projects yet"],
    [{ data: projects, isLoading: false, error: "Inventory unavailable" }, "Inventory unavailable"],
  ])("prevents selection without usable inventory: %s", async (state, message) => {
    const inventory = { ...readyInventory(), ...state };
    const slot = setupPicker(inventory);
    const input = await slot.findByRole("combobox");
    await slot.findByText(message);
    expect(slot.queryAllByRole("option", { selected: true })).toHaveLength(0);
    fireEvent.keyDown(input, { key: "Enter" });
    for (const option of slot.queryAllByRole("option")) fireEvent.click(option);
    expect(slot.onSelect).not.toHaveBeenCalled();
    if (state.error) {
      const retry = slot.getByRole("button", { name: "Retry projects" });
      retry.focus();
      expect(document.activeElement).toBe(retry);
      fireEvent.click(retry);
      expect(inventory.refresh).toHaveBeenCalledOnce();
      slot.rerenderInventory(readyInventory());
      await waitFor(() =>
        expect(slot.getAllByRole("option")[0]!.getAttribute("aria-selected")).toBe("true"),
      );
    }
  });

  it("removes stale choices and uses identity for pointer selection", async () => {
    const slot = setupPicker();
    const input = await slot.findByRole("combobox");
    fireEvent.keyDown(input, { key: "n", ctrlKey: true });
    slot.rerenderInventory({
      ...readyInventory(),
      data: projects.filter((p) => p.id !== "two"),
    });
    await waitFor(() => expect(slot.getAllByRole("option")).toHaveLength(2));
    expect(slot.getAllByRole("option").some((o) => o.getAttribute("data-value") === "two")).toBe(
      false,
    );
    fireEvent.click(slot.getAllByRole("option")[1]!);
    expect(slot.onSelect).toHaveBeenCalledExactlyOnceWith("three");
  });
});
