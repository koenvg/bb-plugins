import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { TasksApiStore } from "../api";
import type { TaskStatus, TaskThreadLiveStatus } from "../db";
import {
  STATUS_LIMITS,
  type CoordinationReader,
  type CoordinationSnapshot,
  type StatusResult,
} from "./status-contract";

type Database = ReturnType<BbPluginApi["storage"]["database"]>;
export interface NativeWorker {
  id: string;
  taskId: string;
  threadId: string;
  liveStatus: TaskThreadLiveStatus;
  updatedAt: string;
}
export interface NativeTask {
  id: string;
  key: string;
  status: TaskStatus;
  title: string;
  titleLength: number;
  priorWork: boolean;
  workerTotal: number;
  workers: NativeWorker[];
  ownerWorkers: NativeWorker[];
  attachmentTotal: number;
  attachments: Array<{
    id: string;
    commentId: string | null;
    fileName: string;
    nameLength: number;
  }>;
  dependencies: Array<{ id: string; key: string; status: TaskStatus }>;
}
export interface NativeSnapshot {
  tasksObservedAt: string;
  epic: NativeTask;
  subtasks: NativeTask[];
  coordination: CoordinationSnapshot;
  counts: { subtasks: number; dependencies: number; workers: number };
}
export type SnapshotResult =
  | { ok: true; snapshot: NativeSnapshot }
  | Extract<StatusResult, { ok: false }>;

export function resolveStatusEpicId(db: Database, address: string): string | undefined {
  const normalized = address.trim().toUpperCase();
  const key = /^([A-Z][A-Z0-9]{0,9})-(\d+)$/.exec(normalized);
  if (key) {
    return db
      .prepare<[string, string], { id: string }>(
        "SELECT t.id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.prefix = ? COLLATE NOCASE AND t.number = ?",
      )
      .get(key[1]!, key[2]!)?.id;
  }
  return db.prepare<[string], { id: string }>("SELECT id FROM tasks WHERE id = ?").get(normalized)
    ?.id;
}

