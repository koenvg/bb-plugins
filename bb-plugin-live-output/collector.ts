import type { PluginBbSdk } from "@get-bb/plugin-sdk";
import type { OutputSnapshot } from "./contract";

type ThreadId = string;
type ThreadResponse = Awaited<ReturnType<PluginBbSdk["threads"]["get"]>>;
type ThreadMetadata = Pick<
  ThreadResponse,
  | "id"
  | "title"
  | "titleFallback"
  | "providerId"
  | "parentThreadId"
  | "visibility"
  | "archivedAt"
  | "deletedAt"
  | "status"
  | "createdAt"
  | "updatedAt"
>;
type Cursor =
  | { kind: "catch-up"; before: number | null; highest: number }
  | { kind: "ready"; after: number };
type ThreadObservation = {
  metadata: ThreadMetadata;
  cursor: Cursor;
  buckets: Map<number, number>;
  lastAt: number;
  retryAt: number;
  deleted: boolean;
};
type Discovery = { archived: boolean; offset: number; seen: Set<ThreadId>; limited: boolean };
const types = ["item/agentMessage/delta", "item/reasoning/textDelta"] as const;
const maxThreads = 10_000;
const eventPageSize = 100;
const discoveryPageSize = 500;
const encoder = new TextEncoder();

export class OutputCollector {
  private readonly threads = new Map<ThreadId, ThreadObservation>();
  private readonly dirty = new Set<ThreadId>();
  private readonly missing = new Set<ThreadId>();
  private readonly startedAt = Date.now();
  private readonly controller = new AbortController();
  private discovery: Discovery | null = {
    archived: false,
    offset: 0,
    seen: new Set(),
    limited: false,
  };
  private nextDiscoveryAt = 0;
  private discovered = false;
  private discoveryError = false;
  private capacityLimited = false;
  private reading = false;
  private deletionVersion = 0;
  private readingId: ThreadId | null = null;
  private disposed = false;
  private running = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private endService: (() => void) | undefined;
  private totalBytes = 0;
  private deltas = 0;
  private failures = 0;

  constructor(
    private readonly api: () => Pick<PluginBbSdk["threads"], "list" | "get" | "events">,
  ) {}

  observe(metadata: ThreadMetadata, sequence?: number): void {
    if (this.disposed) return;
    if (metadata.deletedAt !== null) {
      this.remove(metadata.id);
      return;
    }
    let observation = this.threads.get(metadata.id);
    if (observation?.deleted) return;
    if (!observation) {
      if (this.threads.size >= maxThreads) {
        this.capacityLimited = true;
        if (this.discovery) this.discovery.limited = true;
        return;
      }
      observation = {
        metadata: this.metadata(metadata),
        cursor: { kind: "catch-up", before: null, highest: 0 },
        buckets: new Map(),
        lastAt: 0,
        retryAt: 0,
        deleted: false,
      };
      this.threads.set(metadata.id, observation);
    } else if (metadata.updatedAt >= observation.metadata.updatedAt) {
      observation.metadata = this.metadata(metadata);
    }
    this.discovery?.seen.add(metadata.id);
    this.missing.delete(metadata.id);
    const cursor = observation.cursor;
    if (sequence !== undefined && (!Number.isSafeInteger(sequence) || sequence < 0)) return;
    if (sequence !== undefined && cursor.kind === "ready" && sequence <= cursor.after) return;
    if (
      sequence !== undefined ||
      metadata.status === "active" ||
      metadata.status === "starting" ||
      metadata.createdAt >= this.startedAt ||
      metadata.updatedAt >= this.startedAt
    )
      this.dirty.add(metadata.id);
  }

  remove(id: ThreadId): void {
    if (this.disposed) return;
    this.deletionVersion++;
    const observation = this.threads.get(id);
    if (observation) {
      observation.deleted = true;
      observation.buckets.clear();
    }
    this.dirty.delete(id);
    this.missing.delete(id);
  }

