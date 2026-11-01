export interface SettlementReport {
  runId: number;
  leafId: string | null;
  event: Record<string, unknown>;
}

interface StartReport {
  runId: number;
  previousSettlement: SettlementReport | null;
}

function parseSettlementReport(value: unknown): SettlementReport | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("runId" in value) ||
    typeof value.runId !== "number" ||
    !Number.isSafeInteger(value.runId) ||
    value.runId < 1 ||
    !("leafId" in value) ||
    (value.leafId !== null && typeof value.leafId !== "string") ||
    !("event" in value) ||
    !value.event ||
    typeof value.event !== "object" ||
    Array.isArray(value.event) ||
    "error" in value
  )
    return null;
  return {
    runId: value.runId,
    leafId: value.leafId,
    event: { ...value.event },
  };
}

const CHANNEL_REQUEST_TIMEOUT_MS = 30_000;
const AGENT_END_LEAF_TIMEOUT_MS = 5_000;

interface ChannelReply {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

/** One extension channel per child generation. Disposal settles all owned waits. */
export class PiSessionChannel {
  private readonly replies = new Map<string, ChannelReply>();
  private nextRequestId = 0;
  private readonly leafReports: (string | null)[] = [];
  private leafWaiter: ((leafId: string | null) => void) | null = null;
  private readonly ready = createDeferred();
  private disposedError: Error | null = null;
  private speedControl = false;
  supportsSettlement = false;
  private readonly agentSettledLeafReports: (SettlementReport | null)[] = [];
  private agentSettledLeafWaiter: ((report: SettlementReport | null) => void) | null = null;
  private readonly agentStartReports: (StartReport | null)[] = [];
  private agentStartWaiter: ((report: StartReport | null) => void) | null = null;

  get supportsSpeed(): boolean {
    return this.speedControl;
  }

  constructor(private readonly send: (message: Record<string, unknown>) => void) {}

  handle(message: Record<string, unknown>): void {
    if (this.disposedError) return;
    if (message.kind === "agent-start") {
      if (!this.supportsSettlement) return;
      const previousSettlement = parseSettlementReport(message.previousSettlement);
      const report =
        typeof message.runId === "number" &&
        Number.isSafeInteger(message.runId) &&
        message.runId > 0 &&
        (message.previousSettlement === null ||
          (previousSettlement && previousSettlement.runId < message.runId))
          ? { runId: message.runId, previousSettlement }
          : null;
      const waiter = this.agentStartWaiter;
      if (waiter) {
        this.agentStartWaiter = null;
        waiter(report);
      } else {
        this.agentStartReports.push(report);
      }
      return;
    }
    if (message.kind === "agent-settled-leaf") {
      const report = parseSettlementReport(message);
      const waiter = this.agentSettledLeafWaiter;
      if (waiter) {
        this.agentSettledLeafWaiter = null;
        waiter(report);
      } else {
        this.agentSettledLeafReports.push(report);
      }
      return;
    }
    if (message.kind === "ready") {
      this.speedControl = message.speedControl === true;
      this.supportsSettlement = message.agentSettled === true;
      this.ready.resolve();
    } else if (message.kind === "agent-end-leaf") {
      const leafId = typeof message.leafId === "string" ? message.leafId : null;
      const waiter = this.leafWaiter;
      if (waiter) {
        this.leafWaiter = null;
        waiter(leafId);
      } else {
        this.leafReports.push(leafId);
      }
    } else if (message.kind === "reply") {
      const id = String(message.id);
      const reply = this.replies.get(id);
      if (!reply) return;
      this.replies.delete(id);
      if (typeof message.error === "string") {
        reply.reject(new Error(message.error));
      } else {
        reply.resolve(message.result);
      }
    }
  }

  awaitReady(timeoutMs: number): Promise<void> {
    if (this.disposedError) return Promise.reject(this.disposedError);
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("pi extension did not report ready in time"));
      }, timeoutMs);
      timer.unref?.();
      this.ready.promise.then(
        () => {
          clearTimeout(timer);
          resolve();
        },
        (error: Error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  request(
    request: Record<string, unknown>,
    timeoutMs = CHANNEL_REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    if (this.disposedError) return Promise.reject(this.disposedError);
    const id = `cr-${++this.nextRequestId}`;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.replies.delete(id);
        reject(new Error(`pi extension did not answer ${String(request.method)}`));
      }, timeoutMs);
      timer.unref?.();
      const reply: ChannelReply = {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      this.replies.set(id, reply);
      try {
        this.send({ kind: "request", id, ...request });
      } catch (error) {
        this.replies.delete(id);
        reply.reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  // Event delivery is serialized by PiRpcSession, so there is at most one leaf waiter.
  takeAgentEndLeaf(): Promise<string | null> {
    const queued = this.leafReports.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (this.disposedError) return Promise.resolve(null);
    return new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        if (this.leafWaiter === settle) this.leafWaiter = null;
        resolve(null);
      }, AGENT_END_LEAF_TIMEOUT_MS);
      timer.unref?.();
      const settle = (leafId: string | null) => {
        clearTimeout(timer);
        resolve(leafId);
      };
      this.leafWaiter = settle;
    });
  }

  takeAgentStart(): Promise<StartReport | null> {
    if (this.disposedError) return Promise.resolve(null);
    const queued = this.agentStartReports.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.agentStartWaiter === settle) this.agentStartWaiter = null;
        resolve(null);
      }, AGENT_END_LEAF_TIMEOUT_MS);
      timer.unref?.();
      const settle = (report: StartReport | null) => {
        clearTimeout(timer);
        resolve(report);
      };
      this.agentStartWaiter = settle;
    });
  }

  takeAgentSettledLeaf(): Promise<SettlementReport | null> {
    if (this.disposedError) return Promise.resolve(null);
    const queued = this.agentSettledLeafReports.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise<SettlementReport | null>((resolve) => {
      const timer = setTimeout(() => {
        if (this.agentSettledLeafWaiter === settle) this.agentSettledLeafWaiter = null;
        resolve(null);
      }, AGENT_END_LEAF_TIMEOUT_MS);
      timer.unref?.();
      const settle = (report: SettlementReport | null) => {
        clearTimeout(timer);
        resolve(report);
      };
      this.agentSettledLeafWaiter = settle;
    });
  }

  dispose(error: Error): void {
    if (this.disposedError) return;
    this.disposedError = error;
    this.ready.reject(error);
    for (const reply of this.replies.values()) reply.reject(error);
    this.replies.clear();
    const waiter = this.leafWaiter;
    this.leafWaiter = null;
    waiter?.(null);
    this.agentStartWaiter?.(null);
    this.agentStartWaiter = null;
    this.agentSettledLeafWaiter?.(null);
    this.agentSettledLeafWaiter = null;
  }
}

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}
