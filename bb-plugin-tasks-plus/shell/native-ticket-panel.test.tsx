// @vitest-environment jsdom
import { act, fireEvent, within, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import {
  acceptNavigation,
  panel,
  deferred,
  tasks,
  row,
  setup,
  useWorkspaceTestLifecycle,
} from "./browse-workspace.test-support.js";

useWorkspaceTestLifecycle();

describe("native Ticket tab", () => {
  it("keeps the list in Tasks and opens the editable ticket in the host tab", async () => {
    const tab = panel.fixedTabs?.find((entry) => entry.id === "ticket");
    expect(tab?.title).toBe("Ticket");
    const page = setup("all", {}, { nativeTab: false });
    const ticket = renderSlot(tab!, { subPath: "all" });
    await page.findByRole("button", { name: "Open TSK-1: Title 1" });
    fireEvent.click(row(page, 1));
    await acceptNavigation(page);

    const title = await within(ticket.container).findByRole("textbox", {
      name: "Task title",
    });
    expect(page.container.contains(title)).toBe(false);
    expect(page.getByRole("region", { name: "Ticket list" }).style.width).toBe(
      "",
    );
    expect(row(page, 1).getAttribute("aria-current")).toBe("true");
  });
  it("navigates from the native editor without claiming another BB pane's keys", async () => {
    const page = setup("all?task=TSK-1", {}, { nativeTab: false });
    const ticket = renderSlot(panel.fixedTabs![0]!, {
      subPath: "all?task=TSK-1",
    });
    await within(ticket.container).findByRole("textbox", {
      name: "Task title",
    });
    const detail = within(ticket.container).getByRole("region", {
      name: "Selected ticket",
    });
    detail.focus();
    fireEvent.keyDown(detail, { key: "j" });
    expect(page.inspection.navigateCalls.at(-1)).toMatchObject({
      method: "toPluginPanel",
      options: { subPath: "all?task=TSK-2" },
    });
    await acceptNavigation(page);
    expect(
      (
        await within(ticket.container).findByRole("textbox", {
          name: "Task title",
        })
      ).textContent,
    ).toBe("Title 2");
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    const calls = page.inspection.navigateCalls.length;
    fireEvent.keyDown(outside, { key: "j" });
    expect(page.inspection.navigateCalls).toHaveLength(calls);
    outside.remove();
  });
  it("dismisses an editor overlay when the host switches away from Ticket", async () => {
    const page = setup("all?task=TSK-1", {}, { nativeTab: false });
    const ticket = renderSlot(panel.fixedTabs![0]!, {
      subPath: "all?task=TSK-1",
    });
    await within(ticket.container).findByRole("textbox", {
      name: "Task title",
    });
    const status = within(ticket.container).getAllByRole("button", {
      name: "Todo",
    })[0]!;
    status.focus();
    fireEvent.keyDown(status, { key: "Enter" });
    expect(page.getByRole("menu")).toBeTruthy();
    ticket.lifecycle.unmount();
    expect(page.queryByRole("menu")).toBeNull();
  });
  it("reveals the unsaved origin when switching from a closed Ticket tab fails", async () => {
    const page = setup(
      "all?task=TSK-1",
      {
        updateTask: () => ({ ok: false, error: { message: "Offline" } }),
      },
      { nativeTab: false },
    );
    const ticket = renderSlot(panel.fixedTabs![0]!, {
      subPath: "all?task=TSK-1",
    });
    const title = await within(ticket.container).findByRole("textbox", {
      name: "Task title",
    });
    title.textContent = "Unsent title";
    fireEvent.input(title);
    ticket.lifecycle.unmount();
    const opens = page.inspection.experimental_fixedTabOpenCalls.length;
    fireEvent.click(row(page, 2));
    expect(
      page.inspection.experimental_fixedTabOpenCalls.length,
    ).toBeGreaterThan(opens);
    const restored = renderSlot(panel.fixedTabs![0]!, {
      subPath: "all?task=TSK-1",
    });
    expect(
      (await within(restored.container).findByRole("alert")).textContent,
    ).toContain("Offline");
    expect(
      within(restored.container).getByRole("textbox", { name: "Task title" }),
    ).toBe(title);
    expect(title.textContent).toBe("Unsent title");
    expect(page.inspection.navigateCalls).toEqual([]);
  });
  it("does not reopen Ticket after the user switches tabs during a pending save", async () => {
    const saved = deferred<unknown>();
    const page = setup(
      "all?task=TSK-1",
      { updateTask: () => saved.promise },
      { nativeTab: false },
    );
    const ticket = renderSlot(panel.fixedTabs![0]!, {
      subPath: "all?task=TSK-1",
    });
    const title = await within(ticket.container).findByRole("textbox", {
      name: "Task title",
    });
    title.textContent = "Pending A";
    fireEvent.input(title);
    fireEvent.click(row(page, 2));
    ticket.lifecycle.unmount();
    const outside = document.createElement("input");
    document.body.append(outside);
    outside.focus();
    const opens = page.inspection.experimental_fixedTabOpenCalls.length;
    await act(async () => saved.resolve({ ok: true, task: tasks[0] }));
    await acceptNavigation(page);
    expect(page.inspection.experimental_fixedTabOpenCalls).toHaveLength(opens);
    expect(page.queryByRole("textbox", { name: "Task title" })).toBeNull();
    expect(document.activeElement).toBe(outside);
    outside.remove();
    const restored = renderSlot(panel.fixedTabs![0]!, {
      subPath: "all?task=TSK-2",
    });
    expect(
      (
        await within(restored.container).findByRole("textbox", {
          name: "Task title",
        })
      ).textContent,
    ).toBe("Title 2");
  });
  it("releases the retained editor and drafts when the Tasks page closes", async () => {
    const page = setup("all?task=TSK-1", {}, { nativeTab: false });
    const ticket = renderSlot(panel.fixedTabs![0]!, {
      subPath: "all?task=TSK-1",
    });
    const title = await within(ticket.container).findByRole("textbox", {
      name: "Task title",
    });
    const comment = ticket.container.querySelectorAll<HTMLElement>(
      '.tiptap[contenteditable="true"]',
    )[1]!;
    await act(async () => {
      comment.innerHTML = "<p>Old page draft</p>";
      fireEvent.input(comment);
    });
    page.lifecycle.unmount();
    expect(ticket.queryByRole("textbox", { name: "Task title" })).toBeNull();
    expect(within(ticket.container).getByText(/Choose a ticket/)).toBeTruthy();
    const nextPage = setup("all?task=TSK-1", {}, { nativeTab: false });
    const nextTitle = await within(ticket.container).findByRole("textbox", {
      name: "Task title",
    });
    expect(nextTitle).not.toBe(title);
    expect(nextTitle.textContent).toBe("Title 1");
    expect(ticket.container.textContent).not.toContain("Old page draft");
    expect(nextPage.inspection.navigateCalls).toEqual([]);
  });
  it("offers the existing standalone editor if BB declines to open Ticket", async () => {
    const page = setup(
      "all",
      {},
      { nativeTab: false, openFixedTab: () => false },
    );
    await page.findByRole("button", { name: "Open TSK-1: Title 1" });
    fireEvent.click(row(page, 1));
    await acceptNavigation(page);
    expect(await page.findByText(/couldn't open the Ticket pane/)).toBeTruthy();
    fireEvent.click(
      page.getByRole("button", { name: "Open standalone ticket" }),
    );
    expect(page.inspection.navigateCalls.at(-1)).toMatchObject({
      method: "toPluginPanel",
      options: { subPath: "task/TSK-1" },
    });
  });
  it.each(["owner", "other"])(
    "keeps one explicit outlet owner when disposing %s",
    async (dispose) => {
      setup("all?task=TSK-1", {}, { nativeTab: false });
      const first = renderSlot(panel.fixedTabs![0]!, {
        subPath: "all?task=TSK-1",
      });
      const title = await within(first.container).findByRole("textbox", {
        name: "Task title",
      });
      const second = renderSlot(panel.fixedTabs![0]!, {
        subPath: "all?task=TSK-1",
      });
      expect(first.container.contains(title)).toBe(true);
      fireEvent.click(
        within(second.container).getByRole("button", {
          name: "Show ticket here",
        }),
      );
      expect(second.container.contains(title)).toBe(true);
      fireEvent.click(
        within(first.container).getByRole("button", {
          name: "Show ticket here",
        }),
      );
      expect(first.container.contains(title)).toBe(true);
      const [closed, remaining] =
        dispose === "owner" ? [first, second] : [second, first];
      closed.lifecycle.unmount();
      expect(remaining.container.contains(title)).toBe(true);
      expect(
        document.querySelectorAll('[aria-label="Task title"]'),
      ).toHaveLength(1);
    },
  );
  it("does not reopen Ticket after a failed save is retried and the user switches tabs", async () => {
    const saved = deferred<unknown>();
    let attempts = 0;
    const page = setup(
      "all?task=TSK-1",
      {
        updateTask: () =>
          ++attempts === 1
            ? { ok: false, error: { message: "Offline" } }
            : saved.promise,
      },
      { nativeTab: false },
    );
    const ticket = renderSlot(panel.fixedTabs![0]!, {
      subPath: "all?task=TSK-1",
    });
    const title = await within(ticket.container).findByRole("textbox", {
      name: "Task title",
    });
    title.textContent = "Retry A";
    fireEvent.input(title);
    fireEvent.click(row(page, 2));
    await within(ticket.container).findByRole("alert");
    fireEvent.click(
      within(ticket.container).getByRole("button", { name: "Retry save" }),
    );
    ticket.lifecycle.unmount();
    const opens = page.inspection.experimental_fixedTabOpenCalls.length;
    await act(async () => saved.resolve({ ok: true, task: tasks[0] }));
    await acceptNavigation(page);
    expect(page.inspection.experimental_fixedTabOpenCalls).toHaveLength(opens);
  });
  it("makes the same failed origin editable when the host declines reopening", async () => {
    let canOpen = true;
    let canSave = false;
    const page = setup(
      "all?task=TSK-1",
      {
        updateTask: () =>
          canSave
            ? { ok: true, task: tasks[0] }
            : { ok: false, error: { message: "Offline" } },
      },
      { nativeTab: false, openFixedTab: () => canOpen },
    );
    const ticket = renderSlot(panel.fixedTabs![0]!, {
      subPath: "all?task=TSK-1",
    });
    const title = await within(ticket.container).findByRole("textbox", {
      name: "Task title",
    });
    title.textContent = "Recover A";
    fireEvent.input(title);
    ticket.lifecycle.unmount();
    canOpen = false;
    fireEvent.click(row(page, 2));
    expect(
      await within(page.container).findByRole("textbox", {
        name: "Task title",
      }),
    ).toBe(title);
    expect(title.textContent).toBe("Recover A");
    expect(
      (await within(page.container).findByRole("alert")).textContent,
    ).toContain("Offline");
    expect(page.inspection.navigateCalls).toEqual([]);
    canSave = true;
    fireEvent.click(
      within(page.container).getByRole("button", { name: "Retry save" }),
    );
    await waitFor(() => expect(page.inspection.navigateCalls).toHaveLength(1));
    await acceptNavigation(page);
    expect(
      (
        await within(page.container).findByRole("textbox", {
          name: "Task title",
        })
      ).textContent,
    ).toBe("Title 2");
    canOpen = true;
    fireEvent.click(
      within(page.container).getByRole("button", {
        name: "Try Ticket pane again",
      }),
    );
    const restored = renderSlot(panel.fixedTabs![0]!, {
      subPath: "all?task=TSK-2",
    });
    expect(
      (
        await within(restored.container).findByRole("textbox", {
          name: "Task title",
        })
      ).textContent,
    ).toBe("Title 2");
    expect(
      within(page.container).getByRole("region", { name: "Ticket list" }),
    ).toBeTruthy();
  });
});
