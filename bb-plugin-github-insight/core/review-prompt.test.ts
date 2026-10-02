import { describe, expect, it } from "vitest";
import { buildReviewPrompt } from "./review-prompt";

describe("buildReviewPrompt", () => {
  const prompt = buildReviewPrompt({
    number: 15,
    title: "Add rate limits",
    url: "https://github.com/acme/api/pull/15",
  });

  it("starts with checking out the PR", () => {
    expect(prompt).toContain("`gh pr checkout 15`");
    expect(prompt.indexOf("gh pr checkout")).toBeLessThan(prompt.indexOf("Review the change"));
  });

  it("names the PR URL and title", () => {
    expect(prompt).toContain("https://github.com/acme/api/pull/15");
    expect(prompt).toContain("Add rate limits");
  });

  it("tells the agent not to post to GitHub", () => {
    expect(prompt).toContain("Do not post comments or reviews to GitHub");
  });
});
