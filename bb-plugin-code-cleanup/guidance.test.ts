import { describe, expect, it } from "vitest";
import { defaultGuidance } from "./guidance";

describe("default Code Cleanup guidance", () => {
  it("records substantial adjacent follow-ups through a single linked BB tracker", () => {
    const text = defaultGuidance("proj_example");
    expect(text).toMatch(/substantial.*actionable/i);
    expect(text).toMatch(/files you edit.*adjacent code/i);
    expect(text).toMatch(/minor.*style|style.*nit/i);
    expect(text).toContain("bb tasks");
    expect(text).toContain("project list");
    expect(text).toContain("linkedBbProjectId");
    expect(text).toContain("proj_example");
    expect(text).toMatch(/single.*tracker/i);
    expect(text).toMatch(/prefix or.*ID/i);
    expect(text).toContain("never a proj_");
    for (const status of ["backlog", "todo", "in_progress", "in_review"]) expect(text).toContain(status);
    expect(text).toContain("nextCursor");
    expect(text).toMatch(/every.*page/i);
    expect(text).toMatch(/same filters/i);
    expect(text).toMatch(/inspect.*reuse/i);
    expect(text).toContain("create");
    expect(text).toMatch(/title.*description/i);
    for (const field of ["location", "evidence", "problem", "desired outcome", "completion criteria", "source task", "bbthread://"]) expect(text).toContain(field);
    expect(text).toContain("label list");
    expect(text).toMatch(/existing labels/i);
    expect(text).toMatch(/required blockers.*verified.*keys/i);
    expect(text).toMatch(/unavailable/i);
    expect(text).toMatch(/missing.*ambiguous/i);
    expect(text).toMatch(/candidate.*error|candidate.*limit/i);
    expect(text).toMatch(/confirmed.*key/i);
    expect(text).toMatch(/failed.*dependency.*incomplete/i);
    expect(text).toMatch(/no.*unrelated cleanup.*dispatch.*notification.*status/i);
    expect(text).not.toMatch(/bb task-board|\bopenforge\b|--\w/);
  });

  it("is concise and below the instruction limit for real project IDs", () => {
    for (const id of ["proj_example", "proj_gjz4e6jtmg", `proj_${"x".repeat(64)}`]) {
      expect(defaultGuidance(id).length).toBeLessThanOrEqual(4096);
      expect(defaultGuidance(id).length).toBeLessThan(1450);
    }
  });
});
