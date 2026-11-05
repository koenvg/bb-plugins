import { useState, type ReactNode } from "react";
import { useBbNavigate, useSdk } from "@get-bb/plugin-sdk/app";
import { isOpenRef } from "../dependencies.js";
import type { Task, TaskDependencyRef } from "../../shared/contract.js";
import { errorMessage } from "../../shared/errors.js";
import { listAllTasks, useTasksQuery, useTasksRpc } from "../../shell/data.js";
import { useTasksNavigation } from "../../shell/routes.js";
import { STATUS_LABELS } from "../list/lib.js";
import { StatusIcon } from "./meta.js";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Side = "blockedBy" | "blocks";

type CandidateCatalog = {
  isLoading: boolean;
  error: string | null;
  request: () => void;
  retry: () => void;
};

const SIDE_TITLES: Record<Side, string> = {
  blockedBy: "Blocked by",
  blocks: "Blocks",
};

const ADD_LABELS: Record<Side, string> = {
  blockedBy: "Add blocker",
  blocks: "Add blocked task",
};

type CreatorMetadata =
  | { kind: "absent" }
  | { kind: "loading"; threadId: string }
  | { kind: "unavailable"; threadId: string }
  | {
      kind: "available";
      threadId: string;
      title: string | null;
      lifecycle: "not-archived" | "archived" | "deleted";
    };

function useCreatorThreadMetadata(threadId: Task["createdByThreadId"]): CreatorMetadata {
  const sdk = useSdk();
  const query = useTasksQuery<CreatorMetadata>(
    async () => {
      if (!threadId) return { kind: "absent" };
      const thread = await sdk.threads.get({ threadId });
      if (!thread || thread.id !== threadId) return { kind: "unavailable", threadId };
      return {
        kind: "available",
        threadId,
        title: [thread.title, thread.titleFallback].find((title) => title?.trim()) ?? null,
        lifecycle: thread.deletedAt ? "deleted" : thread.archivedAt ? "archived" : "not-archived",
      };
    },
    ["tasks:changed", "threads:changed"],
    [threadId],
  );
  if (!threadId) return { kind: "absent" };
  if (query.isLoading) return { kind: "loading", threadId };
  if (query.error || query.data?.kind !== "available" || query.data.threadId !== threadId) {
    return { kind: "unavailable", threadId };
  }
  return query.data;
}

