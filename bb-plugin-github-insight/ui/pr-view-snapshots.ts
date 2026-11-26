const MAX_THREADS = 20;
const all = new Set<Map<string, unknown>>();

export function createThreadSnapshots<T>() {
  const snapshots = new Map<string, T>();
  all.add(snapshots);
  return {
    remember(threadId: string, value: T): void {
      snapshots.delete(threadId);
      snapshots.set(threadId, value);
      for (const oldest of snapshots.keys()) {
        if (snapshots.size <= MAX_THREADS) break;
        snapshots.delete(oldest);
      }
    },
    get: (threadId: string): T | null => snapshots.get(threadId) ?? null,
  };
}

export function forgetPrViews(): void {
  for (const snapshots of all) snapshots.clear();
}
