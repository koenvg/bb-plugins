import { useEffect, useRef, useState } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { TaskWorkStatus, ThreadExecution } from "../../shared/contract.js";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Icon } from "@/components/ui/icon";
import { COARSE_POINTER_TEXT_SM_CLASS } from "@/components/ui/coarse-pointer-sizing";
import { cn } from "@/lib/utils";
import "./list.css";

const EXECUTION_ORDER: readonly ThreadExecution[] = [
  "failed",
  "unavailable",
  "starting",
  "working",
  "idle",
  "removed",
];
const LABELS: Record<ThreadExecution, string> = {
  failed: "Failed",
  unavailable: "Unavailable",
  starting: "Starting",
  working: "Running",
  idle: "Idle",
  removed: "Removed",
};
const CHIP = `rounded-md border border-border px-1.5 py-px text-muted-foreground ${COARSE_POINTER_TEXT_SM_CLASS}`;

export function threadBuckets(threads: TaskWorkStatus["threads"]) {
  return EXECUTION_ORDER.flatMap((execution) => {
    const count = threads.filter((thread) => thread.execution === execution).length;
    return count ? [{ execution, count, text: `${count} ${LABELS[execution]}` }] : [];
  });
}
/** Only current observations may claim activity. Removed threads are not idle agents. */
export function threadActivity(meta: TaskWorkStatus | undefined): "running" | "idle" | undefined {
  if (meta?.availability !== "available") return undefined;
  const existing = meta.threads.filter((thread) => thread.execution !== "removed");
  if (existing.some((thread) => thread.execution === "working")) return "running";
  return existing.length > 0 && existing.every((thread) => thread.execution === "idle")
    ? "idle"
    : undefined;
}

export function ThreadActivitySummary({
  statuses,
}: {
  statuses: readonly (TaskWorkStatus | undefined)[] | undefined;
}) {
  if (!statuses?.length) return null;
  const loading = statuses.some((status) => status === undefined);
  const inventoryUnavailable = statuses.some((status) => status?.availability === "unavailable");
  const observations = new Map<
    string,
    { thread: TaskWorkStatus["threads"][number]; available: boolean; observedAt: number }
  >();
  for (const status of statuses) {
    if (!status) continue;
    const available = status.availability === "available";
    const observedAt = Date.parse(status.observedAt);
    for (const thread of status.threads) {
      const current =
        available || thread.execution === "removed"
          ? thread
          : { ...thread, execution: "unavailable" as const };
      const previous = observations.get(thread.threadId);
      // Available beats retained unavailable data, then newer time wins.
      // At equal times, preserve removal, then use state priority, never row order.
      const preference = previous
        ? Number(available) - Number(previous.available) ||
          observedAt - previous.observedAt ||
          Number(current.execution === "removed") -
            Number(previous.thread.execution === "removed") ||
          EXECUTION_ORDER.indexOf(previous.thread.execution) -
            EXECUTION_ORDER.indexOf(current.execution)
        : 1;
      if (preference > 0)
        observations.set(thread.threadId, { thread: current, available, observedAt });
    }
  }
  const buckets = threadBuckets([...observations.values()].map((value) => value.thread)).filter(
    (bucket) => bucket.execution !== "removed",
  );
  if (!loading && !buckets.length && !inventoryUnavailable) return null;
  return (
    <span className="task-list-activity" aria-label="Agent activity for listed tasks">
      {loading ? (
        <span>Agent activity loading</span>
      ) : (
        buckets.map((bucket, index) => (
          <span key={bucket.execution}>
            {index > 0 ? <span aria-hidden> · </span> : null}
            <span
              className={
                bucket.execution === "working"
                  ? "task-list-activity-running"
                  : bucket.execution === "failed"
                    ? "text-destructive"
                    : undefined
              }
            >
              {bucket.text.toLowerCase()}
            </span>
          </span>
        ))
      )}
      {inventoryUnavailable ? (
        <span>
          {loading || buckets.length > 0 ? <span aria-hidden> · </span> : null}
          {buckets.length > 0 ? "Agent inventory incomplete" : "Agent inventory unavailable"}
        </span>
      ) : null}
    </span>
  );
}

