import { z } from "zod";
import { reviewDecisionSchema } from "./blockers";
import type { PullRequestRef } from "./pr-ref";

export const REVIEW_QUEUE_PAGE_SIZE = 50;

const GITHUB_REMOTE =
  /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;

export function parseGithubRepo(remoteUrl: string | null): string | null {
  if (remoteUrl === null) return null;
  const match = GITHUB_REMOTE.exec(remoteUrl.trim());
  if (match === null) return null;
  return `${match[1]}/${match[2]}`.toLowerCase();
}

const rollupStateSchema = z.enum(["SUCCESS", "FAILURE", "ERROR", "PENDING", "EXPECTED"]);

const prNodeSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  isDraft: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  author: z.object({ login: z.string() }).nullable(),
  repository: z.object({ nameWithOwner: z.string() }),
  headRefName: z.string(),
  headRefOid: z.string(),
  reviewDecision: reviewDecisionSchema,
  commits: z.object({
    nodes: z.array(
      z.object({
        commit: z.object({
          statusCheckRollup: z.object({ state: rollupStateSchema }).nullable(),
        }),
      }),
    ),
  }),
});
type PrNode = z.infer<typeof prNodeSchema>;

const searchSchema = z.object({ issueCount: z.number(), nodes: z.array(prNodeSchema) });
type Search = z.infer<typeof searchSchema>;

const reviewQueueResponseSchema = z.object({
  data: z.object({ reviewRequests: searchSchema }).catchall(z.unknown()),
});

const trackedNodeSchema = z.object({ pullRequest: prNodeSchema.nullable() }).nullable().optional();

export const ciStateSchema = z.enum(["passed", "failed", "running", "none"]);
export type CiState = z.infer<typeof ciStateSchema>;

const CI_STATE: Record<z.infer<typeof rollupStateSchema>, CiState> = {
  SUCCESS: "passed",
  FAILURE: "failed",
  ERROR: "failed",
  PENDING: "running",
  EXPECTED: "running",
};

export const queuePrSchema = z.object({
  repo: z.string(),
  number: z.number(),
  title: z.string(),
  author: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  draft: z.boolean(),
  ci: ciStateSchema,
  reviewDecision: reviewDecisionSchema,
  headRefName: z.string(),
  headOid: z.string(),
  url: z.string(),
});
export type QueuePr = z.infer<typeof queuePrSchema>;

export const queueListSchema = z.object({
  groups: z.array(z.object({ repo: z.string(), prs: z.array(queuePrSchema) })),
  truncated: z.boolean(),
});
export type QueueList = z.infer<typeof queueListSchema>;

export function trackedAlias(index: number): string {
  return `t${index}`;
}

export interface FetchedQueue {
  requests: QueueList;
  tracked: QueuePr[];
  gone: PullRequestRef[];
}

export function parseReviewQueue(
  response: unknown,
  trackedRefs: readonly PullRequestRef[],
): FetchedQueue {
  const { data } = reviewQueueResponseSchema.parse(response);
  const tracked: QueuePr[] = [];
  const gone: PullRequestRef[] = [];
  trackedRefs.forEach((ref, index) => {
    const node = trackedNodeSchema.parse(data[trackedAlias(index)])?.pullRequest ?? null;
    if (node?.state === "OPEN") tracked.push(toQueuePr(node));
    else gone.push(ref);
  });
  return { requests: toQueueList(data.reviewRequests), tracked, gone };
}

function toQueuePr(node: PrNode): QueuePr {
  const rollup = node.commits.nodes[0]?.commit.statusCheckRollup ?? null;
  return {
    repo: node.repository.nameWithOwner,
    number: node.number,
    title: node.title,
    author: node.author?.login ?? null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    draft: node.isDraft,
    ci: rollup === null ? "none" : CI_STATE[rollup.state],
    reviewDecision: node.reviewDecision,
    headRefName: node.headRefName,
    headOid: node.headRefOid,
    url: node.url,
  };
}

function toQueueList(search: Search): QueueList {
  const byRepo = new Map<string, QueuePr[]>();
  for (const pr of search.nodes.map(toQueuePr)) {
    byRepo.set(pr.repo, [...(byRepo.get(pr.repo) ?? []), pr]);
  }
  const groups = [...byRepo]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([repo, prs]) => ({
      repo,
      prs: prs.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    }));
  return { groups, truncated: search.issueCount > REVIEW_QUEUE_PAGE_SIZE };
}
