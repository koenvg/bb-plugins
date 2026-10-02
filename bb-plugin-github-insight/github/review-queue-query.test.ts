import { describe, expect, it } from "vitest";
import { reviewQueueArgs } from "./review-queue-query";

describe("reviewQueueArgs", () => {
  it("asks for the review requests in one GraphQL search", () => {
    expect(reviewQueueArgs()).toMatchSnapshot();
  });

  it("takes no input and passes no variables", () => {
    expect(reviewQueueArgs.length).toBe(0);
    const query = reviewQueueArgs().find((arg) => arg.startsWith("query="))!;
    expect(query).not.toContain("$");
    expect(reviewQueueArgs().filter((arg) => arg === "-f" || arg === "-F")).toEqual(["-f"]);
  });
});
