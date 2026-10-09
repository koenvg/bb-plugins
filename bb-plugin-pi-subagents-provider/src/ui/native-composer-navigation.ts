import { type PluginContentScriptRegistration } from "@get-bb/plugin-sdk/app";
import { type ViewRow } from "../subagents-contract.js";

type Context = {
  threadId: string;
  providerId?: string;
  rows: readonly ViewRow[];
  open: (rowId: string | null) => boolean;
};
const contexts = new Set<Context>();
let reconcileMounted: (() => void) | undefined;

/** SDK owners supply observations, never DOM-derived thread or panel parameters. */
export function bindNativeSubagents(context: Context): () => void {
  contexts.add(context);
  reconcileMounted?.();
  return () => {
    contexts.delete(context);
    reconcileMounted?.();
  };
}

function currentContext(): Context | undefined {
  // There is no supported DOM-to-composer identity. Multiple visible owners are ambiguous.
  return contexts.size === 1 ? contexts.values().next().value : undefined;
}
function matchRoot(description: string, rows: readonly ViewRow[]): ViewRow | undefined {
  const roots = rows.filter((row) => row.source === "background" && !row.parentId);
  const matches = roots.filter((row) => description === `${row.label} [${row.runId}]`);
  const row = matches.length === 1 ? matches[0] : undefined;
  return row && roots.filter((other) => other.runId === row.runId).length === 1 ? row : undefined;
}
function descriptionSpans(element: HTMLElement): string[] {
  return Array.from(element.querySelectorAll<HTMLSpanElement>("span[title]"))
    .filter((span) => span.title === span.textContent)
    .map((span) => span.title);
}
function labelMatches(label: string, prefix: string, description: string): boolean {
  const expected = `${prefix}: ${description}`;
  return label === expected || label.startsWith(`${expected} · Model `);
}

/** Private BB 0.45.0 composer shapes, isolated here. No transcript text matching. */
function matchHeader(header: HTMLElement, context: Context): string | null | undefined {
  if (context.providerId !== "pi-subagents") return;
  const card = header.parentElement?.parentElement;
  if (
    !card?.matches('section[aria-label="Background agents"]') ||
    card.firstElementChild !== header.parentElement ||
    header.parentElement?.children.length !== 1
  )
    return;
  const label = header.getAttribute("aria-label") ?? "";
  const headerDescriptions = descriptionSpans(header);
  if (
    header.tagName === "DIV" &&
    card.children.length === 1 &&
    headerDescriptions.length === 1 &&
    labelMatches(label, "Background agent", headerDescriptions[0]!)
  ) {
    return matchRoot(headerDescriptions[0]!, context.rows)?.id;
  }
  if (
    header.tagName !== "BUTTON" ||
    header.id !== "thread-background-commands-card-toggle" ||
    header.getAttribute("type") !== "button" ||
    header.getAttribute("aria-controls") !== "thread-background-commands-card-body" ||
    !["true", "false"].includes(header.getAttribute("aria-expanded") ?? "")
  )
    return;
  const body = card.querySelector<HTMLElement>(
    '#thread-background-commands-card-body[aria-labelledby="thread-background-commands-card-toggle"]',
  );
  if (!body?.matches('section[role="region"]') || card.children.length !== 2) return;
  if (!context.rows.some((row) => row.source === "background" && !row.parentId)) return;
  const bodyDescriptions = descriptionSpans(body);
  if (
    bodyDescriptions.some((description) => !matchRoot(description, context.rows)) ||
    new Set(bodyDescriptions).size !== bodyDescriptions.length
  )
    return;
  const count = /^Running (\d+) background agents?$/.exec(label);
  if (count) {
    if (Number(count[1]) < 1) return;
  } else {
    if (
      headerDescriptions.length !== 1 ||
      !labelMatches(label, "Background agents", headerDescriptions[0]!)
    )
      return;
    if (!matchRoot(headerDescriptions[0]!, context.rows)) return;
    const more = Array.from(header.querySelectorAll("span")).find((span) =>
      /^\+[1-9]\d* more$/.test(span.textContent ?? ""),
    );
    if (!more) return;
  }
  // A collapsed disclosure has no run IDs. Never select a run from its count.
  return null;
}

