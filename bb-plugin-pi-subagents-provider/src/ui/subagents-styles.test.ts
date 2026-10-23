import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("publishes normal-chat line height for prose outside conditional styles", () => {
  const css = readFileSync(new URL("./subagents.css", import.meta.url), "utf8");
  const unconditional = css.split(/@(?:media|container|supports)\b/, 1)[0];
  expect(unconditional).toMatch(
    /\.pi-subagents \.pi-subagents-prose\s*\{[^}]*\bline-height:\s*1\.65\s*;/,
  );
});

it("reserves reading height and limits motion to controls with reduced-motion pseudo-elements", () => {
  const css = readFileSync(new URL("./subagents.css", import.meta.url), "utf8");
  const overviewList = css.match(/\.pi-subagents nav ul\s*\{([^}]*)\}/)?.[1];
  expect(overviewList).toBeDefined();
  expect(overviewList).not.toMatch(/max-height|overflow-y/);
  expect(css).toMatch(
    /\.pi-subagents:has\(\.pi-subagents-detail\) nav ul\s*\{[^}]*max-height:\s*8rem;\s*overflow-y:\s*auto/,
  );
  expect(css).toMatch(/\.pi-subagents-detail\s*\{[^}]*flex:\s*1\s+0\s+auto/);
  expect(css).toMatch(/\.pi-subagents\s*\{[^}]*overflow:\s*auto/);
  expect(css).toMatch(/\.pi-subagents-identity\s*\{[^}]*flex-shrink:\s*0/);
  expect(css).toMatch(/\.pi-subagents-transcript\s*\{[^}]*flex:\s*1\s+1\s+0/);
  expect(css).toMatch(/\.pi-subagents-transcript\s*\{[^}]*min-height:\s*200px/);
  expect(css).toMatch(/\.pi-subagents-transcript\s*\{[^}]*contain:\s*size/);
  expect(css).not.toMatch(/(?:^|[;{])\s*height:\s*200px/);
  expect(css).not.toContain("280px");
  expect(css).toMatch(/\.pi-subagents-purpose\s*\{[^}]*-webkit-line-clamp:\s*2/);
  expect(css).toMatch(/\.pi-subagents-row-meta\s*\{[^}]*flex-wrap:\s*wrap/);
  expect(css).not.toContain("white-space: nowrap");
  expect(css).toContain("transition: transform 160ms");
  expect(css).toContain(".pi-subagents *::before");
  const reduced = css.split("@media (prefers-reduced-motion: reduce)")[1]!;
  expect(reduced).toContain(".pi-subagents button,");
  expect(reduced).toContain(".pi-subagents summary::before,");
  expect(reduced).toContain(".pi-subagents nav button::before,");
  expect(css).not.toMatch(/transition:\s*(?:all|height|width)/);
  expect(css).not.toContain("@keyframes");
});

it("uses host color roles for interaction without coloring conversation prose", () => {
  const css = readFileSync(new URL("./subagents.css", import.meta.url), "utf8");
  expect(css).toContain("--pi-subagents-accent: var(--timeline-accent, var(--ring))");
  expect(css).toContain("outline: 2px solid var(--pi-subagents-accent)");
  expect(css).toMatch(
    /\.pi-subagents nav button\[aria-pressed="true"\]\s*\{[^}]*color-mix\(in oklab, var\(--pi-subagents-accent\) 10%, var\(--card\)\)/,
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
