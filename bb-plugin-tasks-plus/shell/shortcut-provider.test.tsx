// @vitest-environment jsdom
import { useRef } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  ShortcutOwner,
  ShortcutProvider,
  useShortcuts,
} from "./shortcut-provider.js";

afterEach(cleanup);
it.each([false, true])(
  "chooses pane actions independently of registration order, reversed=%s",
  (reverse) => {
    const listAction = vi.fn();
    const detailAction = vi.fn();
    function Actions({ pane }: { pane: "list" | "detail" }) {
      useShortcuts(
        pane === "list"
          ? {
              "list.status": listAction,
              "list.priority": listAction,
              "list.labels": listAction,
            }
          : {
              "detail.status": detailAction,
              "detail.priority": detailAction,
              "detail.labels": detailAction,
            },
      );
      return <button>{pane}</button>;
    }
    function Fixture() {
      const rootRef = useRef<HTMLDivElement>(null);
      const listRef = useRef<HTMLElement>(null);
      const detailRef = useRef<HTMLElement>(null);
      const list = (
        <section key="list" ref={listRef}>
          <ShortcutOwner value={{ rootRef: listRef }}>
            <Actions pane="list" />
          </ShortcutOwner>
        </section>
      );
      const detail = (
        <section key="detail" ref={detailRef}>
          <ShortcutOwner value={{ rootRef: detailRef }}>
            <Actions pane="detail" />
          </ShortcutOwner>
        </section>
      );
      return (
        <div ref={rootRef}>
          <ShortcutProvider rootRef={rootRef}>
            {reverse ? [detail, list] : [list, detail]}
          </ShortcutProvider>
        </div>
      );
    }
    const view = render(<Fixture />);
    for (const pane of ["list", "detail"] as const) {
      const button = view.getByRole("button", { name: pane });
      button.focus();
      for (const key of ["s", "p", "l"]) fireEvent.keyDown(button, { key });
      expect(pane === "list" ? listAction : detailAction).toHaveBeenCalledTimes(
        3,
      );
      expect(pane === "list" ? detailAction : listAction).toHaveBeenCalledTimes(
        pane === "list" ? 0 : 3,
      );
    }
    const detail = view.getByRole("button", { name: "detail" });
    detail.parentElement!.hidden = true;
    detail.parentElement!.setAttribute("inert", "");
    fireEvent.keyDown(detail, { key: "s" });
    expect(detailAction).toHaveBeenCalledTimes(3);
    expect(listAction).toHaveBeenCalledTimes(3);
  },
);
