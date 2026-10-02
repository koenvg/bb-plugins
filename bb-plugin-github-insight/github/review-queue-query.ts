import type { PullRequestRef } from "../core/pr-ref";
import { REVIEW_QUEUE_PAGE_SIZE, trackedAlias } from "../core/review-queue";

const PR_FRAGMENT = `
fragment QueuePr on PullRequest {
  number
  title
  url
  state
  isDraft
  createdAt
  updatedAt
  author { login }
  repository { nameWithOwner }
  headRefName
  headRefOid
  reviewDecision
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
}
`;

function variableDefinitions(tracked: readonly PullRequestRef[]): string {
  if (tracked.length === 0) return "";
  const definitions = tracked.map((_, i) => `$o${i}: String!, $r${i}: String!, $n${i}: Int!`);
  return `(${definitions.join(", ")})`;
}

function trackedFields(tracked: readonly PullRequestRef[]): string {
  return tracked
    .map(
      (_, i) =>
        `  ${trackedAlias(i)}: repository(owner: $o${i}, name: $r${i}) { pullRequest(number: $n${i}) { ...QueuePr } }\n`,
    )
    .join("");
}

function variableArgs(tracked: readonly PullRequestRef[]): string[] {
  return tracked.flatMap(({ owner, repo, number }, i) => [
    "-f",
    `o${i}=${owner}`,
    "-f",
    `r${i}=${repo}`,
    "-F",
    `n${i}=${number}`,
  ]);
}

export function reviewQueueArgs(tracked: readonly PullRequestRef[]): string[] {
  const query = `
query${variableDefinitions(tracked)} {
  reviewRequests: search(type: ISSUE, first: ${REVIEW_QUEUE_PAGE_SIZE}, query: "is:pr is:open review-requested:@me") {
    issueCount
    nodes { ...QueuePr }
  }
${trackedFields(tracked)}}
${PR_FRAGMENT}`;
  return ["api", "graphql", "-f", `query=${query}`, ...variableArgs(tracked)];
}
