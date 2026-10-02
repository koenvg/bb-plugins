import { REVIEW_QUEUE_PAGE_SIZE } from "../core/review-queue";

const PR_FIELDS = `
  issueCount
  nodes {
    ... on PullRequest {
      number
      title
      url
      isDraft
      createdAt
      updatedAt
      author { login }
      repository { nameWithOwner }
      headRefName
      reviewDecision
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    }
  }
`;

const REVIEW_QUEUE_QUERY = `
query {
  reviewRequests: search(type: ISSUE, first: ${REVIEW_QUEUE_PAGE_SIZE}, query: "is:pr is:open review-requested:@me") {${PR_FIELDS}}
  myPrs: search(type: ISSUE, first: ${REVIEW_QUEUE_PAGE_SIZE}, query: "is:pr is:open author:@me") {${PR_FIELDS}}
}
`;

export function reviewQueueArgs(): string[] {
  return ["api", "graphql", "-f", `query=${REVIEW_QUEUE_QUERY}`];
}