export const nativeComposerNavigation: PluginContentScriptRegistration = {
  id: "native-subagents-navigation",
  mount({ signal, pluginId, generation }) {
    const marker = `${pluginId}-${generation}`;
    const entries = new Map<
      HTMLElement,
      { context: Context; rowId: string | null; dispose: () => void }
    >();
    let style: HTMLStyleElement | undefined;
    let closed = false;
    const hint = "Open Subagents. Native disclosure still expands or collapses.";
    function decorate(header: HTMLElement, context: Context, rowId: string | null) {
      const owned = new Map<string, { before: string | null; after: string }>();
      function set(name: string, value: string) {
        const previous = owned.get(name);
        if (previous && header.getAttribute(name) !== previous.after) return;
        owned.set(name, {
          before: previous ? previous.before : header.getAttribute(name),
          after: value,
        });
        if (header.getAttribute(name) !== value) header.setAttribute(name, value);
      }
      set("data-pi-subagents-navigation", marker);
      set("aria-description", hint);
      if (header.tagName === "DIV") {
        set("role", "button");
        set("tabindex", "0");
      }
      function activate() {
        if (
          closed ||
          signal.aborted ||
          currentContext() !== context ||
          !header.isConnected ||
          matchHeader(header, context) !== rowId
        ) {
          reconcile();
          return;
        }
        try {
          if (context.open(rowId)) return;
        } catch (error) {
          console.warn("Subagents panel navigation failed.", error);
        }
        console.warn("Could not open Subagents. Use the panel actions.");
        const failure = "Could not open Subagents. Open Subagents from the panel actions.";
        set("title", failure);
        set("aria-description", failure);
      }
      function keydown(event: KeyboardEvent) {
        if (
          header.tagName !== "DIV" ||
          event.target !== header ||
          !["Enter", " "].includes(event.key)
        )
          return;
        event.preventDefault();
        if (!event.repeat) activate();
      }
      header.addEventListener("click", activate);
      header.addEventListener("keydown", keydown);
      return () => {
        header.removeEventListener("click", activate);
        header.removeEventListener("keydown", keydown);
        for (const [name, value] of owned) {
          if (header.getAttribute(name) !== value.after) continue;
          if (value.before === null) header.removeAttribute(name);
          else header.setAttribute(name, value.before);
        }
      };
    }
    function reconcile() {
      if (closed) return;
      const context = currentContext();
      const matches = new Map<HTMLElement, string | null>();
      if (context)
        for (const card of Array.from(
          document.querySelectorAll<HTMLElement>('section[aria-label="Background agents"]'),
        )) {
          const header = card.firstElementChild?.firstElementChild;
          if (!(header instanceof HTMLElement)) continue;
          const rowId = matchHeader(header, context);
          if (rowId !== undefined) matches.set(header, rowId);
        }
      for (const [header, entry] of entries) {
        if (entry.context === context && matches.get(header) === entry.rowId) continue;
        entry.dispose();
        entries.delete(header);
      }
      for (const [header, rowId] of matches) {
        if (!entries.has(header) && context)
          entries.set(header, { context, rowId, dispose: decorate(header, context, rowId) });
      }
      if (entries.size && !style) {
        style = document.createElement("style");
        style.textContent = `[data-pi-subagents-navigation="${marker}"] { cursor: pointer; } [data-pi-subagents-navigation="${marker}"]:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }`;
        document.head.append(style);
      } else if (!entries.size) {
        style?.remove();
        style = undefined;
      }
    }
    const observer = new MutationObserver(reconcile);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "aria-label",
        "aria-controls",
        "id",
        "title",
        "role",
        "type",
        "aria-labelledby",
        "aria-expanded",
      ],
    });
    reconcileMounted = reconcile;
    reconcile();
    function dispose() {
      if (closed) return;
      closed = true;
      observer.disconnect();
      if (reconcileMounted === reconcile) reconcileMounted = undefined;
      for (const entry of entries.values()) entry.dispose();
      entries.clear();
      style?.remove();
      signal.removeEventListener("abort", dispose);
    }
    signal.addEventListener("abort", dispose, { once: true });
    if (signal.aborted) dispose();
    return dispose;
  },
};
