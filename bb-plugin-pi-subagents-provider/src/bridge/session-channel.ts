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

  constructor(private readonly send: (message: Record<string, unknown>) => void) {}

  handle(message: Record<string, unknown>): void {
    if (this.disposedError) return;
    if (message.kind === "ready") {
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

  dispose(error: Error): void {
    if (this.disposedError) return;
    this.disposedError = error;
    this.ready.reject(error);
    for (const reply of this.replies.values()) reply.reject(error);
    this.replies.clear();
    const waiter = this.leafWaiter;
    this.leafWaiter = null;
    waiter?.(null);
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
