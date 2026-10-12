// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountFooterAdapter } from "./footer-adapter.js";
import { footerFixture } from "./footer-fixture.test-support.js";

// Restored BBP-61 public adapter regressions after the src/footer move.
const disposers: (() => void)[] = [];
afterEach(() => {
  disposers
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const mount = () => {
  const adapter = mountFooterAdapter(document, "codex-quota");
  disposers.push(adapter.dispose);
  return adapter;
};

// A task-turn boundary drains MutationObserver delivery and queued reconciliation.
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function workCounters(sidebar: HTMLElement) {
  const discovery = vi.spyOn(document, "querySelectorAll");
  const reconciliation = vi.spyOn(sidebar, "querySelectorAll");
  const visibility = vi.spyOn(window, "getComputedStyle");
  return { discovery, reconciliation, visibility };
}

describe("quota footer work isolation", () => {
  it("does no discovery, reconciliation or visibility reads for task headings, descriptions and activity", async () => {
    const { sidebar } = footerFixture();
    const task = document.createElement("main");
    document.body.append(task);
    const adapter = mount();
    await settle();
    const target = adapter.getSnapshot()[0];
    const counters = workCounters(sidebar);
    for (let i = 0; i < 4; i++) {
      task.innerHTML = `<h2 class="selected">Task ${i}</h2><section><p>Description</p></section><div>Activity</div>`;
      task.className = `task-${i}`;
      task.style.visibility = "visible";
      task.setAttribute("aria-describedby", `task-description-${i}`);
      task.querySelector("h2")!.textContent = `New heading ${i}`;
      task.querySelector("section")!.replaceChildren(document.createElement("p"));
      task.lastElementChild!.append(document.createElement("article"));
      await settle();
    }
    expect(counters.discovery).not.toHaveBeenCalled();
    expect(counters.reconciliation).not.toHaveBeenCalled();
    expect(counters.visibility).not.toHaveBeenCalled();
    expect(adapter.getSnapshot()[0]).toBe(target);
  });

  it("coalesces a relevant burst and ignores badge and owned accessibility writes", async () => {
    const { sidebar, item, button } = footerFixture();
    const adapter = mount();
    await settle();
    const target = adapter.getSnapshot()[0]!;
    const counters = workCounters(sidebar);
    item.className = "changed";
    item.style.visibility = "visible";
    button.setAttribute("aria-describedby", "host-tooltip");
    await settle();
    expect(counters.reconciliation).toHaveBeenCalledTimes(1);
    expect(counters.visibility).toHaveBeenCalled();
    expect(button.getAttribute("aria-describedby")).toBe(`host-tooltip ${target.descriptionId}`);
    counters.reconciliation.mockClear();
    counters.visibility.mockClear();
    target.container.innerHTML = '<span title="72%">72%</span>';
    target.container.className = "fresh";
    target.container.firstElementChild!.textContent = "71%";
    adapter.setNavigationReady(true);
    target.commit();
    await settle();
    await settle();
    // Navigation readiness itself queries rows, but must not reconcile footer targets.
    expect(
      counters.reconciliation.mock.calls.filter(([selector]) =>
        selector.includes("data-footer-item"),
      ),
    ).toHaveLength(0);
    expect(counters.visibility).not.toHaveBeenCalled();
  });

  it.each(["hidden", "inert", "style", "class"])(
    "follows an outer ancestor's %s visibility without overriding preferences",
    async (mode) => {
      const { sidebar, row } = footerFixture();
      const ancestor = document.createElement("section");
      document.body.append(ancestor);
      ancestor.append(sidebar);
      const sheet = document.createElement("style");
      sheet.textContent = ".quota-test-hidden { display: none; }";
      document.head.append(sheet);
      disposers.push(() => sheet.remove());
      const adapter = mount();
      adapter.setNavigationReady(true);
      adapter.getSnapshot()[0]!.commit();
      await settle();
      const hide = () => {
        if (mode === "hidden") ancestor.hidden = true;
        if (mode === "inert") ancestor.setAttribute("inert", "");
        if (mode === "style") ancestor.style.display = "none";
        if (mode === "class") ancestor.className = "quota-test-hidden";
      };
      hide();
      await settle();
      expect(adapter.getSnapshot()).toHaveLength(0);
      expect(row.hasAttribute("data-codex-quota-suppressed")).toBe(false);
      expect(ancestor.hasAttribute(mode === "inert" ? "inert" : mode)).toBe(true);
      ancestor.removeAttribute(mode);
      await settle();
      expect(adapter.getSnapshot()).toHaveLength(1);
    },
  );

  it("follows compact drawer replacement, late sidebar identity and unavailable target recovery", async () => {
    const first = footerFixture();
    const adapter = mount();
    await settle();
    const original = adapter.getSnapshot()[0]!;
    first.sidebar.hidden = true;
    const drawer = document.createElement("section");
    const compact = footerFixture();
    compact.sidebar.removeAttribute("data-sidebar");
    compact.button.disabled = true;
    drawer.append(compact.sidebar);
    document.body.append(drawer);
    await settle();
    expect(adapter.getSnapshot()).toHaveLength(0);
    expect(original.container.isConnected).toBe(false);
    compact.sidebar.setAttribute("data-sidebar", "sidebar");
    compact.button.disabled = false;
    await settle();
    expect(adapter.getSnapshot()).toHaveLength(1);
    expect(adapter.getSnapshot()[0]!.container.parentElement).toBe(compact.button);
    drawer.remove();
    first.sidebar.hidden = false;
    await settle();
    expect(adapter.getSnapshot()).toHaveLength(1);
    expect(adapter.getSnapshot()[0]!.container.parentElement).toBe(first.button);
    expect(compact.button.querySelector("[data-codex-quota-badge]")).toBeNull();
  });
  it("repairs an externally removed badge and restores fallback until the replacement commits", async () => {
    const { row, button } = footerFixture();
    const adapter = mount();
    adapter.setNavigationReady(true);
    const original = adapter.getSnapshot()[0]!;
    original.commit();
    await settle();
    original.container.remove();
    await settle();
    const replacement = adapter.getSnapshot()[0]!;
    expect(replacement).not.toBe(original);
    expect(replacement.container.parentElement).toBe(button);
    expect(row.hasAttribute("data-codex-quota-suppressed")).toBe(false);
    replacement.commit();
    expect(row.hasAttribute("data-codex-quota-suppressed")).toBe(true);
  });

  it("rechecks stylesheet and viewport signals, then removes their listeners on disposal", async () => {
    const { sidebar } = footerFixture();
    sidebar.className = "quota-test-sidebar";
    const adapter = mount();
    await settle();
    const sheet = document.createElement("style");
    sheet.textContent = ".quota-test-sidebar { display: none; }";
    document.head.append(sheet);
    disposers.push(() => sheet.remove());
    await settle();
    expect(adapter.getSnapshot()).toHaveLength(0);
    sheet.textContent = ".quota-test-sidebar { display: block; }";
    await settle();
    expect(adapter.getSnapshot()).toHaveLength(1);
    const counters = workCounters(sidebar);
    window.dispatchEvent(new Event("resize"));
    await settle();
    expect(counters.reconciliation).toHaveBeenCalledTimes(1);
    adapter.dispose();
    counters.reconciliation.mockClear();
    counters.visibility.mockClear();
    window.dispatchEvent(new Event("resize"));
    sheet.textContent = ".quota-test-sidebar { display: none; }";
    await settle();
    expect(counters.reconciliation).not.toHaveBeenCalled();
    expect(counters.visibility).not.toHaveBeenCalled();
  });
  it("rechecks a stylesheet link when its relation changes or it finishes loading", async () => {
    const { sidebar } = footerFixture();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    document.head.append(link);
    disposers.push(() => link.remove());
    mount();
    await settle();
    const counters = workCounters(sidebar);
    link.rel = "preload";
    await settle();
    expect(counters.reconciliation).toHaveBeenCalledTimes(1);
    counters.reconciliation.mockClear();
    link.rel = "stylesheet";
    await settle();
    expect(counters.reconciliation).toHaveBeenCalledTimes(1);
    counters.reconciliation.mockClear();
    link.dispatchEvent(new Event("load"));
    await settle();
    expect(counters.reconciliation).toHaveBeenCalledTimes(1);
  });

  it("does not reattach when disposed with reconciliation queued", async () => {
    const { sidebar, item, row, button } = footerFixture();
    const adapter = mount();
    adapter.setNavigationReady(true);
    adapter.getSnapshot()[0]!.commit();
    await settle();
    const queued: VoidFunction[] = [];
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) => {
      queued.push(callback);
    });
    item.className = "changed";
    await settle();
    expect(queued).toHaveLength(1);
    adapter.dispose();
    const counters = workCounters(sidebar);
    queued.forEach((callback) => callback());
    item.className = "changed-again";
    await settle();
    expect(counters.reconciliation).not.toHaveBeenCalled();
    expect(counters.visibility).not.toHaveBeenCalled();
    expect(adapter.getSnapshot()).toHaveLength(0);
    expect(button.querySelector("[data-codex-quota-badge]")).toBeNull();
    expect(row.hasAttribute("data-codex-quota-suppressed")).toBe(false);
  });
});
