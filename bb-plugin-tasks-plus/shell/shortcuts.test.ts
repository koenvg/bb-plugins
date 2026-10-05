// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { SHORTCUTS, shortcutMatches, shouldIgnoreKey, type ShortcutScope } from "./shortcuts.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function keyEvent(init: KeyboardEventInit & { target?: EventTarget }): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
  if (init.target) Object.defineProperty(event, "target", { value: init.target });
  return event;
}

describe("shortcut table", () => {
  it.each<ShortcutScope>(["list", "board", "detail"])(
    "has no key used twice across panel and %s",
    (scope) => {
      const keys = SHORTCUTS.filter(
        (shortcut) => shortcut.scope === "panel" || shortcut.scope === scope,
      ).flatMap((shortcut) => shortcut.keys);
      expect(new Set(keys).size).toBe(keys.length);
    },
  );

  it("allows only explicit focus-exclusive property collisions in a split workspace", () => {
    const scopes = SHORTCUTS.filter((shortcut) => shortcut.scope !== "board");
    const collisions = new Map<string, string[]>();
    for (const shortcut of scopes)
      for (const key of shortcut.keys) {
        collisions.set(key, [...(collisions.get(key) ?? []), shortcut.id]);
      }
    expect([...collisions].filter(([, ids]) => ids.length > 1)).toEqual([
      ["s", ["list.status", "detail.status"]],
      ["p", ["list.priority", "detail.priority"]],
      ["l", ["list.labels", "detail.labels"]],
    ]);
  });
  it("has unique ids", () => {
    const ids = SHORTCUTS.map((shortcut) => shortcut.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("shortcutMatches", () => {
  const byId = (id: string) => SHORTCUTS.find((entry) => entry.id === id)!;
  const press = (key: string, extra: { shiftKey?: boolean; repeat?: boolean } = {}) => ({
    key,
    shiftKey: false,
    repeat: false,
    ...extra,
  });

  it("matches any key listed for the shortcut", () => {
    expect(shortcutMatches(byId("list.next"), press("j"))).toBe(true);
    expect(shortcutMatches(byId("list.next"), press("ArrowDown"))).toBe(true);
  });

  it("matches a letter typed with Caps Lock but not with Shift", () => {
    expect(shortcutMatches(byId("list.status"), press("S"))).toBe(true);
    expect(shortcutMatches(byId("list.status"), press("S", { shiftKey: true }))).toBe(false);
  });

  it("matches a held key only for repeatable shortcuts", () => {
    expect(shortcutMatches(byId("list.next"), press("j", { repeat: true }))).toBe(true);
    expect(shortcutMatches(byId("panel.newTask"), press("c", { repeat: true }))).toBe(false);
  });

  it("matches a key that needs Shift to type", () => {
    expect(shortcutMatches(byId("panel.help"), press("?", { shiftKey: true }))).toBe(true);
  });
});

describe("shouldIgnoreKey", () => {
  function setup() {
    const root = document.createElement("div");
    const inside = document.createElement("button");
    root.append(inside);
    const outside = document.createElement("button");
    document.body.append(root, outside);
    return { root, inside, outside };
  }

  it("accepts a bare key inside the panel, on the body, or on window", () => {
    const { root, inside } = setup();
    expect(shouldIgnoreKey(keyEvent({ key: "j", target: inside }), root)).toBe(false);
    expect(shouldIgnoreKey(keyEvent({ key: "j", target: document.body }), root)).toBe(false);
    expect(shouldIgnoreKey(keyEvent({ key: "j", target: window }), root)).toBe(false);
  });

  it("ignores keys aimed at another pane", () => {
    const { root, outside } = setup();
    expect(shouldIgnoreKey(keyEvent({ key: "j", target: outside }), root)).toBe(true);
  });

  it.each(["metaKey", "ctrlKey", "altKey"] as const)("ignores keys with %s held", (modifier) => {
    const { root, inside } = setup();
    expect(shouldIgnoreKey(keyEvent({ key: "c", [modifier]: true, target: inside }), root)).toBe(
      true,
    );
  });

  it("does not treat Shift as a modifier", () => {
    const { root, inside } = setup();
    expect(shouldIgnoreKey(keyEvent({ key: "?", shiftKey: true, target: inside }), root)).toBe(
      false,
    );
  });

  it.each([
    ["input", () => document.createElement("input")],
    ["textarea", () => document.createElement("textarea")],
    ["select", () => document.createElement("select")],
    [
      "contenteditable",
      () => {
        const element = document.createElement("div");
        element.setAttribute("contenteditable", "true");
        return element;
      },
    ],
  ])("ignores keys typed into a %s", (_name, create) => {
    const { root } = setup();
    const field = create();
    root.append(field);
    expect(shouldIgnoreKey(keyEvent({ key: "c", target: field }), root)).toBe(true);
  });

  it.each(["dialog", "menu", "listbox"])("ignores keys while a %s is open", (role) => {
    const { root, inside } = setup();
    const overlay = document.createElement("div");
    overlay.setAttribute("role", role);
    document.body.append(overlay);
    expect(shouldIgnoreKey(keyEvent({ key: "j", target: inside }), root)).toBe(true);
  });

  it("ignores keys another handler already handled", () => {
    const { root, inside } = setup();
    const event = keyEvent({ key: "j", target: inside });
    event.preventDefault();
    expect(shouldIgnoreKey(event, root)).toBe(true);
  });
});
