// Local lab only. The SDK host owns SQLite and validates every RPC input/output.
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import { createStore, registerTasksApi } from '../../api/index.js';
import { tasksRpcContract } from '../../shared/contract.js';
// @ts-expect-error Existing Node fixture helper has no declaration file.
import { createFixture } from './fixture.mjs';

const id = (n: number) => String(n).padStart(26, '0');
export function createLocalBackend(owner: string) {
  const { bb, harness } = createFakePluginHost({ pluginId: 'tasks-plus', sdk: {
    projects: { list: async () => [] },
    threads: { get: async () => null },
  } });
  const store = createStore(bb);
  registerTasksApi(bb, store);
  const fixture = createFixture(owner);
  const project = store.tasks.createProject({ id: id(1), ...fixture.project, color: 'blue' });
  const labelIds = new Map<string, string>();
  fixture.labels.forEach((label: { id: string; name: string; color: string }, i: number) => {
    const stored = store.tasks.createLabel({ id: id(10 + i), projectId: project.id, name: label.name, color: label.color });
    labelIds.set(label.id, stored.id);
  });
  fixture.tasks.forEach((task: any, i: number) => {
    const stored = store.tasks.createTask({ id: id(100 + i), projectId: project.id,
      title: task.title, description: task.description, status: task.status, priority: task.priority,
      dueDate: task.dueDate });
    if (stored.key !== task.key) throw new Error('Fixture key mismatch');
    task.id = stored.id;
    for (const label of task.labelIds) store.tasks.addTaskLabel(stored.id, labelIds.get(label)!);
  });
  fixture.activity.comments.forEach((comment: any, i: number) => {
    const stored = store.tasks.createComment({ id: id(1000 + i), taskId: fixture.tasks[99].id,
      kind: comment.authorKind === 'human' ? 'user' : 'agent', authorName: comment.authorKind === 'human' ? 'Lab user' : 'Lab agent',
      body: comment.body, threadId: null });
    comment.id = stored.id;
    comment.attachments.forEach((attachment: any, j: number) => store.tasks.createAttachment({ id: id(2000 + i * 10 + j),
      commentId: stored.id, fileName: attachment.name, mime: attachment.mimeType,
      sizeBytes: Buffer.byteLength(attachment.content), blobPath: `lab/${attachment.name}`, isImage: false }));
  });
  bb.storage.database().prepare("UPDATE tasks SET created_at = ?, updated_at = ?").run("2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z");
  const calls: any[] = [];
  let failRead: string | null = null;
  let saveDelay = 0;
  let failSave = false;
  return { fixture, bb, harness, calls,
    databasePath: bb.storage.database().name,
    control(value: { failRead?: string | null; saveDelay?: number; failSave?: boolean }) {
      if ('failRead' in value) failRead = value.failRead ?? null;
      if ('saveDelay' in value) saveDelay = value.saveDelay ?? 0;
      if ('failSave' in value) failSave = value.failSave ?? false;
    },
    async call(method: string, input: unknown) {
      calls.push({ method, input, time: Date.now() });
      if (!Object.hasOwn(tasksRpcContract, method)) throw new Error('Unknown RPC');
      if (!/^(get|list|sidebar)/.test(method) && method !== 'updateTask') throw new Error('Lab blocks mutation/dispatch/notification');
      if (method === 'getTaskByKey' && (input as {taskKey: string}).taskKey === failRead) throw new Error('Owned failed-read case');
      if (method === 'updateTask') {
        if (saveDelay) await new Promise(resolve => setTimeout(resolve, saveDelay));
        if (failSave) throw new Error('Owned failed-save case');
      }
      return harness.behavior.callRpc(method, input);
    },
    dispose: () => harness.lifecycle.dispose(),
  };
}