const scopeSql = "SELECT id FROM tasks WHERE id = ? OR parent_task_id = ?";
export function readStatusSnapshot(
  db: Database,
  store: TasksApiStore,
  epicId: string,
  readCoordination?: CoordinationReader,
): SnapshotResult {
  return store.transaction(() => {
    if (!db.prepare<[string], { id: string }>("SELECT id FROM tasks WHERE id = ?").get(epicId)) {
      return {
        ok: false,
        error: { code: "task_not_found", message: `Task not found: ${epicId}` },
      };
    }
    const subtasks = db
      .prepare<[string], { n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE parent_task_id = ?")
      .get(epicId)!.n;
    const workers = db
      .prepare<[string, string], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_threads WHERE task_id IN (${scopeSql})`,
      )
      .get(epicId, epicId)!.n;
    const dependencyCounts = db
      .prepare<[string, string], { n: number; bytes: number }>(
        `
      SELECT COUNT(*) AS n, COALESCE(SUM(length(CAST(json_object('id', b.id, 'key', p.prefix || '-' || b.number, 'status', b.status) AS BLOB))), 0) AS bytes
      FROM task_dependencies d JOIN tasks b ON b.id = d.blocker_task_id JOIN projects p ON p.id = b.project_id
      WHERE d.blocked_task_id IN (${scopeSql})
    `,
      )
      .get(epicId, epicId)!;
    const counts = { subtasks, workers, dependencies: dependencyCounts.n };
    if (subtasks > STATUS_LIMITS.subtasks || dependencyCounts.bytes > STATUS_LIMITS.bytes) {
      return {
        ok: false,
        error: {
          code: "epic_status_size_limit",
          message:
            "Epic exceeds the complete status response limits. No partial frontier is returned.",
          counts,
          ...(dependencyCounts.bytes > STATUS_LIMITS.bytes
            ? { requiredBytes: dependencyCounts.bytes }
            : {}),
        },
      };
    }
    const rows = db
      .prepare<
        [string, string],
        {
          id: string;
          key: string;
          status: TaskStatus;
          title: string;
          title_length: number;
          prior_work: number;
        }
      >(
        `
      SELECT t.id, p.prefix || '-' || t.number AS key, t.status, substr(t.title, 1, ${STATUS_LIMITS.textCharacters}) AS title,
        length(t.title) AS title_length,
        EXISTS(SELECT 1 FROM comments c WHERE c.task_id = t.id AND (c.kind = 'agent' OR c.thread_id IS NOT NULL)) AS prior_work
      FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id IN (${scopeSql})
      ORDER BY t.position, t.id
    `,
      )
      .all(epicId, epicId);
    const taskMap = new Map<string, NativeTask>(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          key: row.key,
          status: row.status,
          title: row.title,
          titleLength: row.title_length,
          priorWork: Boolean(row.prior_work),
          workerTotal: 0,
          workers: [],
          ownerWorkers: [],
          attachmentTotal: 0,
          attachments: [],
          dependencies: [],
        },
      ]),
    );
    const coordination = readCoordination?.(epicId, [...taskMap.keys()]) ?? {};
    const threadRows = db
      .prepare<
        [string, string],
        {
          id: string;
          task_id: string;
          thread_id: string;
          live_status: TaskThreadLiveStatus;
          updated_at: string;
          total: number;
        }
      >(
        `
      SELECT * FROM (
        SELECT id, task_id, thread_id, live_status, updated_at,
          ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY attached_at DESC, id DESC) AS rank,
          COUNT(*) OVER (PARTITION BY task_id) AS total
        FROM task_threads WHERE task_id IN (${scopeSql})
      ) WHERE rank <= ${STATUS_LIMITS.workersPerTask}
    `,
      )
      .all(epicId, epicId);
    for (const row of threadRows) {
      const task = taskMap.get(row.task_id)!;
      task.workerTotal = row.total;
      task.workers.push({
        id: row.id,
        taskId: row.task_id,
        threadId: row.thread_id,
        liveStatus: row.live_status,
        updatedAt: row.updated_at,
      });
    }
    // Primary owners are required state, never dropped by the auxiliary worker cap.
    for (const task of taskMap.values()) {
      const owners = coordination.tasks?.get(task.id)?.ownership?.owners ?? [];
      for (const owner of owners) {
        const association = store.tasks.getTaskThread(owner.associationId);
        if (association?.taskId === task.id && association.threadId === owner.threadId) {
          task.ownerWorkers.push(association);
        }
      }
    }
    const attachmentRows = db
      .prepare<
        [string, string],
        {
          id: string;
          owner_task_id: string;
          comment_id: string | null;
          file_name: string;
          name_length: number;
          total: number;
        }
      >(
        `
      SELECT * FROM (
        SELECT a.id, COALESCE(a.task_id, c.task_id) AS owner_task_id, a.comment_id,
          substr(a.file_name, 1, ${STATUS_LIMITS.textCharacters}) AS file_name, length(a.file_name) AS name_length,
          ROW_NUMBER() OVER (PARTITION BY COALESCE(a.task_id, c.task_id) ORDER BY a.created_at DESC, a.id DESC) AS rank,
          COUNT(*) OVER (PARTITION BY COALESCE(a.task_id, c.task_id)) AS total
        FROM attachments a LEFT JOIN comments c ON c.id = a.comment_id
        WHERE COALESCE(a.task_id, c.task_id) IN (${scopeSql})
      ) WHERE rank <= ${STATUS_LIMITS.attachmentsPerTask}
    `,
      )
      .all(epicId, epicId);
    for (const row of attachmentRows) {
      const task = taskMap.get(row.owner_task_id)!;
      task.attachmentTotal = row.total;
      task.attachments.push({
        id: row.id,
        commentId: row.comment_id,
        fileName: row.file_name,
        nameLength: row.name_length,
      });
    }
    const dependencyRows = db
      .prepare<[string, string], { task_id: string; id: string; key: string; status: TaskStatus }>(
        `
      SELECT d.blocked_task_id AS task_id, b.id, p.prefix || '-' || b.number AS key, b.status
      FROM task_dependencies d JOIN tasks b ON b.id = d.blocker_task_id JOIN projects p ON p.id = b.project_id
      WHERE d.blocked_task_id IN (${scopeSql}) ORDER BY d.created_at, b.id
    `,
      )
      .all(epicId, epicId);
    for (const row of dependencyRows)
      taskMap.get(row.task_id)!.dependencies.push({ id: row.id, key: row.key, status: row.status });
    const epic = taskMap.get(epicId)!;
    return {
      ok: true,
      snapshot: {
        tasksObservedAt: new Date().toISOString(),
        epic,
        subtasks: [...taskMap.values()].filter((t) => t.id !== epicId),
        coordination,
        counts,
      },
    };
  });
}
