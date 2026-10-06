import { expect } from "vitest";

// Check emitted instructions, not model compliance or a fixed prose template.
export function expectReportingRules(text: string): void {
  const guidance = text.replace(/\s+/g, " ");
  expect(guidance).toMatch(/comment only for/i);
  for (const outcome of [
    "review readiness",
    "completion",
    "failure",
    "blockers",
    "user decisions",
  ]) {
    expect(guidance, outcome).toContain(outcome);
  }
  expect(guidance).toMatch(/result/i);
  expect(guidance).toContain("relevant checks");
  expect(guidance).toContain("material limits");
  expect(guidance).toContain("unrun/blocked checks");
  expect(guidance).toContain("explicit approval");
  expect(guidance).toContain("done/canceled");
  expect(guidance).toContain("evidence link");
  expect(guidance).toContain("reported/verified checks");
  expect(guidance).toMatch(/in_review.{0,40}review remains.{0,50}done only after all gates/i);
  expect(guidance).not.toMatch(
    /meaningful milestones|40-80 words|up to three|parent refresh|tasks_report/i,
  );
}

export function expectTaskLinkRules(text: string): void {
  const guidance = text.replace(/\s+/g, " ");
  expect(guidance, "retain links through work changes").toMatch(
    /keep task-to-thread links (?:through all work changes|when work completes, enters review, is handed off, is replaced, fails, or moves to other work)/i,
  );
  expect(guidance, "explicit user removal request").toMatch(
    /detach only (?:on explicit user request|when the user explicitly requests removal of (?:that|the) task-to-thread link)/i,
  );
  expect(guidance, "manual detach has no execution or status effect").toMatch(
    /detaching does not stop the thread or change (?:the task )?status/i,
  );
  expect(guidance, "retained links grant no new authority").toMatch(
    /links grant no (?:new )?ownership or reporting authority/i,
  );
  expect(guidance).not.toMatch(
    /work ends or is handed off, detach|detach a predecessor after handoff/i,
  );
}
