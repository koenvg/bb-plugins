import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract, SendToAgentResult } from "../contract";
import { splitByCommit } from "../core/comment-draft-view";
import type { ReviewFile } from "../core/pr-files";
import type { PrHead } from "../core/pr-head";
import type { ListedCommentDraft, SummaryDraft } from "../core/review-drafts";
import { isReviewUpdateFor, REVIEW_UPDATED_CHANNEL } from "../core/review-updated";
import {
  openThreadCounts,
  openThreads,
  type PlacedThread,
  type ThreadPlacement,
} from "../core/thread-placement";
import { cn } from "@/lib/utils";
import { useCommandIntent } from "./command-intents";
import { CommentDraftsProvider } from "./comment-drafts";
import { Notice, RefreshButton, RefreshError, SendToAgentButton } from "./feedback";
import { PrFileDiff } from "./file-diff";
import { OlderCommentDrafts } from "./older-comment-drafts";
import { OutdatedThreads } from "./outdated-threads";
import { SubmitPanel, SubmitReviewToggle } from "./submit-panel";
import { ThreadActionsProvider } from "./thread-actions";
import { ThreadSelectionContext, useThreadSelectionState } from "./thread-selection";
import { useThreadResult } from "./use-thread-result";

function useReview(threadId: string) {
  const rpc = useRpc<typeof rpcContract>();
  const fetchReview = useCallback((id: string) => rpc.call("getReview", { threadId: id }), [rpc]);
  const state = useThreadResult(threadId, fetchReview);

  useRealtime(REVIEW_UPDATED_CHANNEL, (payload) => {
    if (isReviewUpdateFor(payload, threadId)) state.reload();
  });

  return state;
}

interface SubmitRequest {
  onHandled: () => void;
}

function useSubmitCommand(threadId: string, result: ReturnType<typeof useReview>["result"]) {
  const [requested, setRequested] = useState(false);
  useCommandIntent(threadId, "review", () => setRequested(true));

  const loadedWithoutReview = result !== null && result.kind !== "ok";
  useEffect(() => {
    if (requested && loadedWithoutReview) setRequested(false);
  }, [requested, loadedWithoutReview]);

  return useMemo<SubmitRequest | undefined>(
    () => (requested ? { onHandled: () => setRequested(false) } : undefined),
    [requested],
  );
}

export function ReviewTab({ threadId }: { threadId: string }) {
  return <ReviewTabContent key={threadId} threadId={threadId} />;
}

function ReviewTabContent({ threadId }: { threadId: string }) {
  const { result, refreshing, refresh, reload } = useReview(threadId);
  const submitRequest = useSubmitCommand(threadId, result);
  if (result === null)
    return (
      <Padded>
        <Notice>Loading pull request…</Notice>
      </Padded>
    );
  if (result.kind === "no_pr") {
    return (
      <Padded>
        <Notice>No pull request for this thread</Notice>
      </Padded>
    );
  }
  if (result.kind === "error") {
    return (
      <Padded>
        <RefreshError
          message={result.message}
          refreshedAt={null}
          retry={refresh}
          busy={refreshing}
        />
      </Padded>
    );
  }
  return (
    <ThreadActionsProvider
      key={threadId}
      threadId={threadId}
      drafts={result.drafts}
      onWritten={reload}
    >
      <CommentDraftsProvider key={threadId} threadId={threadId} onWritten={reload}>
        <ReviewContent
          threadId={threadId}
          files={result.files}
          threads={result.threads}
          head={result.head}
          commentDrafts={result.commentDrafts}
          summaryDraft={result.summaryDraft}
          reload={reload}
          refreshing={refreshing}
          refresh={refresh}
          submitRequest={submitRequest}
        />
      </CommentDraftsProvider>
    </ThreadActionsProvider>
  );
}

interface ReviewContentProps {
  threadId: string;
  files: readonly ReviewFile[];
  threads: ThreadPlacement;
  head: PrHead;
  commentDrafts: readonly ListedCommentDraft[];
  summaryDraft: SummaryDraft | null;
  reload: () => void;
  refreshing: boolean;
  refresh: () => void;
  submitRequest: SubmitRequest | undefined;
}

