export type FooterTarget = {
  container: HTMLSpanElement;
  descriptionId: string;
  trigger: HTMLButtonElement;
  commit(): () => void;
};
type Attachment = FooterTarget & { rendered: boolean };
let nextId = 0;

const styles = `
[data-codex-quota-footer] { width: max-content !important; padding-inline: .5rem !important; gap: .35rem; flex-shrink: 0; }
/* Portal events follow React ancestry, not the native button's tree. Keep its hit target. */
[data-codex-quota-badge] { display: inline-flex; flex-shrink: 0; overflow: visible !important; pointer-events: none; }
[data-codex-quota-badge] > span[title] { width: auto; min-width: 4ch; white-space: nowrap; text-align: left; }
[data-codex-quota-suppressed] { display: none !important; }
`;

function isAvailable(button: HTMLButtonElement): boolean {
  if (!button.isConnected || button.disabled || button.getAttribute("aria-disabled") === "true")
    return false;
  for (let node: HTMLElement | null = button; node; node = node.parentElement) {
    // Modal menus set aria-hidden on the background without removing the footer.
    // Keep its attachment and navigation suppression until it is actually hidden.
    if (node.hidden || node.inert || node.hasAttribute("inert")) return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
  }
  return true;
}

/**
 * BB 0.44 DOM compatibility boundary, verified in desktop and compact Arc.
 * Identity selectors are intentionally isolated here. Missing/ambiguous targets
 * leave normal navigation alone. Never move or replace host-owned children,
 * write sidebar preferences, or retain suppression after a portal detaches.
 *
 * Discover sidebar lifetimes from changed subtrees, then observe each sidebar
 * and its outer visibility ancestors. Unrelated task changes cause no sidebar
 * scan or computed-style reads. Relevant changes share one queued microtask.
 * Stylesheet DOM/load and viewport signals recheck visibility without polling.
 * Direct CSSOM changes need a DOM/load/resize signal. Disposal revokes queued work.
 */
