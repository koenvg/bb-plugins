import type { PluginBbSdk } from "@get-bb/plugin-sdk";
import type { OutputSnapshot } from "./contract";
import {
  graphSeconds,
  smoothSeconds,
  streamingSeconds,
  contributorSeconds,
  retainedSeconds,
} from "./timing";

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
  hint: { revision: number; highestSequence: number } | null;
  hintRevision: number;
  metadataRevision: number;
  nextVerifyAt: number;
  activated: number | null;
  liveContinuation: boolean;
  background: Set<"identity" | "continuation" | "verify">;
};
type Discovery = { archived: boolean; offset: number; seen: Set<ThreadId>; limited: boolean };
const types = ["item/agentMessage/delta", "item/reasoning/textDelta"] as const;
const maxThreads = 10_000;
const eventPageSize = 100;
const discoveryPageSize = 500;
const encoder = new TextEncoder();
const verificationInterval = 600_000;
type Verification = {
  members: ThreadObservation[];
  index: number;
  quota: number;
  nextSeedAt: number;
};

export class OutputCollector {
  private readonly threads = new Map<ThreadId, ThreadObservation>();
  private readonly live = new Set<ThreadId>();
  private readonly background = new Set<ThreadId>();
  private readonly missing = new Set<ThreadId>();
  private readonly readStarts: number[] = [];
  private laneChoice = 0;
  private readonly startedAt = Date.now();
  private readonly controller = new AbortController();
  private nextVerificationAt = this.startedAt + verificationInterval;
  private verification: Verification | null = null;
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
    this.mergeMetadata(metadata, sequence);
  }

  private mergeMetadata(metadata: ThreadMetadata, sequence?: number): void {
    if (metadata.deletedAt !== null) {
      this.remove(metadata.id);
      return;
    }
    let observation = this.threads.get(metadata.id);
    const previous = observation?.metadata;
    const activate = !previous
      ? metadata.status === "active" ||
        metadata.status === "starting" ||
        metadata.createdAt >= this.startedAt ||
        metadata.updatedAt >= this.startedAt
      : metadata.updatedAt > previous.updatedAt ||
        (metadata.status !== previous.status &&
          (metadata.status === "active" || metadata.status === "starting"));
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
        hint: null,
        hintRevision: 0,
        metadataRevision: 0,
        nextVerifyAt: this.startedAt + verificationInterval,
        activated: null,
        liveContinuation: false,
        background: new Set(),
      };
      this.threads.set(metadata.id, observation);
    } else if (metadata.updatedAt >= observation.metadata.updatedAt) {
      observation.metadata = this.metadata(metadata);
    }
    observation.metadataRevision++;
    this.discovery?.seen.add(metadata.id);
    this.missing.delete(metadata.id);
    observation.background.delete("identity");
    const cursor = observation.cursor;
    if (sequence !== undefined) {
      if (!Number.isSafeInteger(sequence) || sequence < 0) return;
      if (cursor.kind === "ready" && sequence <= cursor.after) return;
      observation.hint = {
        revision: ++observation.hintRevision,
        highestSequence: Math.max(sequence, observation.hint?.highestSequence ?? 0),
      };
    } else if (activate) {
      observation.activated = observation.metadataRevision;
      observation.background.add("continuation");
    }
    this.enqueue(observation);
  }

  remove(id: ThreadId): void {
    if (this.disposed) return;
    this.deletionVersion++;
    const observation = this.threads.get(id);
    if (observation) {
      observation.deleted = true;
      observation.buckets.clear();
    }
    this.live.delete(id);
    this.background.delete(id);
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
    this.live.clear();
    this.background.clear();
    this.readStarts.length = 0;
    this.missing.clear();
    this.discovery = null;
    this.verification = null;
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
      let smoothBytes = 0;
      for (const [second, bytes] of observation.buckets) {
        if (second < lastSecond - (retainedSeconds - 1) || second > lastSecond + 6) continue;
        totals.set(second, (totals.get(second) ?? 0) + bytes);
        if (second > lastSecond - streamingSeconds && second <= lastSecond) recentBytes += bytes;
        if (second > lastSecond - smoothSeconds && second <= lastSecond) smoothBytes += bytes;
      }
      if (recentBytes > 0) streamingThreads++;
      if (observation.lastAt >= at - contributorSeconds * 1000 && observation.lastAt > 0) {
        const metadata = observation.metadata;
        contributors.push({
          id: metadata.id,
          title: metadata.title || metadata.titleFallback || metadata.id,
          providerId: metadata.providerId,
          parentThreadId: metadata.parentThreadId,
          hidden: metadata.visibility === "hidden",
          archived: metadata.archivedAt !== null,
          rawBytesPerSecond: observation.buckets.get(lastSecond) ?? 0,
          smoothBytesPerSecond: smoothBytes / smoothSeconds,
          lastAt: observation.lastAt,
        });
      }
    }
    const samples = Array.from({ length: graphSeconds }, (_, index) => {
      const second = lastSecond - (graphSeconds - 1) + index;
      let bytes = 0;
      for (let i = second - (smoothSeconds - 1); i <= second; i++) bytes += totals.get(i) ?? 0;
      return {
        second,
        rawBytesPerSecond: totals.get(second) ?? 0,
        smoothBytesPerSecond: bytes / smoothSeconds,
      };
    });
    const latest = samples[graphSeconds - 1]!;
    const backlog =
      this.live.size +
      this.background.size +
      (this.readingId !== null &&
      !this.live.has(this.readingId) &&
      !this.background.has(this.readingId)
        ? 1
        : 0);
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

  private enqueue(observation: ThreadObservation): void {
    if (this.disposed || observation.deleted) return;
    const id = observation.metadata.id;
    if (observation.hint || observation.liveContinuation) {
      this.background.delete(id);
      this.live.add(id);
    } else if (observation.background.size > 0) {
      this.live.delete(id);
      this.background.add(id);
    } else {
      this.live.delete(id);
      this.background.delete(id);
    }
  }

  private takeEligible(lane: Set<ThreadId>): ThreadObservation | undefined {
    for (const id of lane) {
      const observation = this.threads.get(id);
      if (!observation || observation.deleted) {
        lane.delete(id);
        continue;
      }
      if (observation.retryAt > Date.now()) continue;
      lane.delete(id);
      return observation;
    }
    return undefined;
  }

  private seedVerification(): void {
    const now = Date.now();
    if (!this.verification && now >= this.nextVerificationAt) {
      const members: ThreadObservation[] = [];
      for (const observation of this.threads.values())
        if (!observation.deleted) members.push(observation);
      this.nextVerificationAt = now + verificationInterval;
      this.verification = {
        members,
        index: 0,
        quota: Math.max(1, Math.ceil(members.length / 600)),
        nextSeedAt: now,
      };
    }
    const pass = this.verification;
    if (!pass || now < pass.nextSeedAt) return;
    for (let seeded = 0; seeded < pass.quota && pass.index < pass.members.length; seeded++) {
      const observation = pass.members[pass.index++]!;
      if (
        observation.deleted ||
        this.threads.get(observation.metadata.id) !== observation ||
        observation.nextVerifyAt > now
      )
        continue;
      observation.background.add("verify");
      this.enqueue(observation);
    }
    pass.nextSeedAt = now + 1000;
    if (pass.index === pass.members.length) {
      // Finish membership seeding, not all retries. A failed member cannot freeze a later pass.
      this.verification = null;
    }
  }

  private async work(): Promise<void> {
    if (this.disposed || this.reading) return;
    this.reading = true;
    try {
      this.seedVerification();
      const oldest = Math.floor(Date.now() / 1000) - retainedSeconds;
      for (const observation of this.threads.values())
        for (const second of observation.buckets.keys())
          if (second < oldest) observation.buckets.delete(second);
      if (!this.discovery && Date.now() >= this.nextDiscoveryAt) {
        this.discovery = { archived: false, offset: 0, seen: new Set(), limited: false };
      }
      let discoveryRead = false;
      for (let starts = 0; starts < 20 && !this.disposed;) {
        const now = Date.now();
        while (this.readStarts.length && this.readStarts[0]! <= now - 1000) this.readStarts.shift();
        if (this.readStarts.length >= 20) break;
        const preferBackground = this.laneChoice === 4;
        const observation =
          this.takeEligible(preferBackground ? this.background : this.live) ??
          this.takeEligible(preferBackground ? this.live : this.background);
        if (!observation) {
          if (!discoveryRead && this.discovery) {
            discoveryRead = true;
            await this.discoverPage();
            continue;
          }
          break;
        }
        this.laneChoice = (this.laneChoice + 1) % 5;
        starts++;
        this.readStarts.push(Date.now());
        const id = observation.metadata.id;
        this.readingId = id;
        try {
          if (this.missing.has(id)) await this.confirmThread(observation);
          else await this.readPage(observation);
        } catch {
          if (this.disposed || observation.deleted || this.threads.get(id) !== observation)
            continue;
          this.failures++;
          observation.retryAt = Date.now() + 3000;
          this.enqueue(observation);
        } finally {
          this.readingId = null;
        }
        if (starts >= 5 && !discoveryRead && this.discovery && !this.disposed) {
          discoveryRead = true;
          await this.discoverPage();
        }
      }
      if (!discoveryRead && this.discovery && !this.disposed) await this.discoverPage();
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
      this.mergeMetadata(row);
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
        this.live.delete(id);
        this.background.delete(id);
      } else if (!discovery.seen.has(id)) {
        this.missing.add(id);
        observation.background.add("identity");
        this.enqueue(observation);
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
    const revision = observation.metadataRevision;
    const metadata = await this.api().get({ threadId: id, signal: this.requestSignal() });
    if (this.disposed || observation.deleted || this.threads.get(id) !== observation) return;
    if (metadata.id !== id) throw new Error("Unexpected thread identity");
    if (!this.missing.has(id) || observation.metadataRevision !== revision) {
      this.enqueue(observation);
      return;
    }
    this.missing.delete(id);
    observation.background.delete("identity");
    if (metadata.deletedAt !== null) {
      this.remove(id);
      this.threads.delete(id);
    } else {
      this.mergeMetadata(metadata);
      observation.retryAt = 0;
      observation.background.add("continuation");
      this.enqueue(observation);
    }
  }

  private requestSignal(): AbortSignal {
    return AbortSignal.any([this.controller.signal, AbortSignal.timeout(5000)]);
  }

  private async readPage(observation: ThreadObservation): Promise<void> {
    const cursor = observation.cursor;
    const hintRevision = observation.hint?.revision;
    const activationRevision = observation.activated;
    const liveRead = observation.hint !== null || observation.liveContinuation;
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
    const oldest = Math.floor(Date.now() / 1000) - retainedSeconds;
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
      if (liveRead) observation.liveContinuation = true;
      else observation.background.add("continuation");
    } else {
      observation.cursor = { kind: "ready", after: events.at(-1)?.seq ?? cursor.after };
      const full = events.length === eventPageSize;
      observation.liveContinuation = full && liveRead;
      if (full && !liveRead) observation.background.add("continuation");
      if (!full) {
        observation.background.delete("verify");
        if (observation.activated === activationRevision) {
          observation.background.delete("continuation");
          observation.activated = null;
        }
        observation.nextVerifyAt = Date.now() + verificationInterval;
      }
      const hint = observation.hint;
      if (
        hint &&
        (hint.highestSequence <= observation.cursor.after ||
          (!full && hint.revision === hintRevision))
      )
        observation.hint = null;
    }
    observation.retryAt = 0;
    this.enqueue(observation);
  }
}
