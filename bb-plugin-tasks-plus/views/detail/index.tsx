import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Editor } from "@tiptap/core";
import { HugeiconsIcon } from "@hugeicons/react";
import SmilePlusIcon from "@hugeicons/core-free-icons/SmilePlusIcon";
import type { Task } from "../../shared/contract.js";
import { errorMessage } from "../../shared/errors.js";
import type { DelegationRpcContract } from "../../delegate/contract.js";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import {
  listAllTasks,
  useMentionItems,
  useTasksQuery,
  useTasksRpc,
} from "../../shell/data.js";
import { useTasksNavigation } from "../../shell/routes.js";
import { TasksEditor } from "../../editor/tasks-editor.js";
import { TaskActivity } from "../activity/task-activity.js";
import { AttachmentsGrid, uploadAttachment } from "./attachments.js";
import { createTaskEditSession } from "./edit-session.js";
import {
  TasksSessionProvider,
  useTasksSession,
  useSafeTaskTarget,
} from "./task-session.js";
import { Button } from "@/components/ui/button";
import { StatusIcon } from "./meta.js";
import { STATUS_LABELS } from "../list/lib.js";
import {
  InlineProperties,
  PropertiesRail,
  type DetailMenu,
  type TaskPropertyUpdate,
} from "./rail.js";
import { useShortcuts } from "../../shell/shortcut-provider.js";
import { DependencyBadges, useBlockedWorkConfirm } from "../dependencies.js";
import { DependencySections } from "./dependencies.js";
import { ThreadsSection } from "./threads.js";
import { DetailToasts, useDetailToasts } from "./toast.js";
import { DelayedLoading } from "@/components/ui/delayed-loading";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

interface DetailViewProps {
  taskKey: string;
  onMissing?: (taskKey: string, stillMissing: () => boolean) => void;
  reconcileRevision?: number;
  /** A keyed lookup has finished with a task or retryable error. Never an editor focus. */
  onReady?: (taskKey: string) => void;
}

type PropertiesLayout = "inline" | "rail";

function shownPropertiesLayout(root: HTMLElement | null): PropertiesLayout {
  const layouts = [
    ...(root?.querySelectorAll<HTMLElement>("[data-properties-layout]") ?? []),
  ];
  const shown =
    layouts.find((layout) => layout.getClientRects().length > 0) ?? layouts[0];
  return shown?.dataset.propertiesLayout === "rail" ? "rail" : "inline";
}

const DESCRIPTION_SAVE_DELAY_MS = 800;
const ACTIVE_PULL_REQUEST_REFRESH_MS = 60_000;

function SubTaskDonut({
  subtasks,
  onClick,
}: {
  subtasks: Task[];
  onClick: () => void;
}) {
  if (subtasks.length === 0) return null;
  const done = subtasks.filter((subtask) => subtask.status === "done").length;
  const degrees = (done / subtasks.length) * 360;
  return (
    <button
      type="button"
      title="Sub-tasks completed"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground shadow-2xs hover:border-input hover:text-foreground"
    >
      <span
        aria-hidden
        className="inline-block size-3 rounded-full"
        style={{
          background: `conic-gradient(var(--primary) ${degrees}deg, var(--muted) 0)`,
        }}
      />
      {done}/{subtasks.length} sub-tasks
    </button>
  );
}

function EditableTitle({
  task,
  onChange,
  onSave,
}: {
  task: Task;
  onChange: (title: string) => void;
  onSave: () => void;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (ref.current && ref.current.textContent !== task.title)
      ref.current.textContent = task.title;
  }, [task.title]);
  return (
    <h1
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Task title"
      className="mb-2.5 mt-1 text-2xl font-semibold leading-tight outline-none"
      onInput={(event) => onChange(event.currentTarget.textContent ?? "")}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onBlur={onSave}
    />
  );
}

