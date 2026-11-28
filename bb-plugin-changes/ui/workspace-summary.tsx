import {
  experimental_useAppPanel,
  experimental_useRpcKeyedQuery,
  experimental_useThreadContextKind,
} from "@get-bb/plugin-sdk/app";
import type {
  ExperimentalThreadContextSegmentInput,
  ExperimentalThreadContextSegmentProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { useId } from "react";
import { z } from "zod";
import { DiffStat } from "../../review-ui/diff-stat";
import { openChanges } from "./changes-navigation";

const stats = z.object({
  fileCount: z.number(),
  insertions: z.number(),
  deletions: z.number(),
  lineStatsComplete: z.boolean(),
  files: z.array(z.object({ path: z.string() })),
});
const workspaceStatus = z.object({
  outcome: z.literal("available"),
  workspace: z.object({
    workingTree: stats.extend({ state: z.string() }),
    mergeBase: stats.extend({ mergeBaseBranch: z.string() }).nullable(),
  }),
});

const git = {
  status: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(z.string(), z.unknown()),
    keyTags: (environmentId: string) => [`status:${environmentId}`],
  },
};

function useWorkspaceChanges(environmentId: string | undefined) {
  const { data } = experimental_useRpcKeyedQuery({
    contract: git,
    pluginId: "bb--git",
    method: "status",
    keys: environmentId === undefined ? [] : [environmentId],
  });
  const result = workspaceStatus.safeParse(
    environmentId === undefined ? undefined : data?.[environmentId],
  );
  if (!result.success) return null;
  const { workingTree, mergeBase } = result.data.workspace;
  if (workingTree.fileCount > 0) {
    return {
      stats: workingTree,
      label: workingTree.state === "untracked" ? "Untracked" : "Uncommitted",
      target: { kind: "uncommitted" } as const,
    };
  }
  if (mergeBase !== null && mergeBase.fileCount > 0) {
    return {
      stats: mergeBase,
      label: "Committed",
      target: {
        kind: "branch_committed",
        mergeBaseBranch: mergeBase.mergeBaseBranch || undefined,
      } as const,
    };
  }
  return null;
}

export function useWorkspaceSummaryVisible({ environment }: ExperimentalThreadContextSegmentInput) {
  const kind = experimental_useThreadContextKind();
  return useWorkspaceChanges(kind === "banner" ? environment?.id : undefined) !== null;
}

const BUTTON =
  "min-h-8 rounded text-xs hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring";
const bodyId = (threadId: string) => `changes-workspace-files-${threadId}`;

export const WorkspaceSummary = ({
  threadId,
  environment,
  isExpanded,
  onToggle,
}: ExperimentalThreadContextSegmentProps) => {
  const changes = useWorkspaceChanges(environment?.id);
  const panel = experimental_useAppPanel();
  if (changes === null) return null;
  const { label, stats, target } = changes;
  const fileCount = `${stats.fileCount} ${stats.fileCount === 1 ? "file" : "files"}`;
  const showLines = stats.lineStatsComplete || stats.insertions !== 0 || stats.deletions !== 0;
  const lineCounts = showLines
    ? `, ${stats.insertions} lines added, ${stats.deletions} lines deleted${stats.lineStatsComplete ? "" : " (known counts)"}`
    : "";
  return (
    <div className="flex min-w-0 items-center">
      <button
        type="button"
        className={`${BUTTON} flex min-w-0 items-center gap-1.5 overflow-hidden px-2 py-1`}
        aria-label={`${label}: ${fileCount}${lineCounts}. Open Changes`}
        title={`${label}: ${fileCount}${lineCounts}`}
        onClick={() => openChanges(panel, threadId, target)}
      >
        <Icon name="FileDiff" aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="shrink-[2] truncate">{label}</span>
        <span
          aria-hidden="true"
          className="flex min-w-0 flex-wrap items-center gap-x-1 tabular-nums"
        >
          <span className="whitespace-nowrap">{fileCount}</span>
          {showLines && <DiffStat additions={stats.insertions} deletions={stats.deletions} />}
        </span>
      </button>
      <button
        type="button"
        className={`${BUTTON} grid min-w-7 shrink-0 place-items-center`}
        aria-label={isExpanded ? "Collapse changed files" : "Expand changed files"}
        aria-expanded={isExpanded}
        aria-controls={bodyId(threadId)}
        onClick={onToggle}
      >
        <Icon
          name="ChevronDown"
          aria-hidden="true"
          className={isExpanded ? "size-3.5 rotate-180" : "size-3.5"}
        />
      </button>
    </div>
  );
};

export const WorkspaceFiles = ({
  threadId,
  environment,
  isExpanded,
}: ExperimentalThreadContextSegmentProps) => {
  const changes = useWorkspaceChanges(isExpanded ? environment?.id : undefined);
  const panel = experimental_useAppPanel();
  const labelId = useId();
  const omitted = changes === null ? 0 : changes.stats.fileCount - changes.stats.files.length;
  return (
    <div id={bodyId(threadId)} hidden={!isExpanded} className="border-t border-border px-2 py-1">
      {changes !== null && (
        <>
          <span className="sr-only" id={labelId}>
            Changed files
          </span>
          <ul aria-labelledby={labelId} className="max-h-32 overflow-y-auto">
            {changes.stats.files.map(({ path }) => (
              <li key={path}>
                <button
                  type="button"
                  title={path}
                  className={`${BUTTON} block w-full truncate px-2 text-left`}
                  onClick={() => openChanges(panel, threadId, changes.target, path)}
                >
                  {path}
                </button>
              </li>
            ))}
          </ul>
          {omitted > 0 && (
            <p className="px-2 text-xs text-muted-foreground">{omitted} more not shown</p>
          )}
        </>
      )}
    </div>
  );
};
