import type { BbPluginApi, PluginMentionItem } from "@get-bb/plugin-sdk";

import type { TasksApiStore } from "../api";
import { escapeLike, type Task } from "../db";
import { displayName } from "../shared/display-name";

const SEARCH_LIMIT = 10;

type PluginDatabase = ReturnType<BbPluginApi["storage"]["database"]>;

interface MentionTaskRow {
  id: string;
  key: string;
  title: string;
  project_name: string;
  status: Task["status"];
}

function searchTasks(
  database: PluginDatabase,
  query: string,
  bbProjectId: string | null,
): PluginMentionItem[] {
  const normalizedQuery = query.trim();
  const search = `%${escapeLike(normalizedQuery)}%`;
  const rows = database
    .prepare<{ bbProjectId: string | null; search: string }, MentionTaskRow>(
      `
        SELECT
          t.id,
          p.prefix || '-' || t.number AS key,
          t.title,
          p.name AS project_name,
          t.status
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        WHERE @search = '%%'
          OR (p.prefix || '-' || t.number) LIKE @search ESCAPE '\\'
          OR CAST(t.number AS TEXT) LIKE @search ESCAPE '\\'
          OR t.title LIKE @search ESCAPE '\\'
        ORDER BY
          CASE
            WHEN @bbProjectId IS NOT NULL
              AND p.linked_bb_project_id = @bbProjectId THEN 0
            ELSE 1
          END,
          t.updated_at DESC,
          t.id DESC
        LIMIT ${SEARCH_LIMIT}
      `,
    )
    .all({ bbProjectId, search });

  return rows.map((row) => ({
    id: row.id,
    title: `${row.key} · ${row.title}`,
    subtitle: `${row.project_name} · ${displayName(row.status)}`,
  }));
}

function buildTaskContext(store: TasksApiStore, taskId: string): string {
  const task = store.tasks.getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  return `# ${task.key} · ${task.title}

## Description

${task.description || "No description provided."}

Current details, if needed: bb tasks show ${task.key} --json.
`;
}

export function registerMentions(bb: BbPluginApi, store: TasksApiStore): void {
  const database = bb.storage.database();

  bb.ui.registerMentionProvider({
    id: "task",
    label: "Tasks",
    search({ query, projectId }) {
      return searchTasks(database, query, projectId);
    },
    resolve(itemId) {
      return { context: buildTaskContext(store, itemId) };
    },
  });
}