export function mountFooterAdapter(document: Document, pluginId: string) {
  let targets: readonly FooterTarget[] = [];
  let disposed = false;
  let queued = false;
  const listeners = new Set<() => void>();
  const attached = new Map<HTMLButtonElement, Attachment>();
  const suppressed = new Set<Element>();
  let navigationReady = false;
  const key = `plugin:${encodeURIComponent(pluginId)}/quota`;
  const sidebarSelector = '[data-sidebar="sidebar"]';
  const sidebars = new Set<Element>(Array.from(document.querySelectorAll(sidebarSelector)));
  const style = document.createElement("style");
  style.setAttribute("data-codex-quota-style", pluginId);
  style.textContent = styles;
  document.head.append(style);

  function updateNavigation() {
    const next = new Set<Element>();
    if (navigationReady && !disposed) {
      for (const [button, target] of attached) {
        if (!target.rendered) continue;
        const sidebar = button.closest('[data-sidebar="sidebar"]');
        const rows = Array.from(
          sidebar?.querySelectorAll(
            '[data-testid="sidebar-navigation-region"] [data-sidebar-navigation-item]',
          ) ?? [],
        ).filter((row) => row.getAttribute("data-sidebar-navigation-item") === `${pluginId}/quota`);
        if (rows.length !== 1) continue;
        const row = rows[0]!;
        if (row.contains(document.activeElement)) button.focus({ preventScroll: true });
        next.add(row);
        if (!suppressed.has(row)) row.setAttribute("data-codex-quota-suppressed", "");
      }
    }
    for (const row of suppressed)
      if (!next.has(row)) row.removeAttribute("data-codex-quota-suppressed");
    suppressed.clear();
    for (const row of next) suppressed.add(row);
  }

  function release(button: HTMLButtonElement, target: Attachment) {
    target.container.remove();
    button.removeAttribute("data-codex-quota-footer");
    const descriptions = (button.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter((id) => id && id !== target.descriptionId);
    if (descriptions.length) button.setAttribute("aria-describedby", descriptions.join(" "));
    else button.removeAttribute("aria-describedby");
    attached.delete(button);
  }
  const publish = () => {
    const next = [...attached.values()];
    if (next.length === targets.length && next.every((target, i) => target === targets[i])) return;
    targets = next;
    for (const listener of listeners) listener();
  };
  function reconcile() {
    if (disposed) return;
    const buttons = new Set<HTMLButtonElement>();
    for (const sidebar of sidebars) {
      if (!sidebar.isConnected || !sidebar.matches(sidebarSelector)) sidebars.delete(sidebar);
    }
    observeContext();
    for (const sidebar of sidebars) {
      const items = Array.from(
        sidebar.querySelectorAll('[data-sidebar="footer"] [data-footer-item]'),
      ).filter((item) => item.getAttribute("data-footer-item") === key);
      if (items.length !== 1) continue;
      const matches = items[0]!.querySelectorAll<HTMLButtonElement>(
        'button[data-sidebar="menu-button"]',
      );
      if (matches.length === 1 && isAvailable(matches[0]!)) buttons.add(matches[0]!);
    }
    for (const [button, target] of attached) {
      if (!buttons.has(button) || target.container.parentElement !== button) {
        release(button, target);
      }
    }
    for (const button of buttons) {
      if (attached.has(button)) continue;
      const container = document.createElement("span");
      container.id = `codex-quota-badge-${++nextId}`;
      const descriptionId = `${container.id}-description`;
      container.setAttribute("data-codex-quota-badge", "");
      button.setAttribute("data-codex-quota-footer", "");
      button.append(container);
      const target: Attachment = {
        container,
        trigger: button,
        descriptionId,
        rendered: false,
        commit: () => {
          target.rendered = true;
          updateNavigation();
          return () => {
            target.rendered = false;
            updateNavigation();
          };
        },
      };
      attached.set(button, target);
    }
    // Radix rewrites this shared attribute on tooltip open/close. Preserve its
    // current references, and write only when our token is missing.
    for (const [button, { descriptionId }] of attached) {
      const descriptions = (button.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter(Boolean);
      if (!descriptions.includes(descriptionId))
        button.setAttribute("aria-describedby", [...descriptions, descriptionId].join(" "));
    }
    publish();
    updateNavigation();
  }
  function schedule() {
    if (disposed || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!disposed) reconcile();
    });
  }
  function owns(node: Node): boolean {
    const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
    return !!element?.closest("[data-codex-quota-badge], [data-codex-quota-style]");
  }
  function relevantSidebarChange(record: MutationRecord): boolean {
    if (owns(record.target)) return false;
    if (record.type === "childList") {
      return (
        [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(
          (node) => !owns(node),
        ) ||
        Array.from(record.removedNodes).some((node) =>
          [...attached.values()].some((target) => node.contains(target.container)),
        )
      );
    }
    // Preserve host tooltip tokens without observing our own idempotent write.
    if (record.attributeName === "aria-describedby") {
      const target = attached.get(record.target as HTMLButtonElement);
      if (
        !target ||
        (record.target as Element)
          .getAttribute("aria-describedby")
          ?.split(/\s+/)
          .includes(target.descriptionId)
      )
        return false;
    }
    return true;
  }
  const sidebarObserver = new MutationObserver((records) => {
    if (records.some(relevantSidebarChange)) schedule();
  });
  const ancestorObserver = new MutationObserver(schedule);
  function observeContext() {
    sidebarObserver.disconnect();
    ancestorObserver.disconnect();
    const ancestors = new Set<Element>();
    for (const sidebar of sidebars) {
      sidebarObserver.observe(sidebar, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          "hidden",
          "inert",
          "style",
          "class",
          "aria-disabled",
          "aria-describedby",
          "disabled",
          "data-sidebar",
          "data-testid",
          "data-footer-item",
          "data-sidebar-navigation-item",
        ],
      });
      for (let node = sidebar.parentElement; node; node = node.parentElement) ancestors.add(node);
    }
    for (const ancestor of ancestors)
      ancestorObserver.observe(ancestor, {
        attributes: true,
        attributeFilter: ["hidden", "inert", "style", "class"],
      });
  }
  // Discovery checks changed subtrees, never rescans the document.
  const lifecycleObserver = new MutationObserver((records) => {
    if (disposed) return;
    let changed = false;
    for (const record of records) {
      if (owns(record.target)) continue;
      if (record.type === "attributes") {
        const element = record.target as Element;
        if (sidebars.has(element)) changed = true;
        if (element.matches(sidebarSelector)) {
          sidebars.add(element);
          changed = true;
        }
        continue;
      }
      for (const node of Array.from(record.removedNodes)) {
        if ([...sidebars].some((sidebar) => node.contains(sidebar))) changed = true;
      }
      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType !== 1 || owns(node)) continue;
        const element = node as Element;
        const found = Array.from(element.querySelectorAll(sidebarSelector));
        if (element.matches(sidebarSelector)) found.push(element);
        for (const sidebar of found) {
          if (!sidebar.isConnected) continue;
          sidebars.add(sidebar);
          changed = true;
        }
      }
    }
    if (changed) schedule();
  });
  lifecycleObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-sidebar"],
  });
  const stylesheetSelector = 'style:not([data-codex-quota-style]), link[rel="stylesheet"]';
  function affectsStylesheet(node: Node): boolean {
    const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
    return (
      !owns(node) &&
      !!element &&
      (element.matches(stylesheetSelector) ||
        !!element.closest(stylesheetSelector) ||
        !!element.querySelector(stylesheetSelector))
    );
  }
  const stylesheetObserver = new MutationObserver((records) => {
    const relevant = records.some((record) => {
      // A link can cease to match after a rel change.
      if (
        record.type === "attributes" &&
        record.attributeName === "rel" &&
        (record.target as Element).tagName === "LINK"
      )
        return true;
      return (
        affectsStylesheet(record.target) ||
        [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(
          affectsStylesheet,
        )
      );
    });
    if (relevant) schedule();
  });
  stylesheetObserver.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });
  const onStylesheetLoad = (event: Event) => {
    if (event.target instanceof Element && event.target.matches(stylesheetSelector)) schedule();
  };
  document.addEventListener("load", onStylesheetLoad, true);
  document.defaultView?.addEventListener("resize", schedule);
  reconcile();
  return {
    getSnapshot: () => targets,
    setNavigationReady: (ready: boolean) => {
      navigationReady = ready;
      updateNavigation();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      lifecycleObserver.disconnect();
      sidebarObserver.disconnect();
      ancestorObserver.disconnect();
      stylesheetObserver.disconnect();
      document.removeEventListener("load", onStylesheetLoad, true);
      document.defaultView?.removeEventListener("resize", schedule);
      sidebars.clear();
      for (const [button, target] of attached) release(button, target);
      updateNavigation();
      style.remove();
      publish();
      listeners.clear();
    },
  };
}
