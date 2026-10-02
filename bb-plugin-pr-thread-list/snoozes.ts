import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { MAX_SNOOZE_MS, SNOOZES_CHANGED_CHANNEL } from "./contract";
import { createSnoozeStore, SNOOZE_MIGRATIONS } from "./snooze-store";

export const SNOOZE_WAKE_SCHEDULE = "snooze-wake";

export function registerSnoozes(bb: BbPluginApi, now: () => number = Date.now) {
  const db = bb.storage.database();
  bb.storage.migrate(db, SNOOZE_MIGRATIONS);
  const store = createSnoozeStore(db);
  const changed = () => bb.realtime.publish(SNOOZES_CHANGED_CHANNEL, {});
  const endSnooze = (threadId: string) => { if (store.delete(threadId)) changed(); };

  for (const event of ["thread.idle", "thread.failed", "thread.archived", "thread.unarchived"] as const) {
    bb.events.on(event, ({ thread }) => endSnooze(thread.id));
  }
  bb.background.schedule(SNOOZE_WAKE_SCHEDULE, "* * * * *", async () => {
    const at = now();
    const due = store.due(at);
    for (const threadId of due) {
      // A deleted thread rejects markUnread; its row must still go, or the sweep retries it forever.
      await bb.sdk.threads.markUnread({ threadId }).catch(() => {});
      store.deleteDue(threadId, at);
    }
    if (due.length > 0) changed();
  });

  return {
    listSnoozes: () => ({ snoozes: store.list() }),
    snooze: async ({ threadId, wakeAt }: { threadId: string; wakeAt: number }) => {
      const at = now();
      if (wakeAt <= at || wakeAt > at + MAX_SNOOZE_MS) throw new Error("The wake time must be within the next 30 days.");
      await bb.sdk.threads.markRead({ threadId });
      store.upsert(threadId, wakeAt, at);
      changed();
      return {};
    },
    wake: ({ threadId }: { threadId: string }) => {
      endSnooze(threadId);
      return {};
    },
  };
}
