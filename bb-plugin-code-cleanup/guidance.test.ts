import { describe, expect, it } from "vitest";
import { defaultGuidance } from "./guidance";

describe("default Code Cleanup guidance", () => {
  it("asks the agent to judge substantial adjacent work and report worthwhile follow-ups", () => {
    const text = defaultGuidance("proj_example");
    expect(text).toMatch(/substantial.*actionable/i);
    expect(text).toMatch(/edited files|adjacent code/i);
    expect(text).toMatch(/stay focused|current task/i);
    expect(text).toMatch(/minor.*style|style.*nit/i);
    expect(text).toMatch(/report.*user/i);
    expect(text).toMatch(/location.*problem.*desired outcome/i);
    expect(text).not.toMatch(/bb task-board|\bopenforge\b|--worktree|--depends-on|--label/i);
    expect(text).not.toMatch(/automatically create|always create/i);
    expect(text.length).toBeLessThanOrEqual(4096);
  });
});
