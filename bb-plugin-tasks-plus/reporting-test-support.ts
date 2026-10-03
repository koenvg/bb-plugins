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
  "acceptance is separate": /(?:child|subtask).{0,50}(?:count|done).{0,70}(?:acceptance|epic completion)/is,
};

export function expectReportingRules(text: string): void {
  for (const [rule, pattern] of Object.entries(reportingRules)) {
    expect(text.replace(/\s+/g, " "), rule).toMatch(pattern);
  }
}
