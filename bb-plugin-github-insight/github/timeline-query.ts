import type { TimelinePageRequest } from "../contract";

const TIMELINE_PAGE_SIZE = 100;

const ACTOR = "author { login }";
const EVENT_FIELDS = "id actor { login } createdAt";

const TIMELINE_QUERY = `
query ($owner: String!, $repo: String!, $number: Int!, $before: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      id
      body
      author { login }
      createdAt
      locked
      viewerCanUpdate
      timelineItems(
        last: ${TIMELINE_PAGE_SIZE}
        before: $before
        itemTypes: [
          ISSUE_COMMENT
          PULL_REQUEST_REVIEW
          PULL_REQUEST_COMMIT
          READY_FOR_REVIEW_EVENT
          CLOSED_EVENT
          REOPENED_EVENT
          MERGED_EVENT
        ]
      ) {
        pageInfo { hasPreviousPage startCursor }
        nodes {
          __typename
          ... on IssueComment { id ${ACTOR} body createdAt url }
          ... on PullRequestReview {
            id ${ACTOR} state body submittedAt url
            comments(first: 100) { totalCount nodes { id } }
          }
          ... on PullRequestCommit {
            id
            commit { oid messageHeadline committedDate author { name user { login } } }
          }
          ... on ReadyForReviewEvent { ${EVENT_FIELDS} }
          ... on ClosedEvent { ${EVENT_FIELDS} }
          ... on ReopenedEvent { ${EVENT_FIELDS} }
          ... on MergedEvent { ${EVENT_FIELDS} }
        }
      }
    }
  }
}
`;

export function timelinePageArgs(request: TimelinePageRequest): string[] {
  const args = [
    "api",
    "graphql",
    "-f",
    `query=${TIMELINE_QUERY}`,
    "-f",
    `owner=${request.owner}`,
    "-f",
    `repo=${request.repo}`,
    "-F",
    `number=${request.number}`,
  ];
  if (request.before !== null) args.push("-f", `before=${request.before}`);
  return args;
}
