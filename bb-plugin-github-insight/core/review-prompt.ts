import type { QueuePr } from "./review-queue";

export function buildReviewPrompt(pr: Pick<QueuePr, "number" | "title" | "url">): string {
  return [
    `Review pull request #${pr.number}: ${pr.title}`,
    pr.url,
    "## Steps",
    [
      `1. Run \`gh pr checkout ${pr.number}\`.`,
      "2. Read the PR description and the diff against its base branch.",
      "3. Review the change for correctness, design, tests, and readability.",
      "4. Report your findings here, most severe first, each with its file and line.",
    ].join("\n"),
    "## Rules",
    "- Do not post comments or reviews to GitHub. The user reads your findings and posts them.",
  ].join("\n\n") + "\n";
}
