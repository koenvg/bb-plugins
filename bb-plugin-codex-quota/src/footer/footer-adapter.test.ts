// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { mountFooterAdapter } from "./footer-adapter.js";
import { footerFixture } from "./footer-fixture.test-support.js";

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
  document.body.replaceChildren();
});
const mount = () => {
  const adapter = mountFooterAdapter(document, "codex-quota");
  disposers.push(adapter.dispose);
  return adapter;
};

describe("quota footer attachment", () => {
  it("adds one badge target to its own native button without replacing host content", () => {
    const { sidebar, button, row } = footerFixture();
    const icon = button.querySelector("svg");
    const unrelated = sidebar.querySelector(
      '[data-footer-item="plugin:connect/remote-access"]',
    )!.outerHTML;
    const adapter = mount();
    expect(adapter.getSnapshot()).toHaveLength(1);
    expect(adapter.getSnapshot()[0]!.container.parentElement).toBe(button);
    expect(button.querySelector("svg")).toBe(icon);
    expect(
      sidebar.querySelector('[data-footer-item="plugin:connect/remote-access"]')!.outerHTML,
    ).toBe(unrelated);
    expect(getComputedStyle(row).display).not.toBe("none");
    adapter.dispose();
    expect(button.children).toHaveLength(2);
    expect(button.getAttribute("aria-describedby")).toBe("existing-description");
  });

  it("follows late mounts and sidebar replacement without duplicate or detached badges", async () => {
    const adapter = mount();
    const changes: number[] = [];
    const unsubscribe = adapter.subscribe(() => changes.push(adapter.getSnapshot().length));
    const first = footerFixture();
    await waitFor(() => expect(adapter.getSnapshot()).toHaveLength(1));
    const target = adapter.getSnapshot()[0]!;
    first.sidebar.append(document.createElement("div"));
    await waitFor(() => expect(first.button.children).toHaveLength(3));
    expect(adapter.getSnapshot()[0]).toBe(target);
    first.sidebar.remove();
    const second = footerFixture();
    await waitFor(() =>
      expect(adapter.getSnapshot()[0]?.container.parentElement).toBe(second.button),
    );
    expect(target.container.parentElement).toBeNull();
    adapter.dispose();
    expect(adapter.getSnapshot()).toEqual([]);
    expect(second.button.children).toHaveLength(2);
    footerFixture();
    await Promise.resolve();
    expect(adapter.getSnapshot()).toEqual([]);
    expect(changes).toContain(1);
    unsubscribe();
  });

  it("suppresses navigation only after render and navigation readiness, with reversible focus and descriptions", () => {
    const { row, button } = footerFixture();
    const adapter = mount();
    const target = adapter.getSnapshot()[0]!;
    const uncommit = target.commit();
    expect(getComputedStyle(row).display).not.toBe("none");
    row.querySelector("button")!.focus();
    adapter.setNavigationReady(true);
    expect(document.activeElement).toBe(button);
    expect(getComputedStyle(row).display).toBe("none");
    expect(button.getAttribute("aria-describedby")?.split(" ")).toContain(target.descriptionId);
    uncommit();
    expect(getComputedStyle(row).display).not.toBe("none");
    const stop = target.commit();
    adapter.setNavigationReady(false);
    expect(getComputedStyle(row).display).not.toBe("none");
    adapter.setNavigationReady(true);
    expect(getComputedStyle(row).display).toBe("none");
    adapter.dispose();
    stop();
    expect(getComputedStyle(row).display).not.toBe("none");
    expect(button.getAttribute("aria-describedby")).toBe("existing-description");
    expect(document.querySelector("[data-codex-quota-style]")).toBeNull();
  });

  it("keeps the upper quota entry suppressed while a context menu hides the background from screen readers", async () => {
    const { sidebar, row, button } = footerFixture();
    const adapter = mount();
    adapter.setNavigationReady(true);
    const target = adapter.getSnapshot()[0]!;
    target.commit();
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    document.body.append(menu);

    // Radix modal menus isolate the background with aria-hidden, not display:none.
    sidebar.setAttribute("aria-hidden", "true");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(adapter.getSnapshot()[0]).toBe(target);
    expect(target.container.parentElement).toBe(button);
    expect(sidebar.getAttribute("aria-hidden")).toBe("true");
    expect(getComputedStyle(row).display).toBe("none");

    sidebar.removeAttribute("aria-hidden");
    menu.remove();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(adapter.getSnapshot()[0]).toBe(target);
    expect(getComputedStyle(row).display).toBe("none");
  });
  it.each(["hidden", "display", "duplicate", "remove"])(
    "restores navigation when its footer becomes %s",
    async (mode) => {
      const { sidebar, row, item } = footerFixture();
      const adapter = mount();
      adapter.setNavigationReady(true);
      adapter.getSnapshot()[0]!.commit();
      expect(getComputedStyle(row).display).toBe("none");
      if (mode === "hidden") item.hidden = true;
      if (mode === "display") item.style.display = "none";
      if (mode === "duplicate") item.after(item.cloneNode(true));
      if (mode === "remove") item.remove();
      await waitFor(() => expect(getComputedStyle(row).display).not.toBe("none"));
      expect(adapter.getSnapshot()).toHaveLength(0);
      expect(
        getComputedStyle(sidebar.querySelector('[data-sidebar-navigation-item="other/quota"]')!)
          .display,
      ).not.toBe("none");
    },
  );

  it("leaves ambiguous navigation and the user's own hidden state untouched", () => {
    const { row, button } = footerFixture();
    row.hidden = true;
    const clone = row.cloneNode(true) as HTMLElement;
    row.after(clone);
    const adapter = mount();
    adapter.setNavigationReady(true);
    adapter.getSnapshot()[0]!.commit();
    expect(row.hasAttribute("data-codex-quota-suppressed")).toBe(false);
    button.setAttribute(
      "aria-describedby",
      `${button.getAttribute("aria-describedby")} new-description`,
    );
    adapter.dispose();
    expect(row.hidden).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBe("existing-description new-description");
  });

  it("lets the native button receive pointer hits over the portalled percentage", () => {
    footerFixture();
    const adapter = mount();
    expect(getComputedStyle(adapter.getSnapshot()[0]!.container).pointerEvents).toBe("none");
  });
});