function SubTasksSection({
  ref,
  task,
  subtasks,
  onCreate,
}: {
  ref: React.Ref<HTMLElement>;
  task: Task;
  subtasks: Task[];
  onCreate: (title: string) => Promise<boolean>;
}) {
  const navigation = useTasksNavigation();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const created = await onCreate(trimmed);
    setBusy(false);
    if (created) setTitle("");
  };

  return (
    <section ref={ref} className="mt-5">
      {subtasks.map((subtask) => (
        <button
          key={subtask.id}
          type="button"
          className="flex h-8 w-full items-center gap-2 border-b border-border-hairline px-0.5 text-left text-sm hover:bg-state-hover"
          title={STATUS_LABELS[subtask.status]}
          onClick={() => navigation.go({ kind: "task", taskKey: subtask.key })}
        >
          <StatusIcon status={subtask.status} />
          <span className="shrink-0 text-xs text-muted-foreground">
            {subtask.key}
          </span>
          <span className="min-w-0 flex-1 truncate">{subtask.title}</span>
          <DependencyBadges task={subtask} className="py-px text-xs" />
        </button>
      ))}
      {adding ? (
        <div className="flex h-8 items-center gap-2 border-b border-border-hairline px-0.5">
          <StatusIcon status="todo" className="opacity-60" />
          <input
            autoFocus
            value={title}
            placeholder={`Sub-task of ${task.key}…`}
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
              if (event.key === "Escape") {
                setAdding(false);
                setTitle("");
              }
            }}
            onBlur={() => {
              if (!title.trim()) setAdding(false);
            }}
          />
        </div>
      ) : null}
      <button
        type="button"
        className="flex items-center gap-1.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setAdding(true)}
      >
        <Icon name="Plus" className="size-3" />
        Add sub-task
      </button>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <DelayedLoading>
      <div className="mx-auto w-full max-w-3xl px-8 py-12">
        <Skeleton className="mb-4 h-7 w-2/3" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="mb-2 h-4 w-5/6" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </DelayedLoading>
  );
}

