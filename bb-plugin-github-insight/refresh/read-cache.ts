export const REVALIDATE_AFTER_MS = 60_000;
const MAX_ENTRIES = 30;

interface Entry<T> {
  value: T;
  fetchedAt: number;
  generation: number;
}

export interface Fetched<T> {
  value: T;
  changed: boolean;
}

export interface ReadCacheDeps<T> {
  now(): number;
  sameData(a: T, b: T): boolean;
}

export function createReadCache<T>({ now, sameData }: ReadCacheDeps<T>) {
  const entries = new Map<string, Entry<T>>();
  const running = new Map<string, Promise<Fetched<T>>>();
  let generation = 0;

  function store(key: string, started: number, value: T): Fetched<T> {
    const current = entries.get(key);
    if (current !== undefined && current.generation > started) {
      return { value: current.value, changed: false };
    }
    entries.delete(key);
    entries.set(key, { value, fetchedAt: now(), generation: started });
    for (const oldest of entries.keys()) {
      if (entries.size <= MAX_ENTRIES) break;
      entries.delete(oldest);
    }
    return { value, changed: current === undefined || !sameData(current.value, value) };
  }

  async function fetch(key: string, read: () => Promise<T>): Promise<Fetched<T>> {
    const started = ++generation;
    return store(key, started, await read());
  }

  function shared(key: string, read: () => Promise<T>): Promise<Fetched<T>> {
    const existing = running.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const fetched = fetch(key, read).finally(() => {
      if (running.get(key) === fetched) running.delete(key);
    });
    running.set(key, fetched);
    return fetched;
  }

  return {
    peek: (key: string): T | null => entries.get(key)?.value ?? null,
    isFresh(key: string): boolean {
      const entry = entries.get(key);
      return entry !== undefined && now() - entry.fetchedAt < REVALIDATE_AFTER_MS;
    },
    fetch,
    shared,
  };
}

export type ReadCache<T> = ReturnType<typeof createReadCache<T>>;