function CreatorThreadRelation({
  threadId,
  blocked,
  metadata,
}: {
  threadId: string;
  blocked: boolean;
  metadata: CreatorMetadata;
}) {
  const navigate = useBbNavigate();
  const title = metadata.kind === "available" ? metadata.title : null;
  const lifecycle = metadata.kind === "available" ? metadata.lifecycle : null;
  const state =
    metadata.kind === "loading"
      ? "Loading thread details"
      : lifecycle === "not-archived"
        ? "Not archived"
        : lifecycle === "archived"
          ? "Archived"
          : lifecycle === "deleted"
            ? "Deleted"
            : "Unavailable. Archive state unknown.";
  return (
    <button
      type="button"
      aria-label={`Open creator thread ${threadId}${title ? `: ${title}` : ""}`}
      className="flex w-full min-w-0 items-start gap-2 rounded-sm border-b border-border-hairline px-0.5 py-3 text-left text-sm hover:bg-state-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => navigate.toThread(threadId)}
    >
      <Icon name="MessageSquare" className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium">Thread</span>
          <span className="break-all">{threadId}</span>
        </span>
        <span className="mt-1 block min-h-5 break-words font-medium [overflow-wrap:anywhere]">
          {title}
        </span>
        <span className="mt-1 block min-h-4 text-xs text-muted-foreground">{state}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {blocked
            ? lifecycle === "archived" || lifecycle === "deleted"
              ? "Task still reports this creator as blocking."
              : "Waiting for the creator thread to be archived."
            : "Not an open blocker"}
        </span>
      </span>
      <Icon name="ArrowUpRight" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}
function TaskPicker({
  side,
  candidates,
  catalog,
  onPick,
}: {
  side: Side;
  candidates: readonly Task[];
  catalog: CandidateCatalog;
  onPick: (task: Task) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) catalog.request();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Icon name="Plus" className="size-3" />
          {ADD_LABELS[side]}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Find a task…" />
          <CommandList aria-busy={catalog.isLoading}>
            {catalog.isLoading ? (
              <p role="status" className="p-4 text-sm text-muted-foreground">
                Loading tasks…
              </p>
            ) : catalog.error !== null ? (
              <div className="space-y-2 p-4 text-sm">
                <p role="alert" className="text-destructive">
                  Could not load tasks: {catalog.error}
                </p>
                <button type="button" className="underline" onClick={catalog.retry}>
                  Retry
                </button>
              </div>
            ) : (
              <>
                <CommandEmpty>No tasks.</CommandEmpty>
                <CommandGroup>
                  {candidates.map((candidate) => (
                    <CommandItem
                      key={candidate.id}
                      value={`${candidate.key} ${candidate.title}`}
                      onSelect={() => {
                        setOpen(false);
                        onPick(candidate);
                      }}
                    >
                      <StatusIcon status={candidate.status} className="size-3" />
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {candidate.key}
                      </span>
                      <span className="min-w-0 truncate">{candidate.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DependencyList({
  side,
  refs,
  candidates,
  catalog,
  onAdd,
  onRemove,
  children,
}: {
  side: Side;
  refs: readonly TaskDependencyRef[];
  candidates: readonly Task[];
  catalog: CandidateCatalog;
  onAdd: (task: Task) => void;
  onRemove: (ref: TaskDependencyRef) => void;
  children?: ReactNode;
}) {
  const navigation = useTasksNavigation();
  const open = side === "blockedBy" ? refs.filter(isOpenRef) : refs;
  const resolved = side === "blockedBy" ? refs.filter((ref) => !isOpenRef(ref)) : [];
  const row = (ref: TaskDependencyRef) => (
    <div
      key={ref.id}
      className="flex items-start gap-2 border-b border-border-hairline px-0.5 py-3 text-sm hover:bg-state-hover"
    >
      <button
        type="button"
        aria-label={`Open task ${ref.key}: ${ref.title}`}
        className="flex min-w-0 flex-1 items-start gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => navigation.go({ kind: "task", taskKey: ref.key })}
      >
        <StatusIcon status={ref.status} className="mt-0.5 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium">Task</span>
            <span className="break-all">{ref.key}</span>
            <span>{STATUS_LABELS[ref.status]}</span>
          </span>
          <span className="mt-1 block break-words [overflow-wrap:anywhere]">{ref.title}</span>
          {side === "blockedBy" ? (
            <span className="mt-1 block text-xs text-muted-foreground">
              {isOpenRef(ref) ? "Waiting for this task to be completed." : "Not an open blocker"}
            </span>
          ) : null}
        </span>
        <Icon name="ArrowUpRight" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      </button>
      <button
        type="button"
        aria-label={`Remove ${ref.key} from ${SIDE_TITLES[side]}`}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onRemove(ref)}
      >
        <Icon name="X" className="size-3.5" />
      </button>
    </div>
  );
  return (
    <section aria-label={SIDE_TITLES[side]} className="mt-5">
      <h2 className="mb-1 text-xs font-semibold text-muted-foreground">{SIDE_TITLES[side]}</h2>
      {open.map(row)}
      {children}
      {side === "blockedBy" && open.length === 0 && !children ? (
        <p className="py-3 text-xs text-muted-foreground">No open blockers.</p>
      ) : null}
      {resolved.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">
            Resolved · {resolved.length} · not included in open blockers
          </h3>
          {resolved.map(row)}
        </div>
      ) : null}
      <TaskPicker side={side} candidates={candidates} catalog={catalog} onPick={onAdd} />
    </section>
  );
}

export function DependencySections({
  task,
  onChanged,
  onError,
}: {
  task: Task;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const rpc = useTasksRpc();
  const creator = useCreatorThreadMetadata(task.createdByThreadId);
  // TaskDetail is task-id keyed. Demand and candidates end with that detail session.
  const [requested, setRequested] = useState(false);
  const allTasks = useTasksQuery(
    async (query) => (requested ? listAllTasks(query, {}) : []),
    ["tasks:changed"],
    [requested],
  );
  const catalog: CandidateCatalog = {
    isLoading: allTasks.isLoading,
    error: allTasks.error,
    request: () => setRequested(true),
    retry: allTasks.refresh,
  };
  const blockedBy = task.blockedBy ?? [];
  const blocks = task.blocks ?? [];
  const linked = new Set([
    task.id,
    ...blockedBy.map((ref) => ref.id),
    ...blocks.map((ref) => ref.id),
  ]);
  const candidates = (allTasks.data ?? []).filter((candidate) => !linked.has(candidate.id));

  const link = async (blockerTaskId: string, blockedTaskId: string) => {
    try {
      const result = await rpc.call("addTaskDependency", {
        blockerTaskId,
        blockedTaskId,
      });
      if (!result.ok) {
        onError(result.error.message);
        return;
      }
      onChanged();
    } catch (error) {
      onError(errorMessage(error));
    }
  };

  const unlink = async (blockerTaskId: string, blockedTaskId: string) => {
    try {
      await rpc.call("removeTaskDependency", { blockerTaskId, blockedTaskId });
      onChanged();
    } catch (error) {
      onError(errorMessage(error));
    }
  };

  return (
    <>
      <DependencyList
        side="blockedBy"
        refs={blockedBy}
        candidates={candidates}
        catalog={catalog}
        onAdd={(picked) => void link(picked.id, task.id)}
        onRemove={(ref) => void unlink(ref.id, task.id)}
      >
        {task.createdByThreadId && task.creatorThreadBlocked === true ? (
          <CreatorThreadRelation threadId={task.createdByThreadId} blocked metadata={creator} />
        ) : null}
      </DependencyList>
      <DependencyList
        side="blocks"
        refs={blocks}
        candidates={candidates}
        catalog={catalog}
        onAdd={(picked) => void link(task.id, picked.id)}
        onRemove={(ref) => void unlink(task.id, ref.id)}
      />
      {task.createdByThreadId ? (
        <section
          aria-label="Creation attribution"
          className="mt-6 border-t border-border-hairline pt-5"
        >
          <h2 className="mb-1 text-xs font-semibold text-muted-foreground">Created in thread</h2>
          <CreatorThreadRelation
            threadId={task.createdByThreadId}
            blocked={task.creatorThreadBlocked === true}
            metadata={creator}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Creation attribution is separate from the blocking relations above.
          </p>
        </section>
      ) : null}
    </>
  );
}