  run(signal: AbortSignal): Promise<void> {
    if (this.disposed || signal.aborted) {
      this.dispose();
      return Promise.resolve();
    }
    if (this.running) throw new Error("Collector already running");
    this.running = true;
    return new Promise((resolve) => {
      const abort = () => this.dispose();
      signal.addEventListener("abort", abort, { once: true });
      this.endService = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      this.timer = setInterval(() => {
        void this.work();
      }, 1000);
      void this.work();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort();
    clearInterval(this.timer);
    this.threads.clear();
    this.dirty.clear();
    this.missing.clear();
    this.discovery = null;
    this.endService?.();
  }

  snapshot(): OutputSnapshot {
    if (this.disposed) throw new Error("Collector disposed");
    const at = Date.now();
    const lastSecond = Math.floor(at / 1000) - 1;
    const totals = new Map<number, number>();
    const contributors: OutputSnapshot["contributors"] = [];
    let threadsDiscovered = 0;
    let streamingThreads = 0;
    for (const observation of this.threads.values()) {
      if (observation.deleted) continue;
      threadsDiscovered++;
      let recentBytes = 0;
      for (const [second, bytes] of observation.buckets) {
        if (second < lastSecond - 63 || second > lastSecond + 6) continue;
        totals.set(second, (totals.get(second) ?? 0) + bytes);
        if (second > lastSecond - 5 && second <= lastSecond) recentBytes += bytes;
      }
      if (recentBytes > 0) streamingThreads++;
      if (observation.lastAt >= at - 60_000 && observation.lastAt > 0) {
        const metadata = observation.metadata;
        contributors.push({
          id: metadata.id,
          title: metadata.title || metadata.titleFallback || metadata.id,
          providerId: metadata.providerId,
          parentThreadId: metadata.parentThreadId,
          hidden: metadata.visibility === "hidden",
          archived: metadata.archivedAt !== null,
          rawBytesPerSecond: observation.buckets.get(lastSecond) ?? 0,
          smoothBytesPerSecond: recentBytes / 5,
          lastAt: observation.lastAt,
        });
      }
    }
    const samples = Array.from({ length: 60 }, (_, index) => {
      const second = lastSecond - 59 + index;
      let bytes = 0;
      for (let i = second - 4; i <= second; i++) bytes += totals.get(i) ?? 0;
      return {
        second,
        rawBytesPerSecond: totals.get(second) ?? 0,
        smoothBytesPerSecond: bytes / 5,
      };
    });
    const latest = samples[59]!;
    const backlog =
      this.dirty.size + (this.readingId !== null && !this.dirty.has(this.readingId) ? 1 : 0);
    contributors.sort(
      (a, b) =>
        b.smoothBytesPerSecond - a.smoothBytesPerSecond ||
        b.lastAt - a.lastAt ||
        a.id.localeCompare(b.id),
    );
    return {
      at,
      startedAt: this.startedAt,
      coverage:
        this.discoveryError || this.capacityLimited
          ? "degraded"
          : !this.discovered
            ? "starting"
            : backlog > 0
              ? "degraded"
              : "live",
      threadsDiscovered,
      streamingThreads,
      totalBytes: this.totalBytes,
      deltas: this.deltas,
      failures: this.failures,
      backlog,
      capacityLimited: this.capacityLimited,
      rawBytesPerSecond: latest.rawBytesPerSecond,
      smoothBytesPerSecond: latest.smoothBytesPerSecond,
      samples,
      contributors: contributors.slice(0, 10),
    };
  }

  private metadata(row: ThreadMetadata): ThreadMetadata {
    return {
      id: row.id,
      title: row.title?.slice(0, 200) ?? null,
      titleFallback: row.titleFallback?.slice(0, 200) ?? null,
      providerId: row.providerId.slice(0, 200),
      parentThreadId: row.parentThreadId,
      visibility: row.visibility,
      archivedAt: row.archivedAt,
      deletedAt: row.deletedAt,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async work(): Promise<void> {
    if (this.disposed || this.reading) return;
    this.reading = true;
    try {
      const oldest = Math.floor(Date.now() / 1000) - 64;
      for (const observation of this.threads.values())
        for (const second of observation.buckets.keys())
          if (second < oldest) observation.buckets.delete(second);
      if (!this.discovery && Date.now() >= this.nextDiscoveryAt) {
        this.discovery = { archived: false, offset: 0, seen: new Set(), limited: false };
        for (const [id, observation] of this.threads)
          if (!observation.deleted && observation.cursor.kind === "ready") this.dirty.add(id);
      }
      if (this.discovery) await this.discoverPage();
      for (let pages = 0; pages < 20 && !this.disposed; pages++) {
        const id = [...this.dirty].find(
          (key) => (this.threads.get(key)?.retryAt ?? Infinity) <= Date.now(),
        );
        if (!id) break;
        this.dirty.delete(id);
        const observation = this.threads.get(id);
        if (!observation || observation.deleted) continue;
        this.readingId = id;
        try {
          if (this.missing.has(id)) await this.confirmThread(observation);
          else await this.readPage(observation);
        } catch {
          if (this.disposed || observation.deleted || this.threads.get(id) !== observation)
            continue;
          this.failures++;
          observation.retryAt = Date.now() + 3000;
          this.dirty.add(id);
        } finally {
          this.readingId = null;
        }
      }
    } catch {
      if (!this.disposed) {
        this.failures++;
        this.discoveryError = true;
        this.discovery = null;
        this.nextDiscoveryAt = Date.now() + 3000;
      }
    } finally {
      this.reading = false;
    }
  }

  private async discoverPage(): Promise<void> {
    const discovery = this.discovery!;
    const deletionVersion = this.deletionVersion;
    const rows = await this.api().list({
      archived: discovery.archived,
      includeHidden: true,
      limit: discoveryPageSize,
      offset: discovery.offset,
      signal: this.requestSignal(),
    });
    if (this.disposed) return;
    if (deletionVersion !== this.deletionVersion) {
      this.discoveryError = true;
      return;
    }
    if (rows.length > discoveryPageSize) throw new Error("Oversized discovery page");
    for (const row of rows) {
      this.observe(row);
    }
    if (rows.length === discoveryPageSize) {
      discovery.offset += discoveryPageSize;
      if (discovery.offset > maxThreads) throw new Error("Discovery pagination limit");
      return;
    }
    if (!discovery.archived) {
      discovery.archived = true;
      discovery.offset = 0;
      return;
    }
    for (const [id, observation] of this.threads) {
      if (observation.deleted) {
        this.threads.delete(id);
        this.missing.delete(id);
        this.dirty.delete(id);
      } else if (!discovery.seen.has(id)) {
        this.missing.add(id);
        this.dirty.add(id);
      }
    }
    this.capacityLimited = discovery.limited;
    this.discovery = null;
    this.discoveryError = false;
    this.discovered = true;
    this.nextDiscoveryAt = Date.now() + 30_000;
  }

  private async confirmThread(observation: ThreadObservation): Promise<void> {
    const id = observation.metadata.id;
    const metadata = await this.api().get({ threadId: id, signal: this.requestSignal() });
    if (this.disposed || observation.deleted || this.threads.get(id) !== observation) return;
    if (metadata.id !== id) throw new Error("Unexpected thread identity");
    this.missing.delete(id);
    if (metadata.deletedAt !== null) {
      this.remove(id);
      this.threads.delete(id);
    } else {
      this.observe(metadata);
      observation.retryAt = 0;
      this.dirty.add(id);
    }
  }

  private requestSignal(): AbortSignal {
    return AbortSignal.any([this.controller.signal, AbortSignal.timeout(5000)]);
  }

  private async readPage(observation: ThreadObservation): Promise<void> {
    const cursor = observation.cursor;
    const rows = await this.api().events.list({
      threadId: observation.metadata.id,
      types,
      limit: String(eventPageSize),
      order: cursor.kind === "ready" ? "asc" : "desc",
      ...(cursor.kind === "ready"
        ? { afterSeq: String(cursor.after) }
        : cursor.before !== null
          ? { beforeSeq: String(cursor.before) }
          : {}),
      signal: this.requestSignal(),
    });
    if (
      this.disposed ||
      observation.deleted ||
      this.threads.get(observation.metadata.id) !== observation
    )
      return;
    if (rows.length > eventPageSize) throw new Error("Oversized event page");
    let previous = cursor.kind === "ready" ? cursor.after : (cursor.before ?? Infinity);
    const events = rows.map((row) => {
      if (
        row.threadId !== observation.metadata.id ||
        !Number.isSafeInteger(row.seq) ||
        row.seq < 1 ||
        (cursor.kind === "ready" ? row.seq <= previous : row.seq >= previous) ||
        !Number.isFinite(row.createdAt) ||
        row.createdAt < 0 ||
        row.createdAt > Date.now() + 5000 ||
        (row.type !== types[0] && row.type !== types[1]) ||
        typeof row.data.delta !== "string"
      )
        throw new Error("Invalid output event page");
      previous = row.seq;
      return { seq: row.seq, at: row.createdAt, bytes: encoder.encode(row.data.delta).byteLength };
    });
    const oldest = Math.floor(Date.now() / 1000) - 64;
    for (const second of observation.buckets.keys())
      if (second < oldest) observation.buckets.delete(second);
    for (const event of events) {
      if (event.at < this.startedAt) continue;
      const second = Math.floor(event.at / 1000);
      if (second >= oldest)
        observation.buckets.set(second, (observation.buckets.get(second) ?? 0) + event.bytes);
      this.totalBytes += event.bytes;
      this.deltas++;
      observation.lastAt = Math.max(observation.lastAt, event.at);
    }
    if (cursor.kind === "catch-up") {
      const highest = Math.max(cursor.highest, events[0]?.seq ?? 0);
      if (events.length === eventPageSize && events.some((event) => event.at >= this.startedAt))
        observation.cursor = { kind: "catch-up", highest, before: events.at(-1)!.seq };
      else observation.cursor = { kind: "ready", after: highest };
      this.dirty.add(observation.metadata.id);
    } else {
      observation.cursor = { kind: "ready", after: events.at(-1)?.seq ?? cursor.after };
      if (events.length === eventPageSize) this.dirty.add(observation.metadata.id);
    }
    observation.retryAt = 0;
  }
}