function TaskDetail({
  task: savedTask,
  onTaskChanged,
}: {
  task: Task;
  onTaskChanged: () => void;
}) {
  const rpc = useTasksRpc();
  const delegationRpc = useRpc<DelegationRpcContract>();
  const navigation = useTasksNavigation();
  const { toasts, push, dismiss } = useDetailToasts();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subtasksRef = useRef<HTMLElement>(null);

  const transition = useTasksSession();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const savedTaskRef = useRef(savedTask);
  savedTaskRef.current = savedTask;
  const confirmedTask = useRef<{ task: Task; querySnapshot: Task } | null>(
    null,
  );
  const [edits] = useState(() =>
    createTaskEditSession(savedTask.id, {
      save: async (taskId, patch) => {
        const querySnapshot = savedTaskRef.current;
        const result = await rpcRef.current.call("updateTask", {
          taskId,
          ...patch,
        });
        if (result.ok) {
          confirmedTask.current = { task: result.task, querySnapshot };
        }
        return result.ok
          ? { ok: true }
          : { ok: false, errorMessage: result.error.message };
      },
    }),
  );
  const editState = useSyncExternalStore(edits.subscribe, edits.getSnapshot);
  const confirmed = confirmedTask.current;
  // A save reply may arrive after a newer realtime query. Timestamp wins;
  // identity only breaks ties against the snapshot present when the write began.
  const baseTask =
    confirmed &&
    (confirmed.task.updatedAt > savedTask.updatedAt ||
      (confirmed.task.updatedAt === savedTask.updatedAt &&
        confirmed.querySnapshot === savedTask))
      ? confirmed.task
      : savedTask;
  const task = { ...baseTask, ...editState.draft };
  useLayoutEffect(() => transition?.register(edits), [transition, edits]);

  const projects = useTasksQuery(
    async (query) => (await query.call("listProjects", {})).projects,
    ["projects:changed"],
  );
  const project = projects.data?.find((entry) => entry.id === task.projectId);

  const parent = useTasksQuery(
    async (query) =>
      task.parentTaskId
        ? (await query.call("getTask", { taskId: task.parentTaskId })).task
        : null,
    ["tasks:changed"],
    [task.parentTaskId],
  );
  const subtasks = useTasksQuery(
    async (query) => listAllTasks(query, { parentTaskId: task.id }),
    ["tasks:changed"],
    [task.id],
  );
  const labels = useTasksQuery(
    async (query) =>
      (await query.call("listLabels", { projectId: task.projectId })).labels,
    ["projects:changed"],
    [task.projectId],
  );
  const attachments = useTasksQuery(
    async (query) =>
      (await query.call("listAttachments", { taskId: task.id })).attachments,
    ["tasks:changed"],
    [task.id],
  );
  const threads = useTasksQuery(
    async (query) =>
      (await query.call("listTaskThreads", { taskId: task.id })).taskThreads,
    ["threads:changed"],
    [task.id],
  );
  const presets = useTasksQuery(
    async (query) => (await query.call("listPresets")).presets,
    ["projects:changed"],
  );
  const pullRequests = useTasksQuery(
    async (query) => query.call("listTaskPullRequests", { taskId: task.id }),
    ["threads:changed"],
    [task.id],
  );
  const refreshPullRequests = pullRequests.refresh;
  const hasActivePullRequest = (pullRequests.data?.pullRequests ?? []).some(
    (pullRequest) =>
      pullRequest.state === "open" || pullRequest.state === "draft",
  );
  useEffect(() => {
    window.addEventListener("focus", refreshPullRequests);
    return () => window.removeEventListener("focus", refreshPullRequests);
  }, [refreshPullRequests]);
  useEffect(() => {
    if (!hasActivePullRequest) return;
    const timer = window.setInterval(
      refreshPullRequests,
      ACTIVE_PULL_REQUEST_REFRESH_MS,
    );
    return () => window.clearInterval(timer);
  }, [hasActivePullRequest, refreshPullRequests]);

  const { confirmBlockedWork, blockedWorkDialog } = useBlockedWorkConfirm();

  const detailRef = useRef<HTMLDivElement>(null);
  const commentEditorRef = useRef<Editor | null>(null);
  const [openMenu, setOpenMenu] = useState<{
    menu: DetailMenu;
    layout: PropertiesLayout;
  } | null>(null);
  const menuControl = (layout: PropertiesLayout) => ({
    openMenu: openMenu?.layout === layout ? openMenu.menu : null,
    onOpenMenuChange: (menu: DetailMenu | null) =>
      setOpenMenu(menu === null ? null : { menu, layout }),
  });
  const openFromShortcut = (menu: DetailMenu) => () =>
    setOpenMenu({ menu, layout: shownPropertiesLayout(detailRef.current) });
  useShortcuts({
    "detail.status": openFromShortcut("status"),
    "detail.priority": openFromShortcut("priority"),
    "detail.labels": openFromShortcut("labels"),
    "detail.dispatch": presets.data?.length
      ? openFromShortcut("dispatch")
      : null,
    "detail.comment": () => {
      const editor = commentEditorRef.current;
      if (editor === null) return false;
      editor.commands.focus("end");
    },
  });

  const updateTask = async (
    input: TaskPropertyUpdate & { title?: string; description?: string },
  ) => {
    if (
      input.status === "in_progress" &&
      task.status !== "in_progress" &&
      !(await confirmBlockedWork(task))
    ) {
      return;
    }
    edits.stage(input);
    await edits.flush();
  };

  const onDescriptionChange = (markdown: string) => {
    edits.stage({ description: markdown }, DESCRIPTION_SAVE_DELAY_MS);
  };

  // Best effort for host panel closure only; in-panel changes await the barrier.
  useEffect(
    () => () => {
      void edits.flush();
    },
    [edits],
  );
  const uploadForTask = async (file: File) => {
    const result = await uploadAttachment(file, { taskId: task.id });
    attachments.refresh();
    return result;
  };

  const onPickFiles = async (files: FileList | null) => {
    for (const file of files ?? []) {
      try {
        await uploadAttachment(file, { taskId: task.id });
      } catch (error) {
        push(errorMessage(error));
      }
    }
    attachments.refresh();
  };

  const createSubtask = async (title: string): Promise<boolean> => {
    try {
      const result = await rpc.call("createTask", {
        projectId: task.projectId,
        title,
        parentTaskId: task.id,
        status: "todo",
      });
      if (!result.ok) {
        push(result.error.message);
        return false;
      }
      subtasks.refresh();
      return true;
    } catch (error) {
      push(errorMessage(error));
      return false;
    }
  };

  const mentionItems = useMentionItems();
  const navigate = useBbNavigate();

  const descriptionValue = task.description;
  const parentTask = parent.data ?? null;

  return (
    <div
      ref={detailRef}
      data-detail-key={task.key}
      className="@container flex min-h-full flex-col bg-surface-recessed-solid p-3"
    >
      <div className="flex flex-1 items-stretch rounded-lg border border-border bg-card">
        <div className="mx-auto w-full min-w-0 max-w-[55rem] flex-1 px-7 pb-16 pt-8 @3xl:px-13 @3xl:pt-11">
          {editState.error ? (
            <div
              role="alert"
              className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                Could not save this ticket. {editState.error}
              </span>
              <Button
                size="sm"
                variant="outline"
                aria-label="Retry save"
                disabled={editState.saving}
                onClick={() => {
                  void (transition ? transition.retry() : edits.flush());
                }}
              >
                Retry
              </Button>
            </div>
          ) : null}
          {parentTask || subtasks.data?.length ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {parentTask ? (
                <button
                  type="button"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground shadow-2xs hover:border-input"
                  onClick={() =>
                    navigation.go({ kind: "task", taskKey: parentTask.key })
                  }
                >
                  Sub-task of
                  <StatusIcon status={parentTask.status} className="size-3" />
                  <span className="font-medium text-foreground">
                    {parentTask.key}
                  </span>
                  <span className="min-w-0 truncate">{parentTask.title}</span>
                </button>
              ) : null}
              <SubTaskDonut
                subtasks={subtasks.data ?? []}
                onClick={() =>
                  subtasksRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  })
                }
              />
            </div>
          ) : null}

          <EditableTitle
            task={task}
            onChange={(title) =>
              edits.stage({ title }, DESCRIPTION_SAVE_DELAY_MS)
            }
            onSave={() => {
              void edits.flush();
            }}
          />

          <InlineProperties
            task={task}
            labels={labels.data}
            presets={presets.data}
            onUpdate={(update) => void updateTask(update)}
            onError={(message) => push(message)}
            className="mb-4 @[45rem]:hidden"
            {...menuControl("inline")}
          />

          <TasksEditor
            value={descriptionValue}
            onChange={onDescriptionChange}
            variant="doc"
            className="min-h-24"
            placeholder="Add a description… rich text: headings, lists, code, checkboxes, @mentions"
            onUploadImage={uploadForTask}
            mentionItems={mentionItems}
            onOpenThread={(threadId) => navigate.toThread(threadId)}
          />

          <div className="mb-1 mt-3 flex items-center gap-1">
            <button
              type="button"
              title="Reactions coming soon"
              aria-label="Add reaction"
              disabled
              className="flex size-6.5 items-center justify-center rounded-md text-muted-foreground opacity-50"
            >
              <HugeiconsIcon icon={SmilePlusIcon} className="size-4" />
            </button>
            <button
              type="button"
              title="Attach file"
              aria-label="Attach file"
              className="flex size-6.5 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="Paperclip" className="size-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                void onPickFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>

          <AttachmentsGrid
            attachments={attachments.data ?? []}
            onRemove={async (attachment) => {
              const result = await rpc.call("deleteAttachment", {
                attachmentId: attachment.id,
                removeDescriptionReferences: true,
              });
              if (!result.ok) throw new Error(result.error.message);
              attachments.refresh();
            }}
            onError={(message) => push(message)}
          />

          <SubTasksSection
            ref={subtasksRef}
            task={task}
            subtasks={subtasks.data ?? []}
            onCreate={createSubtask}
          />

          <DependencySections
            task={task}
            onChanged={onTaskChanged}
            onError={(message) => push(message)}
          />

          {(threads.data ?? []).length > 0 ? (
            <div className="mt-6">
              <ThreadsSection
                threads={threads.data ?? []}
                pullRequests={pullRequests.data?.pullRequests}
                unavailableThreadIds={
                  pullRequests.data?.unavailableThreadIds ?? []
                }
                onDetach={async (thread) => {
                  await delegationRpc.call("taskThreadsDetach", {
                    taskId: task.id,
                    threadId: thread.threadId,
                  });
                  threads.refresh();
                  pullRequests.refresh();
                }}
                onError={(message) => push(message)}
              />
            </div>
          ) : null}

          <div className="mt-1">
            <TaskActivity
              taskId={task.id}
              onCommentEditorReady={(editor) => {
                commentEditorRef.current = editor;
              }}
            />
          </div>
        </div>

        <PropertiesRail
          task={task}
          project={project}
          labels={labels.data}
          threads={threads.data ?? []}
          presets={presets.data}
          onUpdate={(update) => void updateTask(update)}
          onError={(message) => push(message)}
          className="hidden @[45rem]:block"
          {...menuControl("rail")}
        />
      </div>
      <DetailToasts toasts={toasts} onDismiss={dismiss} />
      {blockedWorkDialog}
    </div>
  );
}

