import { describe, expect, it } from "vitest";
import { reviewQueueArgs } from "./review-queue-query";

describe("reviewQueueArgs", () => {
  it("asks for the review requests in one GraphQL search when nothing is tracked", () => {
    expect(reviewQueueArgs([])).toMatchSnapshot();
  });

  it("asks for each tracked PR by repository and number in the same request", () => {
    expect(
      reviewQueueArgs([
        { owner: "acme", repo: "api", number: 15 },
        { owner: "acme", repo: "web", number: 3 },
      ]),
    ).toMatchSnapshot();
  });

  it("passes the tracked repository names as variables, not inside the query", () => {
    const args = reviewQueueArgs([{ owner: "acme\"", repo: "api", number: 15 }]);
    const query = args.find((arg) => arg.startsWith("query="))!;

    expect(query).not.toContain("acme");
    expect(args).toContain('o0=acme"');
  });
});