function ReviewContent({
  threadId,
  files,
  threads,
  head,
  commentDrafts,
  summaryDraft,
  reload,
  refreshing,
  refresh,
  submitRequest,
}: ReviewContentProps) {
  const [showResolved, setShowResolved] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(
    () => commentDrafts.length > 0 || summaryDraft !== null,
  );
  useEffect(() => {
    if (!submitRequest) return;
    setSubmitOpen(true);
    submitRequest.onHandled();
  }, [submitRequest]);
  const openIds = useMemo(() => openThreads(threads).map(({ thread }) => thread.id), [threads]);
  const { selection, selectedIds, deselect } = useThreadSelectionState(openIds);
  const agent = useSendToAgent(threadId, deselect);
  const visible = useMemo(() => visibleThreads(threads, showResolved), [threads, showResolved]);
  const placedByPath = useMemo(
    () => groupByPath(visible.placed, ({ thread }) => thread.path),
    [visible.placed],
  );
  const counts = useMemo(() => openThreadCounts(threads), [threads]);
  const draftsByCommit = useMemo(
    () => splitByCommit(commentDrafts, head.oid),
    [commentDrafts, head.oid],
  );
  const draftsByPath = useMemo(
    () => groupByPath(draftsByCommit.atHead, (draft) => draft.path),
    [draftsByCommit.atHead],
  );
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-3 py-2 text-xs">
        <span className="mr-1 text-muted-foreground">{filesChangedText(files)}</span>
        <CountPill emphasis={counts.open > 0}>{counts.open} open</CountPill>
        <CountPill emphasis={false}>{counts.outdated} outdated</CountPill>
        <div className="ml-auto flex items-center gap-2">
          {agent.outcome?.result.kind === "sent" && (
            <span role="status" className="text-muted-foreground">
              {sentText(agent.outcome.result, agent.outcome.requested)}
            </span>
          )}
          <ShowResolvedSwitch checked={showResolved} onChange={setShowResolved} />
          <SubmitReviewToggle open={submitOpen} toggle={() => setSubmitOpen((open) => !open)} />
          {selectedIds.length > 0 && (
            <SendToAgentButton
              count={selectedIds.length}
              sending={agent.sending}
              send={() => agent.send(selectedIds)}
            />
          )}
          <RefreshButton refreshing={refreshing} refresh={refresh} />
        </div>
      </header>
      <SubmitPanel
        threadId={threadId}
        open={submitOpen}
        head={head}
        commentCount={commentDrafts.length}
        summaryDraft={summaryDraft}
        onWritten={reload}
      />
      {agent.outcome?.result.kind === "error" && (
        <div
          role="alert"
          className="shrink-0 border-b border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {agent.outcome.result.message}
        </div>
      )}
      <ThreadSelectionContext.Provider value={selection}>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <OlderCommentDrafts drafts={draftsByCommit.older} headOid={head.oid} />
          <OutdatedThreads threads={visible.outdated} />
          {files.map((file) => (
            <PrFileDiff
              key={file.path}
              file={file}
              threads={placedByPath.get(file.path) ?? NO_THREADS}
              commentDrafts={draftsByPath.get(file.path) ?? NO_COMMENT_DRAFTS}
            />
          ))}
        </div>
      </ThreadSelectionContext.Provider>
    </div>
  );
}

function useSendToAgent(threadId: string, onSent: (reviewThreadIds: readonly string[]) => void) {
  const rpc = useRpc<typeof rpcContract>();
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<{ result: SendToAgentResult; requested: number } | null>(
    null,
  );

  async function send(reviewThreadIds: readonly string[]) {
    setSending(true);
    setOutcome(null);
    let result: SendToAgentResult;
    try {
      result = await rpc.call("sendToAgent", { threadId, reviewThreadIds: [...reviewThreadIds] });
    } catch (error) {
      result = { kind: "error", message: error instanceof Error ? error.message : String(error) };
    }
    if (result.kind === "sent") onSent(reviewThreadIds);
    setOutcome({ result, requested: reviewThreadIds.length });
    setSending(false);
  }

  return { sending, outcome, send };
}

function sentText(result: Extract<SendToAgentResult, { kind: "sent" }>, requested: number): string {
  const count = result.threadCount < requested ? `${result.threadCount} of ${requested} ` : "";
  return result.delivery === "queued"
    ? `Queued ${count}until the agent is idle`
    : `Sent ${count}to agent`;
}

const NO_THREADS: readonly PlacedThread[] = [];
const NO_COMMENT_DRAFTS: readonly ListedCommentDraft[] = [];

function visibleThreads(threads: ThreadPlacement, showResolved: boolean): ThreadPlacement {
  if (showResolved) return threads;
  return {
    placed: threads.placed.filter(({ thread }) => !thread.resolved),
    outdated: threads.outdated.filter((thread) => !thread.resolved),
  };
}

function groupByPath<T>(entries: readonly T[], pathOf: (entry: T) => string): Map<string, T[]> {
  const byPath = new Map<string, T[]>();
  for (const entry of entries) {
    const group = byPath.get(pathOf(entry));
    if (group === undefined) byPath.set(pathOf(entry), [entry]);
    else group.push(entry);
  }
  return byPath;
}

function filesChangedText(files: readonly ReviewFile[]): string {
  return files.length === 1 ? "1 file changed" : `${files.length} files changed`;
}

function CountPill({ emphasis, children }: { emphasis: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 tabular-nums",
        emphasis
          ? "bg-foreground/[0.07] font-medium text-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function ShowResolvedSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden
        className="relative h-3.5 w-6 shrink-0 rounded-full bg-muted-foreground/25 transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:size-2.5 after:rounded-full after:bg-background after:shadow-[0_1px_2px_rgb(0_0_0/0.2)] after:transition-transform after:duration-200 after:ease-out peer-checked:bg-primary peer-checked:after:translate-x-2.5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50"
      />
      Show resolved
    </label>
  );
}

function Padded({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-y-auto p-3">{children}</div>;
}
