import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postcss from "postcss";

const css = readFileSync(new URL("./motion.css", import.meta.url), "utf8");
const root = postcss.parse(css);

describe("Native working-state lattice", () => {
  it("scopes effects to inline activity titles, not the composer status or other shimmers", () => {
    root.walkRules((rule) => {
      expect(rule.selector).toMatch(/^:root\[data-compose-chat/);
      if (rule.selector.includes("animate-shine")) {
        expect(rule.selector).toMatch(/\[data-timeline-row-list\]\s+\[data-timeline-row-id\]/);
        expect(rule.selector).toMatch(/\.leading-5\s*>\s*\.animate-shine/);
        expect(rule.selector).not.toContain("~ div");
      }
    });
    expect(css).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  });

  it("removes BB's animated image mask and releases its compositor hint", () => {
    const labelRule = root.nodes.find(
      (node) => node.type === "rule" && node.selector.endsWith("> .animate-shine"),
    );
    expect(labelRule?.type).toBe("rule");
    if (labelRule?.type !== "rule") return;
    const declarations = new Map(
      labelRule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]),
    );
    expect(declarations.get("mask-image")).toBe("none");
    expect(declarations.get("-webkit-mask-image")).toBe("none");
    expect(declarations.get("will-change")).toBe("auto");
    expect(declarations.get("animation")).toBe("none");
  });

  it("paints the top-left dot with its own fill", () => {
    const dotRule = root.nodes.find(
      (node) => node.type === "rule" && node.selector.endsWith(".animate-shine::before"),
    );
    expect(dotRule?.type).toBe("rule");
    if (dotRule?.type !== "rule") return;
    expect(
      dotRule.nodes.some(
        (node) =>
          node.type === "decl" &&
          node.prop === "background-color" &&
          node.value === "var(--compose-lattice-idle)",
      ),
    ).toBe(true);
  });

  it("replaces the native activity glyph rather than adding a second icon column", () => {
    const iconRule = root.nodes.find(
      (node) =>
        node.type === "rule" &&
        node.selector
          .replace(/\s+/g, " ")
          .endsWith("span:has(> .leading-5 > .animate-shine) > [data-icon-root]"),
    );
    expect(iconRule?.type).toBe("rule");
    if (iconRule?.type !== "rule") return;
    expect(
      iconRule.nodes.some(
        (node) => node.type === "decl" && node.prop === "display" && node.value === "none",
      ),
    ).toBe(true);
  });
  it("keeps nine static dots without replacing native labels", () => {
    const dotRule = root.nodes.find(
      (node) => node.type === "rule" && node.selector.endsWith(".animate-shine::before"),
    );
    expect(dotRule?.type).toBe("rule");
    if (dotRule?.type !== "rule") return;
    const declarations = new Map(
      dotRule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]),
    );
    expect(declarations.get("content")).toBe('""');
    expect(declarations.get("inline-size")).toBe("4px");
    expect(declarations.get("block-size")).toBe("4px");
    expect(declarations.get("margin-inline-end")).toBe("calc(var(--compose-activity-inset) - 4px)");
    expect(declarations.get("margin-block-end")).toBe("12px");
    expect(declarations.get("border-radius")).toBe("50%");
    expect(declarations.get("animation") ?? "none").toBe("none");
    expect(
      declarations
        .get("box-shadow")
        ?.split(",")
        .map((value) => value.trim()),
    ).toEqual([
      "0 0 var(--compose-lattice-idle)",
      "6px 0 var(--compose-lattice-idle)",
      "12px 0 var(--compose-lattice-idle)",
      "12px 6px var(--compose-lattice-idle)",
      "12px 12px var(--compose-lattice-idle)",
      "6px 12px var(--compose-lattice-idle)",
      "0 12px var(--compose-lattice-idle)",
      "0 6px var(--compose-lattice-idle)",
      "6px 6px var(--compose-lattice-idle)",
    ]);
    root.walkDecls(/^animation(?:-|$)/, (decl) => {
      expect(decl.prop).toBe("animation");
      expect(decl.value).toBe("none");
    });
    expect(css).not.toMatch(/@keyframes|data-compose-chat-motion/);
    expect(css).not.toMatch(/content:\s*["'](?:Working|Thinking)/);
  });

  it("preserves the reduced-motion dot contrast override", () => {
    const reduced = root.nodes.find(
      (node) => node.type === "atrule" && node.params === "(prefers-reduced-motion: reduce)",
    );
    expect(reduced?.type).toBe("atrule");
    if (reduced?.type === "atrule") {
      const values: string[] = [];
      reduced.walkDecls("--compose-lattice-idle", (decl) => {
        values.push(decl.value);
      });
      expect(values).toEqual(["color-mix(in oklab, currentColor 55%, transparent)"]);
    }
  });
});
