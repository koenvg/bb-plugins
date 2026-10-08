type PiInputQueue = "followUp" | "steering";

interface PendingInput {
  queue: PiInputQueue;
  queuedText: string | null;
  reject: (error: Error) => void;
  resolve: () => void;
}

export interface TrackedSessionInput {
  consumed: Promise<void>;
  readonly wasQueued: boolean;
  acknowledge: (error?: Error) => void;
}

/** Owns queue snapshots, input acknowledgement, and the terminal steer probe. */
export class PiSessionInputs {
  private readonly pending: PendingInput[] = [];
  private lastObservedQueues: Record<PiInputQueue, string[]> = { followUp: [], steering: [] };
  private autoRetryInProgress = false;
  private terminalSteerSettlement: Promise<void> | null = null;

  constructor(private readonly readStreaming: () => Promise<boolean> | null) {}

  track(queue: PiInputQueue): TrackedSessionInput {
    let resolvePromise: () => void = () => undefined;
    let rejectPromise: (error: Error) => void = () => undefined;
    const consumed = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const pending: PendingInput = {
      queue,
      queuedText: null,
      reject: rejectPromise,
      resolve: resolvePromise,
    };
    this.pending.push(pending);
    void consumed.catch(() => undefined);
    return {
      consumed,
      get wasQueued() {
        return pending.queuedText !== null;
      },
      acknowledge: (error) => this.acknowledge(pending, error),
    };
  }

  observe(event: Record<string, unknown>): void {
    if (event.type === "queue_update") {
      this.observeQueue("steering", toStringArray(event.steering));
      this.observeQueue("followUp", toStringArray(event.followUp));
    } else if (event.type === "agent_end") {
      if (event.willRetry !== true) this.scheduleTerminalSteerSettlement();
    } else if (event.type === "auto_retry_start") {
      this.autoRetryInProgress = true;
      this.terminalSteerSettlement = null;
    } else if (event.type === "auto_retry_end") {
      this.autoRetryInProgress = false;
      if (event.success !== true) {
        this.rejectPending("Pi auto retry ended before steer was consumed", "steering");
      }
    }
  }

  rejectPending(message: string, queue?: PiInputQueue): void {
    // Invalidates an in-flight state probe before any caller can track new input.
    this.terminalSteerSettlement = null;
    for (const pending of this.pending.splice(0)) {
      if (queue !== undefined && pending.queue !== queue) {
        this.pending.push(pending);
      } else {
        pending.reject(new Error(message));
      }
    }
  }

  private observeQueue(queue: PiInputQueue, queuedTexts: readonly string[]): void {
    const lastObserved = this.lastObservedQueues[queue];
    const added = listMultisetDifference(queuedTexts, lastObserved);
    const removed = listMultisetDifference(lastObserved, queuedTexts);
    this.lastObservedQueues[queue] = [...queuedTexts];
    for (const queuedText of added) {
      const pending = this.pending.find(
        (entry) => entry.queue === queue && entry.queuedText === null,
      );
      if (!pending) break;
      pending.queuedText = queuedText;
    }
    for (const queuedText of removed) {
      const pending = this.pending.find(
        (entry) => entry.queue === queue && entry.queuedText === queuedText,
      );
      if (pending) this.acknowledge(pending);
    }
  }

  private scheduleTerminalSteerSettlement(): void {
    if (
      !this.pending.some((entry) => entry.queue === "steering") ||
      this.terminalSteerSettlement !== null
    )
      return;
    const streaming = this.readStreaming();
    if (!streaming) return;
    const settlement = streaming
      .catch(() => false)
      .then((isStreaming) => {
        if (this.terminalSteerSettlement !== settlement) return;
        this.terminalSteerSettlement = null;
        if (this.autoRetryInProgress || isStreaming) return;
        this.rejectPending("Pi turn ended before steer was consumed", "steering");
      });
    this.terminalSteerSettlement = settlement;
  }

  private acknowledge(pending: PendingInput, error?: Error): void {
    const index = this.pending.indexOf(pending);
    if (index === -1) return;
    this.pending.splice(index, 1);
    if (error) pending.reject(error);
    else pending.resolve();
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function listMultisetDifference(source: readonly string[], subtract: readonly string[]): string[] {
  const remaining = [...subtract];
  const difference: string[] = [];
  for (const entry of source) {
    const index = remaining.indexOf(entry);
    if (index === -1) difference.push(entry);
    else remaining.splice(index, 1);
  }
  return difference;
}
