export type FooterTarget = {
  container: HTMLSpanElement;
  descriptionId: string;
  commit(): () => void;
};
type Attachment = FooterTarget & { rendered: boolean };
let nextId = 0;

const styles = `
[data-codex-quota-footer] { width: max-content !important; padding-inline: .5rem !important; gap: .35rem; flex-shrink: 0; }
/* Portal events follow React ancestry, not the native button's tree. Keep its hit target. */
[data-codex-quota-badge] { display: inline-flex; flex-shrink: 0; overflow: visible !important; pointer-events: none; }
[data-codex-quota-badge] > span[title] { width: auto; min-width: 4ch; text-align: left; }
[data-codex-quota-suppressed] { display: none !important; }
`;

function isAvailable(button: HTMLButtonElement): boolean {
  if (!button.isConnected || button.disabled || button.getAttribute("aria-disabled") === "true")
    return false;
  for (let node: HTMLElement | null = button; node; node = node.parentElement) {
    // Modal menus set aria-hidden on the background without removing the footer.
    // Keep its attachment and navigation suppression until it is actually hidden.
    if (node.hidden || node.inert) return false;
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
    for (const sidebar of Array.from(document.querySelectorAll('[data-sidebar="sidebar"]'))) {
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
  const observer = new MutationObserver((records) => {
    if (
      queued ||
      records.every((record) => (record.target as Element).closest?.("[data-codex-quota-badge]"))
    )
      return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      reconcile();
    });
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "hidden",
      "inert",
      "style",
      "class",
      "aria-hidden",
      "aria-disabled",
      "aria-describedby",
      "disabled",
      "data-footer-item",
      "data-sidebar-navigation-item",
    ],
  });
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
      observer.disconnect();
      for (const [button, target] of attached) release(button, target);
      updateNavigation();
      style.remove();
      publish();
      listeners.clear();
    },
  };
}
