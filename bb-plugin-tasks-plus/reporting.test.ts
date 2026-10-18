import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { expectReportingRules, expectTaskLinkRules } from "./reporting-test-support";
import { measureContext, wordCount } from "./agent-context-test-support";

const skill = readFileSync(new URL("./skills/tasks/SKILL.md", import.meta.url), "utf8");
const taskRecords = readFileSync(
  new URL("./skills/tasks/references/task-records.md", import.meta.url),
  "utf8",
);
const reporting = readFileSync(
  new URL("./skills/tasks/references/reporting.md", import.meta.url),
  "utf8",
);

describe("task reporting skill", () => {
  it("supplies short outcome guidance without delegation", () => {
    expectReportingRules(skill);
  });

  it("keeps a small intent-specific entry point with operation references", () => {
    const body = skill.replace(/^---\n[\s\S]*?\n---\n/u, "");
    measureContext("skill", body, body);
    expect(wordCount(body)).toBeLessThanOrEqual(250);
    expect(skill).toContain("explicitly assigned");
    expect(body).toMatch(/task reference alone does not assign work/i);
    expect(body).toMatch(/read-only questions.{0,80}only the reads/is);
    expect(body).toMatch(/read only the reference for the requested operation/i);
    expect(body).toContain("Report read failures");
    expect(body).toContain("explicit approval");
    expect(body).toContain("done/canceled");
    expect(body).toMatch(/fetch relevant attachments before relying/i);
    const references = [...body.matchAll(/\]\((references\/[^)]+)\)/g)].map((match) => match[1]);
    expect(references).toEqual([
      "references/property-commands.md",
      "references/task-records.md",
      "references/delegation.md",
      "references/attachments.md",
      "references/webhooks.md",
      "references/reporting.md",
    ]);
    for (const reference of references) {
      expect(existsSync(new URL(`./skills/tasks/${reference}`, import.meta.url)), reference).toBe(
        true,
      );
    }
  });

  it.each([
    ["Tasks skill", skill],
    ["task-record repair reference", taskRecords],
  ])("keeps links unless the user requests removal in %s", (_name, guidance) => {
    expectTaskLinkRules(guidance);
  });

  it("keeps reporting detail on demand without fixed formats or implicit parent duties", () => {
    expect(reporting).toContain("A single sentence is enough");
    expect(reporting).toContain("no word target or required bullet count");
    expect(reporting).toContain("Do not present unrun checks as passed");
    expect(reporting).toContain("If the user requests a parent summary");
    expect(reporting).toContain("child counts or worker reports do not prove parent acceptance");
    expect(reporting).toContain("Reporting alone does not authorize a notification");
    expect(reporting).toContain("linked work thread");
    expect(skill).not.toContain("cat <<'REPORT'");
    expect(skill).not.toContain("parent summary");
  });

  it("offers no task comment command or reporting alias", () => {
    for (const guidance of [skill, taskRecords, reporting]) {
      expect(guidance).not.toMatch(/bb tasks comment|comment --notify|--body-file/);
    }
    expect(reporting).toContain("no task reporting command");
  });
});
