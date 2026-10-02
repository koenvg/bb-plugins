import type { PrFilesRequest } from "../contract";

const PR_HEAD_QUERY = `
query ($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) { id headRefOid state viewerDidAuthor }
  }
}
`;

export function prHeadArgs({ owner, repo, number }: PrFilesRequest): string[] {
  return [
    "api",
    "graphql",
    "-f",
    `query=${PR_HEAD_QUERY}`,
    "-f",
    `owner=${owner}`,
    "-f",
    `repo=${repo}`,
    "-F",
    `number=${number}`,
  ];
}
