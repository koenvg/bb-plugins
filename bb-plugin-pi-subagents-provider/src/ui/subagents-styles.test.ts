import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("publishes normal-chat line height for prose outside conditional styles", () => {
  const css = readFileSync(new URL("./subagents.css", import.meta.url), "utf8");
  const unconditional = css.split(/@(?:media|container|supports)\b/, 1)[0];
  expect(unconditional).toMatch(
    /\.pi-subagents \.pi-subagents-prose\s*\{[^}]*\bline-height:\s*1\.65\s*;/,
  );
});

it("fills the overview and stretches equal-height tabs without a scrollbar gutter", () => {
  const css = readFileSync(new URL("./subagents.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.pi-subagents\s*\{[^}]*min-height:\s*0/);
  expect(css).toMatch(/\.pi-subagents\s*\{[^}]*overflow:\s*auto/);
  expect(css).toMatch(/\.pi-subagents \.pi-subagents-panels\s*\{[^}]*flex:\s*1\s+0\s+200px/);
  expect(css).toMatch(/\.pi-subagents-tabpanel\s*\{[^}]*min-height:\s*0/);
  expect(css).toMatch(
    /\.pi-subagents-overview nav\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*overflow:\s*auto/,
  );
  expect(css).not.toContain("max-height: 8rem");
  expect(css).toMatch(/\.pi-subagents-tablist\s*\{[^}]*align-items:\s*stretch/);
  expect(css).toMatch(/\.pi-subagents-tab-slot\s*\{[^}]*align-items:\s*stretch/);
  expect(css).toMatch(
    /\.pi-subagents-open-tabs\s*\{[^}]*align-items:\s*stretch;[^}]*overflow-x:\s*auto;[^}]*scrollbar-width:\s*none;[^}]*scrollbar-gutter:\s*auto/,
  );
  expect(css).toMatch(/\.pi-subagents-open-tabs::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  expect(css).toMatch(/\.pi-subagents \[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
  expect(css).toMatch(/\.pi-subagents-identity\s*\{[^}]*flex-shrink:\s*0/);
  expect(css).toMatch(/\.pi-subagents-transcript\s*\{[^}]*flex:\s*1\s+1\s+0/);
  expect(css).toMatch(/\.pi-subagents-transcript\s*\{[^}]*min-height:\s*200px/);
  expect(css).toMatch(/\.pi-subagents-transcript\s*\{[^}]*contain:\s*size/);
  expect(css).not.toMatch(/(?:^|[;{])\s*height:\s*200px/);
  expect(css).toMatch(
    /\.pi-subagents \.pi-subagents-purpose\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap/,
  );
  expect(css).not.toContain("-webkit-line-clamp");
  expect(css).toMatch(/\.pi-subagents\s*\{[^}]*container-type:\s*inline-size/);
  expect(css).toContain("@container (max-width: 480px)");
  expect(css).toMatch(
    /\.pi-subagents \.pi-subagents-row\s*\{[^}]*display:\s*grid;[^}]*min-height:\s*68px/,
  );
  expect(css).not.toMatch(/\.pi-subagents nav button/);
  expect(css).toMatch(/\.pi-subagents-row-meta\s*\{[^}]*flex-wrap:\s*wrap/);
  expect(css).toMatch(/\.pi-subagents-tab-label\s*\{[^}]*white-space:\s*nowrap/);
  const coarse = css.split("@media (pointer: coarse)")[1]!.split("@media")[0]!;
  expect(coarse).toMatch(/\.pi-subagents \[role="tab"\][^{]*\{[^}]*min-height:\s*44px/);
  expect(coarse).toContain("min-width: 44px");
  const reduced = css.split("@media (prefers-reduced-motion: reduce)")[1]!;
  expect(reduced).toContain(".pi-subagents button,");
  expect(reduced).toContain(".pi-subagents summary::before,");
  expect(reduced).toContain(".pi-subagents *::before");
  expect(reduced).toContain("transition: none");
  expect(css).not.toMatch(/transition:\s*(?:all|height|width)/);
  expect(css).not.toContain("@keyframes");
});

it("uses host color roles for interaction without coloring conversation prose", () => {
  const css = readFileSync(new URL("./subagents.css", import.meta.url), "utf8");
  expect(css).toContain("--pi-subagents-accent: var(--timeline-accent, var(--ring))");
  expect(css).toContain("outline: 2px solid var(--pi-subagents-accent)");
  expect(css).toMatch(
    /\.pi-subagents-tab-slot\[data-selected="true"\]\s*\{[^}]*color-mix\(in oklab, var\(--pi-subagents-accent\) 10%, var\(--card\)\)/,
  );
  expect(css).toMatch(
    /\.pi-subagents-conversation-heading button:not\(:disabled\)\s*\{[^}]*color: var\(--pi-subagents-accent-ink\)/,
  );
  expect(css).not.toMatch(/\.pi-subagents-prose\s*\{[^}]*color:/);
});

it("colors only known execution states and retains semantic token fallbacks", () => {
  const css = readFileSync(new URL("./subagents.css", import.meta.url), "utf8");
  expect(css).toMatch(
    /\.pi-subagents-state\[data-state="complete"\]\s*\{[^}]*var\(--success, var\(--foreground\)\)/,
  );
  expect(css).toMatch(
    /\.pi-subagents-state\[data-state="queued"\],[\s\S]*?\.pi-subagents-state\[data-state="running"\],[\s\S]*?\.pi-subagents-state\[data-state="paused"\]\s*\{[^}]*var\(--attention, var\(--muted-foreground\)\)/,
  );
  expect(css).toMatch(
    /\.pi-subagents-state\[data-state="partial"\]\s*\{[^}]*var\(--warning-text, var\(--muted-foreground\)\)/,
  );
  for (const state of ["unknown", "detached", "stopped"]) {
    expect(css).not.toContain(`.pi-subagents-state[data-state="${state}"]`);
  }
});
