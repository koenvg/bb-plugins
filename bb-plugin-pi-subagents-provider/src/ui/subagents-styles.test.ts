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
  expect(css).toMatch(/\.pi-subagents nav ul\s*\{[^}]*max-height:\s*8rem/);
  expect(css).toMatch(/\.pi-subagents-detail\s*\{[^}]*min-height:\s*0/);
  expect(css).toContain("transition: transform 160ms");
  expect(css).toContain(".pi-subagents *::before");
  const reduced = css.split("@media (prefers-reduced-motion: reduce)")[1]!;
  expect(reduced).toContain(".pi-subagents button,");
  expect(reduced).toContain(".pi-subagents summary::before,");
  expect(reduced).toContain(".pi-subagents nav button::before,");
  expect(css).not.toMatch(/transition:\s*(?:all|height|width)/);
  expect(css).not.toContain("@keyframes");
});
