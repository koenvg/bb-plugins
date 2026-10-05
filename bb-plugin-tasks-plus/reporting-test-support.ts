import { expect } from "vitest";

// The instructions are the public output under test, not model compliance.
// Keep these checks focused on the contract rather than the complete wording.
const reportingRules: Record<string, RegExp> = {
  "short lead": /one short (?:result or current-state|result or state) sentence/i,
  "flat Markdown bullets": /blank line.{0,40}up to three.{0,20}Markdown bullets/is,
  "word target": /40-80 words/i,
  "shorter updates": /shorter updates (?:are |remain )?(?:fine|valid)/i,
  "visible limits": /material (?:risks and )?limits.{0,100}(?:longer|length|target)/is,
  "evidence outside the summary": /(?:logs|full commit hashes).{0,180}(?:thread|artifact)/is,
  "detail reference": /(?:link|reference).{0,40}(?:detail|evidence)/is,
  "milestone cadence": /meaningful milestones/i,
  "no repeated pings": /omit unchanged updates/i,
  "epic summary": /epic.{0,60}overall progress/i,
  "subtask result": /subtask.{0,60}(?:own result|its result)/i,
  "parent responsibility": /only the agent.{0,50}responsible for (?:the |a )?parent/is,
  "fresh parent state": /read current (?:parent and child|task) state/i,
  "uncertain state": /(?:unavailable|conflicting).{0,60}(?:unknown|uncertain)/is,
  "acceptance is separate":
    /(?:child|subtask).{0,50}(?:count|done).{0,70}(?:acceptance|epic completion)/is,
};

export function expectReportingRules(text: string): void {
  for (const [rule, pattern] of Object.entries(reportingRules)) {
    expect(text.replace(/\s+/g, " "), rule).toMatch(pattern);
  }
}

export function expectTaskLinkRules(text: string): void {
  const guidance = text.replace(/\s+/g, " ");
  expect(guidance, "retain links through work changes").toMatch(
    /keep task-to-thread links.{0,180}complet.{0,80}review.{0,80}hand.{0,80}replac.{0,80}fail.{0,80}other work/i,
  );
  expect(guidance, "explicit user removal request").toMatch(
    /detach only when the user explicitly requests removal of (?:that|the) task-to-thread link/i,
  );
  expect(guidance, "manual detach has no execution or status effect").toMatch(
    /detaching does not stop the thread or change the task status/i,
  );
  expect(guidance, "retained links grant no new authority").toMatch(
    /retained links.{0,80}no.{0,80}ownership.{0,80}report.{0,40}authority/i,
  );
  expect(guidance).not.toMatch(
    /work ends or is handed off, detach|detach a predecessor after handoff/i,
  );
}
