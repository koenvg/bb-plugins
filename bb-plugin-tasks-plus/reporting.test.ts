import { execFileSync } from "node:child_process";
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
      "references/task-records.md",
      "references/delegation.md",
      "references/attachments.md",
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
    expect(reporting).toContain("task-records.md#notify-the-latest-responder");
    expect(skill).not.toContain("cat <<'REPORT'");
    expect(skill).not.toContain("parent summary");
  });

  it("posts the documented multiline body without shell expansion", () => {
    const example = [...reporting.matchAll(/^```sh\n([\s\S]*?)\n```/gm)]
      .map((match) => match[1])
      .find((body) => body.startsWith("bb tasks comment ABC-12 --body"));
    expect(example, "multiline posting example").toBeDefined();
    // Replace only the external CLI boundary. No BB records are touched.
    const output = execFileSync(
      "bash",
      ["--noprofile", "--norc", "-c", `bb() { printf '%s\\0' "$@"; }\n${example}`],
      { encoding: "utf8" },
    );
    expect(output.split("\0")).toEqual([
      "tasks",
      "comment",
      "ABC-12",
      "--body",
      "**The change is ready for review.**\n\n" +
        "- Focused checks pass for `parse()` and literal `$(name)` input.\n" +
        "- Next: complete the required review.\n" +
        "- [Evidence](bbthread://thr_abc123).",
      "",
    ]);
  });
});
