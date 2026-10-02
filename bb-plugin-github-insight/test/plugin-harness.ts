import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { GhFailure } from "../github/gh-failure";
import plugin from "../server";

export type PullRequestResult = Awaited<
  ReturnType<BbPluginApi["sdk"]["environments"]["pullRequest"]>
>;
type AvailablePullRequest = Extract<PullRequestResult, { outcome: "available" }>;
type Environment = Awaited<
  ReturnType<BbPluginApi["sdk"]["environments"]["get"]>
>;
type ThreadListItem = Awaited<
  ReturnType<BbPluginApi["sdk"]["threads"]["list"]>
>[number];
type ProjectListItem = Awaited<
  ReturnType<BbPluginApi["sdk"]["projects"]["list"]>
>[number];
type SystemConfig = Awaited<ReturnType<BbPluginApi["sdk"]["system"]["config"]>>;
type ThreadOptions = { id: string; environmentId: string | null } & Parameters<
  typeof makeThreadResponse
>[0];
export interface HostCall {
  method: string;
  input: unknown;
}

export function linkedPr(
  number: number,
  state: AvailablePullRequest["pullRequest"]["state"] = "open",
): AvailablePullRequest {
  return {
    outcome: "available",
    pullRequest: {
      attention: "checks_failed",
      baseRefName: "main",
      checks: {
        failedCount: 1,
        passedCount: 98,
        pendingCount: 0,
        state: "failing",
        totalCount: 108,
      },
      headRefName: "feature",
      mergeability: {
        mergeStateStatus: "BLOCKED",
        mergeable: "MERGEABLE",
        state: "blocked",
      },
      number,
      review: { reviewRequestCount: 1, state: "review_required" },
      state,
      title: "feat(*): add ootbDomainTypesIds constants",
      updatedAt: "2026-09-24T10:00:00Z",
      url: `https://github.com/collibra/frontend/pull/${number}`,
    },
  };
}

export function ok(data: unknown) {
  return { ok: true as const, data };
}

export function failed(failure: GhFailure) {
  return { ok: false as const, failure };
}

export async function setup(options: {
  threads: ThreadOptions[];
  pullRequests?: Record<string, PullRequestResult>;
  host?: (call: HostCall) => unknown;
  projects?: Pick<ProjectListItem, "id" | "kind" | "gitRemoteUrl" | "updatedAt">[];
  primaryHostId?: string | null;
  spawn?: BbPluginApi["sdk"]["threads"]["spawn"];
}) {
  const threadResponse = (id: string) => {
    const thread = options.threads.find((candidate) => candidate.id === id)!;
    return makeThreadResponse(thread);
  };
  const { bb, harness } = createFakePluginHost({
    pluginId: "github-insight",
    sdk: {
      threads: {
        get: async ({ threadId }) => threadResponse(threadId),
        list: async () =>
          options.threads.map(
            ({ id }) => threadResponse(id) as unknown as ThreadListItem,
          ),
        spawn: options.spawn ?? (async () => makeThreadResponse({ id: "thr_spawned" })),
        updatePluginMetadata: async () => ({}),
        send: async () => ({ ok: true as const, delivery: "sent" as const }),
      },
      environments: {
        pullRequest: async ({ environmentId }) =>
          options.pullRequests?.[environmentId] ?? { outcome: "absent" as const },
        get: async () => ({ hostId: "host-1" }) as Environment,
      },
      projects: {
        list: async () => (options.projects ?? []) as ProjectListItem[],
      },
      system: {
        config: async () =>
          ({ primaryHostId: options.primaryHostId === undefined ? "host-1" : options.primaryHostId }) as SystemConfig,
      },
    },
    experimental_callHostRpc: (call) => {
      if (options.host === undefined) throw new Error("unexpected call");
      return options.host(call);
    },
  });
  await plugin(bb);
  return harness;
}
