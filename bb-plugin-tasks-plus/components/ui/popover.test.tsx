// @vitest-environment jsdom
import { useRef, useState } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPACT_VIEWPORT_QUERY } from "./hooks/use-compact-viewport.js";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.js";

let compact = false;
beforeEach(() => {
  window.matchMedia = (query: string) => ({
    matches: compact && query === COMPACT_VIEWPORT_QUERY,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
});
afterEach(cleanup);

function Fixture({
  onClose,
  removeTrigger = false,
}: {
  onClose: (event: Event) => void;
  removeTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button>Other control</button>
      <Popover open={open} onOpenChange={setOpen}>
        {!removeTrigger ? (
          <PopoverTrigger asChild>
            <button ref={trigger}>Summary</button>
          </PopoverTrigger>
        ) : null}
        <PopoverContent
          mobileTitle="Summary details"
          aria-label="Summary details"
          onCloseAutoFocus={(event) => {
            onClose(event);
            if (event.defaultPrevented) trigger.current?.focus();
          }}
        >
          <button onClick={() => setOpen(false)}>Close details</button>
        </PopoverContent>
      </Popover>
    </>
  );
}

for (const isCompact of [false, true]) {
  describe(`popover close focus, compact=${isCompact}`, () => {
    beforeEach(() => {
      compact = isCompact;
    });

    it.each(["close", "Escape"])(
      "delivers one cancelable autofocus callback on %s",
      async (method) => {
        const onClose = vi.fn((event: Event) => event.preventDefault());
        const view = render(<Fixture onClose={onClose} />);
        const trigger = view.getByRole("button", { name: "Summary" });
        // Pointer activation need not focus the trigger before opening.
        view.getByRole("button", { name: "Other control" }).focus();
        fireEvent.click(trigger);
        const close = await view.findByRole("button", { name: "Close details" });
        close.focus();
        if (method === "Escape") fireEvent.keyDown(close, { key: "Escape" });
        else fireEvent.click(close);
        await waitFor(() => expect(view.queryByRole("dialog")).toBeNull());
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        expect(onClose.mock.calls[0]![0].cancelable).toBe(true);
        expect(document.activeElement).toBe(trigger);
      },
    );

    it("keeps default focus restoration when the callback does not cancel", async () => {
      const onClose = vi.fn();
      const view = render(<Fixture onClose={onClose} />);
      const trigger = view.getByRole("button", { name: "Summary" });
      trigger.focus();
      fireEvent.click(trigger);
      const close = await view.findByRole("button", { name: "Close details" });
      close.focus();
      fireEvent.click(close);
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it("does not restore default focus to a detached trigger", async () => {
      const onClose = vi.fn();
      const view = render(<Fixture onClose={onClose} />);
      const trigger = view.getByRole("button", { name: "Summary" });
      trigger.focus();
      fireEvent.click(trigger);
      const close = await view.findByRole("button", { name: "Close details" });
      close.focus();
      view.rerender(<Fixture onClose={onClose} removeTrigger />);
      const focusRemoved = vi.spyOn(trigger, "focus");
      fireEvent.keyDown(close, { key: "Escape" });
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(focusRemoved).not.toHaveBeenCalled();
    });

    it("does not steal focus when an open overlay and its trigger unmount", async () => {
      const onClose = vi.fn((event: Event) => event.preventDefault());
      const view = render(<Fixture onClose={onClose} />);
      const trigger = view.getByRole("button", { name: "Summary" });
      trigger.focus();
      fireEvent.click(trigger);
      (await view.findByRole("button", { name: "Close details" })).focus();
      view.unmount();
      const focusRemoved = vi.spyOn(trigger, "focus");
      const next = document.createElement("button");
      document.body.append(next);
      next.focus();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(document.activeElement).toBe(next);
      expect(focusRemoved).not.toHaveBeenCalled();
      next.remove();
    });

    it("does not focus a removed trigger or steal focus after unmount", async () => {
      const onClose = vi.fn((event: Event) => event.preventDefault());
      const view = render(<Fixture onClose={onClose} />);
      const trigger = view.getByRole("button", { name: "Summary" });
      fireEvent.click(trigger);
      const close = await view.findByRole("button", { name: "Close details" });
      close.focus();
      view.rerender(<Fixture onClose={onClose} removeTrigger />);
      const focusRemoved = vi.spyOn(trigger, "focus");
      fireEvent.keyDown(close, { key: "Escape" });
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(focusRemoved).not.toHaveBeenCalled();
      view.unmount();
      const next = document.createElement("button");
      document.body.append(next);
      next.focus();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(document.activeElement).toBe(next);
      next.remove();
    });
  });
}

describe("compact close before content realization", () => {
  beforeEach(() => {
    compact = true;
  });

  it.each(["Escape", "backdrop"])("restores focus once on immediate %s", (method) => {
    const onClose = vi.fn((event: Event) => event.preventDefault());
    const view = render(<Fixture onClose={onClose} />);
    const trigger = view.getByRole("button", { name: "Summary" });
    view.getByRole("button", { name: "Other control" }).focus();
    fireEvent.click(trigger);
    const panel = view.getByRole("dialog");
    expect(panel.querySelector("[data-responsive-drawer-placeholder]")).not.toBeNull();
    expect(document.activeElement).toBe(panel);
    if (method === "Escape") fireEvent.keyDown(panel, { key: "Escape" });
    else fireEvent.click(document.querySelector("[data-persistent-drawer-backdrop]")!);
    expect(view.queryByRole("dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it("does not restore focus when the placeholder and trigger unmount", async () => {
    const onClose = vi.fn((event: Event) => event.preventDefault());
    const view = render(<Fixture onClose={onClose} />);
    fireEvent.click(view.getByRole("button", { name: "Summary" }));
    expect(document.querySelector("[data-responsive-drawer-placeholder]")).not.toBeNull();
    view.unmount();
    const next = document.createElement("button");
    document.body.append(next);
    next.focus();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.activeElement).toBe(next);
    expect(onClose).not.toHaveBeenCalled();
    next.remove();
  });
});