export function ThreadSummary({
  taskKey,
  meta,
}: {
  taskKey: string;
  meta: TaskWorkStatus | undefined;
}) {
  const navigate = useBbNavigate();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const activity = threadActivity(meta);
  useEffect(() => {
    const button = trigger.current;
    if (activity !== "running" || !button) return;
    let inView = true;
    const sync = () => {
      button.dataset.motionPaused = String(document.hidden || !inView);
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(([entry]) => {
            inView = entry?.isIntersecting ?? false;
            sync();
          });
    observer?.observe(button);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      delete button.dataset.motionPaused;
    };
  }, [activity]);
  if (!meta)
    return (
      <span className={CHIP} aria-busy="true">
        Threads loading
      </span>
    );
  if (meta.threads.length === 0) {
    return meta.availability === "unavailable" ? (
      <span className={CHIP}>Threads unavailable</span>
    ) : null;
  }
  const buckets = threadBuckets(meta.threads);
  const visible = buckets.slice(0, 2);
  const hiddenCount = buckets.slice(2).reduce((count, bucket) => count + bucket.count, 0);
  const existing = meta.threads.filter((thread) => thread.execution !== "removed");
  const archivedCount = existing.filter((thread) => thread.archive === "archived").length;
  const archiveUnknown = existing.some((thread) => thread.archive === "unknown");
  const archiveText =
    archivedCount > 0
      ? archivedCount === existing.length && !archiveUnknown
        ? "All threads archived"
        : `${archivedCount} archived`
      : null;
  const description = [
    ...buckets.map((bucket) => bucket.text),
    archiveText,
    archiveUnknown ? "Archive unavailable" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          aria-label={`Threads for ${taskKey}: ${description}`}
          data-agent-state={activity}
          className={cn(
            CHIP,
            "task-agent",
            "relative z-10 flex max-w-full flex-wrap items-center gap-x-1 tabular-nums hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          )}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            // Enter belongs to this control, not the row's open-task shortcut.
            if (event.key === "Enter" || event.key === " ") event.stopPropagation();
          }}
        >
          {activity === "running" ? (
            <span className="task-agent-bars" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          ) : activity === "idle" ? (
            <span className="task-agent-idle-dot" aria-hidden />
          ) : (
            <Icon name="MessagesSquare" className="size-3 shrink-0" />
          )}
          {visible.map((bucket, index) => (
            <span key={bucket.execution} className="whitespace-nowrap">
              {index > 0 ? <span aria-hidden> · </span> : null}
              <span className={bucket.execution === "failed" ? "text-destructive" : undefined}>
                {bucket.text}
              </span>
            </span>
          ))}
          {hiddenCount > 0 ? (
            <span className="whitespace-nowrap">· +{hiddenCount} more</span>
          ) : null}
          {archiveText ? (
            <span className="whitespace-nowrap">
              · {archiveText === "All threads archived" ? "All archived" : archiveText}
            </span>
          ) : null}
          {archiveUnknown ? <span className="whitespace-nowrap">· Archive unavailable</span> : null}
          <Icon name="ChevronDown" className="size-3 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={`Threads for ${taskKey}`}
        mobileTitle={`Threads for ${taskKey}`}
        className="max-h-80 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto p-3"
        onClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
      >
        <h3 className="mb-2 text-sm font-semibold">Threads for {taskKey}</h3>
        {meta.availability === "unavailable" ? (
          <p className="mb-2 text-xs text-muted-foreground">
            Couldn't refresh these attachments. Current activity and archive state are unavailable.
          </p>
        ) : null}
        <ul className="space-y-3">
          {meta.threads.map((thread) => (
            <li key={thread.threadId} className="min-w-0">
              {thread.execution === "removed" ? (
                <span className="block break-words text-sm">{thread.title}</span>
              ) : (
                <a
                  href={`/threads/${thread.threadId}`}
                  aria-label={`Open thread ${thread.title}, ${thread.threadId}`}
                  className="block break-words text-sm underline decoration-border underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    navigate.toThread(thread.threadId);
                    setOpen(false);
                  }}
                >
                  {thread.title}
                </a>
              )}
              <div className="break-all text-xs text-muted-foreground">{thread.threadId}</div>
              <div className="break-words text-xs text-muted-foreground">
                <span className={thread.execution === "failed" ? "text-destructive" : undefined}>
                  {LABELS[thread.execution]}
                </span>
                {thread.execution !== "removed" ? (
                  <>
                    {" · "}
                    <span>
                      {thread.archive === "archived"
                        ? "Archived"
                        : thread.archive === "unarchived"
                          ? "Not archived"
                          : "Archive unavailable"}
                    </span>
                  </>
                ) : null}
                {" · "}
                {thread.presetName}
              </div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
