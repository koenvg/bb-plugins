import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { expectReportingRules, expectTaskLinkRules } from "./reporting-test-support";

const skill = readFileSync(new URL("./skills/tasks/SKILL.md", import.meta.url), "utf8");
const taskRecords = readFileSync(
  new URL("./skills/tasks/references/task-records.md", import.meta.url),
  "utf8",
);

describe("task reporting skill", () => {
  it("supplies concise milestone and parent-summary guidance without delegation", () => {
    expectReportingRules(skill);
  });

  it.each([
    ["Tasks skill", skill],
    ["task-record repair reference", taskRecords],
  ])("keeps links unless the user requests removal in %s", (_name, guidance) => {
    expectTaskLinkRules(guidance);
  });

  it("posts the documented multiline body without shell expansion", () => {
    const example = [...skill.matchAll(/^```sh\n([\s\S]*?)\n```/gm)]
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
