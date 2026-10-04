import type { QuotaSnapshot } from "./quota.js";
import { FRESH_MS, MAX_AGE_MS } from "./freshness.js";

export type QuotaReason = "ok" | "aged" | "expired" | "unavailable" | "identity-changed" |
  "identity-unavailable" | "selection-changed" | "auth-required" | "auth-no-token" | "credential-store-failed" |
  "oauth-refresh-failed" | "auth-derivation-failed" | "oauth-short-lived" | "oauth-resolution-failed" |
  "auth-runtime-failed" | "auth-unavailable" | "auth-expired" | "auth-check-failed" |
  "runtime-unavailable" | "network" | "service" | "unsupported";
export type QuotaView = { state: "fresh" | "stale" | "unavailable"; reason: QuotaReason; snapshot: QuotaSnapshot | null };
export type QuotaRead = { status: "ok"; snapshot: QuotaSnapshot } |
  { status: "auth-expired" | "network" | "service" | "unsupported"; snapshot: null };

const RETRY_MS = 30_000;
const empty = (reason: QuotaReason): QuotaView => ({ state: "unavailable", reason, snapshot: null });

/** Host-worker memory only. Neither identity fingerprints nor pending credentials cross RPC. */
export class QuotaCache {
  private identity: string | null = null;
  private snapshot: QuotaSnapshot | null = null;
  private pending: Promise<QuotaView> | null = null;
  private lastFailure: QuotaReason | null = null;
  private generation = 0;
  private lastAttempt = -Infinity;
  constructor(private readonly now: () => number = Date.now) {}

  invalidate(): void {
    this.identity = null;
    this.snapshot = null;
    this.pending = null;
    this.lastFailure = null;
    this.lastAttempt = -Infinity;
    this.generation++;
  }

  peek(identity: string): QuotaView {
    if (this.identity !== identity || !this.snapshot) return empty("unavailable");
    const age = this.now() - Date.parse(this.snapshot.observedAt);
    if (!Number.isFinite(age) || age < 0 || age >= MAX_AGE_MS) {
      this.snapshot = null;
      this.lastFailure = null;
      return empty("expired");
    }
    if (this.lastFailure) return { state: "stale", reason: this.lastFailure, snapshot: this.snapshot };
    return { state: age < FRESH_MS ? "fresh" : "stale", reason: age < FRESH_MS ? "ok" : "aged", snapshot: this.snapshot };
  }

  async read(identity: string, load: () => Promise<QuotaRead>, recheck: () => Promise<string | null>, force = false, signal?: AbortSignal): Promise<QuotaView> {
    if (this.identity !== identity) {
      this.invalidate();
      this.identity = identity;
    }
    const current = this.peek(identity);
    if (signal?.aborted) return empty("selection-changed");
    if (this.pending) return this.pending;
    if (!force && current.state === "fresh") return current;
    if (this.now() - this.lastAttempt < RETRY_MS) return current;
    this.lastAttempt = this.now();
    const generation = this.generation;
    const task = (async (): Promise<QuotaView> => {
      let result: QuotaRead;
      try {
        result = await load();
      } catch {
        result = { status: "network", snapshot: null };
      }
      if (signal?.aborted) {
        if (generation === this.generation) this.invalidate();
        return empty("selection-changed");
      }
      let currentIdentity: string | null;
      try {
        currentIdentity = await recheck();
      } catch {
        currentIdentity = null;
      }
      if (signal?.aborted) {
        if (generation === this.generation) this.invalidate();
        return empty("selection-changed");
      }
      if (generation !== this.generation || this.identity !== identity || currentIdentity !== identity) {
        if (generation === this.generation) this.invalidate();
        return empty(currentIdentity === null ? "identity-unavailable" : "identity-changed");
      }
      if (result.status === "ok") {
        this.lastFailure = null;
        this.snapshot = result.snapshot;
        return this.peek(identity);
      }
      const retained = this.peek(identity);
      if (retained.snapshot) {
        this.lastFailure = result.status;
        return { ...retained, state: "stale", reason: result.status };
      }
      return empty(result.status);
    })();
    this.pending = task;
    void task.finally(() => { if (this.pending === task) this.pending = null; });
    return task;
  }
}