export function DetailView(props: DetailViewProps) {
  const session = useTasksSession();
  const detail = <SessionDetailView {...props} />;
  return session ? (
    detail
  ) : (
    <TasksSessionProvider>{detail}</TasksSessionProvider>
  );
}

function SessionDetailView({
  taskKey,
  onMissing,
  reconcileRevision,
  onReady,
}: DetailViewProps) {
  const committedKey = useSafeTaskTarget(taskKey);
  return (
    <DetailQuery
      key={committedKey}
      taskKey={committedKey}
      onMissing={onMissing}
      reconcileRevision={reconcileRevision}
      onReady={onReady}
    />
  );
}
function DetailQuery({
  taskKey,
  onMissing,
  reconcileRevision,
  onReady,
}: DetailViewProps) {
  const query = useTasksQuery(
    async (rpc) => (await rpc.call("getTaskByKey", { taskKey })).task,
    ["tasks:changed"],
    [taskKey],
  );

  useEffect(() => {
    if (!query.isLoading && (query.data || query.error)) onReady?.(taskKey);
  }, [query.isLoading, query.data, query.error, taskKey, onReady]);
  const latestQuery = useRef(query);
  useLayoutEffect(() => {
    latestQuery.current = query;
  });
  // A confirmed deletion still crosses the save barrier. Keep this keyed query's
  // originating editor mounted until the workspace accepts clearing its identity.
  const previousTask = useRef<Task | null>(null);
  useLayoutEffect(() => {
    if (query.data) previousTask.current = query.data;
  }, [query.data]);
  const task =
    query.data ??
    (onMissing && query.data === null ? previousTask.current : null);
  useEffect(() => {
    if (!query.isLoading && query.error === null && query.data === null)
      onMissing?.(taskKey, () => {
        const latest = latestQuery.current;
        return (
          !latest.isLoading && latest.error === null && latest.data === null
        );
      });
  }, [
    query.isLoading,
    query.error,
    query.data,
    onMissing,
    taskKey,
    reconcileRevision,
  ]);
  if (query.data === undefined) {
    return query.error ? (
      <div
        data-detail-key={taskKey}
        className="flex h-full items-center justify-center p-6 text-sm text-destructive"
      >
        {query.error}
        <Button size="sm" variant="outline" onClick={query.refresh}>
          Retry
        </Button>
      </div>
    ) : (
      <DetailSkeleton />
    );
  }
  if (task === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
        <Icon name="FileQuestion" className="size-5" />
        Task {taskKey} was not found.
      </div>
    );
  }
  return <TaskDetail key={task.id} task={task} onTaskChanged={query.refresh} />;
}
