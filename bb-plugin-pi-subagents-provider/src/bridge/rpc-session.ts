import { experimental_buildBridgeToolCallContent as buildBridgeToolCallContent } from "@get-bb/plugin-sdk-runtime/provider-bridge";
import type { ImageContent } from "@earendil-works/pi-ai";
import {
  NO_REQUEST_TIMEOUT,
  PiRpcChild,
  PiRpcChildExitedError,
  type PiRpcChildExitInfo,
} from "./rpc-child.js";
import { PiSessionChannel } from "./session-channel.js";
import { PiSessionInputs } from "./session-inputs.js";
import { spawnPiSessionChild } from "./session-launch.js";
import { createInspectionChannel } from "./subagents/inspection-channel.js";
import { type CaptureTarget } from "./subagents/capture.js";

export interface PiRpcSessionOptions {
  cwd: string;
  model?: { provider: string; id: string };
  thinkingLevel?: string;
  additionalSkillPaths?: readonly string[];
  shellEnvOverrides?: Record<string, string>;
  dynamicTools?: readonly DynamicToolDefinition[];
  sessionFilePath: string;
  sessionDir: string;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  scratchDir: string;
  extensionPath: string;
  recordThreadId: string;
  noSession?: boolean;
  onExtensionUiRequest?: (request: Record<string, unknown>) => void;
  onSubagentHint?: () => void;
  onProcessExit?: () => void;
}

export interface DynamicToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
}

export type ToolCallForwarder = (
  toolName: string,
  args: Record<string, unknown>,
) => Promise<Parameters<typeof buildBridgeToolCallContent>[0] & { isError?: boolean }>;

export type PiRpcEvent = Record<string, unknown> & { type: string };
type PiSessionEventHandler = (event: PiRpcEvent) => void;
type PiSessionDoneHandler = (error?: unknown) => void;

export interface PiPromptRunOutcome {
  error?: unknown;
}

export interface PiInputDispatch {
  consumed: Promise<void>;
  settled: Promise<PiPromptRunOutcome | null>;
}

interface PendingRunSettlement {
  resolve: (outcome: PiPromptRunOutcome) => void;
}

const PI_TRANSIENT_AUTH_RETRY_DELAY_MS = 250;
const PI_TRANSIENT_AUTH_MAX_RETRIES = 8;
function readinessTimeoutMs(): number {
  const configured = Number(process.env.BB_PI_BRIDGE_READINESS_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 60_000;
}
const CHANNEL_REQUEST_TIMEOUT_MS = 30_000;

type PiSessionConstructionOutcome = { ok: true } | { ok: false; error: Error };

function waitForPiTransientAuthRetry(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, PI_TRANSIENT_AUTH_RETRY_DELAY_MS));
}

export async function runPiTransientAuthConstruction(args: {
  attempt: () => Promise<PiSessionConstructionOutcome>;
  discardFailedAttempt: () => void;
  isClosed: () => boolean;
  waitBeforeRetry: () => Promise<void>;
}): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    const outcome = await args.attempt();
    if (outcome.ok) {
      return;
    }
    if (attempt >= PI_TRANSIENT_AUTH_MAX_RETRIES || args.isClosed()) {
      throw outcome.error;
    }
    args.discardFailedAttempt();
    await args.waitBeforeRetry();
  }
}

export interface PiRpcSessionState {
  model?: { provider?: string; id?: string; contextWindow?: number };
  thinkingLevel?: string;
  isStreaming: boolean;
  isCompacting: boolean;
  sessionFile?: string;
}

export class PiRpcSession {
  private child: PiRpcChild | undefined;
  private isProcessing = false;
  private isCompacting = false;
  private manualCompactionCompletionCount = 0;
  private lastCompactionEndDelivery: Promise<void> = Promise.resolve();
  private deliveryChain: Promise<void> = Promise.resolve();
  private readonly inputs = new PiSessionInputs(() => {
    const child = this.child;
    if (!child || child.exited) return null;
    return child
      .request({ type: "get_state" })
      .then(
        (response) =>
          (response.data as Partial<PiRpcSessionState> | undefined)?.isStreaming === true,
      );
  });
  private readonly pendingRunSettlements: PendingRunSettlement[] = [];
  private channel!: PiSessionChannel;
  private lastKnownLeafId: string | null = null;
  private lastContextUsage: {
    tokens: number | null;
    contextWindow: number;
  } | null = null;
  private liveModel: PiRpcSessionState["model"] | undefined;
  private closed = false;
  private readonly inspections = createInspectionChannel({
    context: () => this.channelRequest({ method: "subagent-inspection-context" }, 1500),
    command: (message) => this.requireChild().requestOk({ type: "prompt", message }, 2500),
    current: () => !this.closed && !!this.child,
  });

  constructor(
    private readonly options: PiRpcSessionOptions,
    private readonly forwardToolCall: ToolCallForwarder,
    private readonly onEvent: PiSessionEventHandler,
    private readonly onDone: PiSessionDoneHandler,
  ) {}

  getIsCompacting(): boolean {
    return this.isCompacting;
  }

  readSubagentStatus(): Promise<unknown> {
    return this.channelRequest({ method: "subagent-status" }, 3000);
  }
  inspectSubagent(target: CaptureTarget, requestId: string): Promise<unknown> {
    return this.inspections.inspect(target, requestId);
  }

  respondToExtensionUi(id: string | number, fields: Record<string, unknown>): void {
    this.child?.respondToExtensionUi(id, fields);
  }

  getLiveModel(): PiRpcSessionState["model"] | undefined {
    return this.liveModel;
  }

  getContextUsage(): { tokens: number | null; contextWindow: number } | null {
    return this.lastContextUsage;
  }

  async start(): Promise<void> {
    await runPiTransientAuthConstruction({
      attempt: () => this.spawnAndVerify(),
      discardFailedAttempt: () => {
        const failed = this.child;
        this.channel.dispose(new Error("Pi construction attempt discarded"));
        this.child = undefined;
        failed?.kill();
      },
      isClosed: () => this.closed,
      waitBeforeRetry: waitForPiTransientAuthRetry,
    });
  }

  private async spawnAndVerify(): Promise<PiSessionConstructionOutcome> {
    const onExtensionUiRequest = this.options.onExtensionUiRequest;
    const channel = new PiSessionChannel((message) => child.sendChannel(message));
    const child = spawnPiSessionChild(this.options, {
      onEvent: (event) => {
        if (child === this.child) this.handleEvent(event);
      },
      onChannelMessage: (message) => {
        if (child === this.child) this.handleChannelMessage(message);
      },
      onExit: (info) => {
        if (child === this.child) this.handleExit(info);
      },
      onExtensionUiRequest: onExtensionUiRequest
        ? (request) => {
            if (child === this.child && !this.inspections.widget(request))
              onExtensionUiRequest(request);
          }
        : undefined,
    });
    this.child = child;
    this.channel = channel;

    const state = await this.getState(CHANNEL_REQUEST_TIMEOUT_MS);
    if (child.exited) throw new Error("pi exited before its extension reported ready");
    await channel.awaitReady(readinessTimeoutMs());
    if (state.model?.provider === "unknown") {
      return {
        ok: false,
        error: new Error("Pi has no authenticated model provider available."),
      };
    }
    const wanted = this.options.model;
    if (wanted && (state.model?.provider !== wanted.provider || state.model?.id !== wanted.id)) {
      return {
        ok: false,
        error: new Error(
          `Pi did not start with model "${wanted.provider}/${wanted.id}"` +
            (state.model?.id
              ? ` (it chose "${String(state.model.provider)}/${String(state.model.id)}")`
              : "") +
            ". Check that the provider is authenticated.",
        ),
      };
    }
    return { ok: true };
  }

  async getState(timeoutMs?: number): Promise<PiRpcSessionState> {
    const data = await this.requireChild().requestOk({ type: "get_state" }, timeoutMs);
    const state = (data ?? {}) as PiRpcSessionState;
    this.liveModel = state.model;
    return state;
  }

  prompt(text: string, images?: ImageContent[]): PiInputDispatch {
    const child = this.child;
    if (!child || child.exited) {
      const consumed = Promise.reject(new Error("No active Pi session"));
      void consumed.catch(() => undefined);
      return { consumed, settled: Promise.resolve(null) };
    }
    this.isProcessing = true;
    const tracked = this.inputs.track("followUp");
    const settlement = new Promise<PiPromptRunOutcome>((resolve) => {
      this.pendingRunSettlements.push({ resolve });
    });
    const settled = this.dispatchWithTransientAuthRetry(
      child,
      {
        type: "prompt",
        message: text,
        ...(images && images.length > 0 ? { images } : {}),
        streamingBehavior: "followUp",
      },
      NO_REQUEST_TIMEOUT,
    ).then(
      async (): Promise<PiPromptRunOutcome | null> => {
        if (tracked.wasQueued) {
          this.dropRunSettlement();
          return null;
        }
        tracked.acknowledge();
        const outcome = await settlement;
        return outcome;
      },
      (error: unknown): PiPromptRunOutcome | null => {
        this.isProcessing = false;
        this.dropRunSettlement();
        const queued = tracked.wasQueued;
        tracked.acknowledge(asError(error));
        this.inputs.rejectPending("Pi prompt failed before input was consumed");
        this.onDone(error);
        return queued ? null : { error };
      },
    );
    return { consumed: tracked.consumed, settled };
  }

  async steer(text: string, images?: ImageContent[]): Promise<void> {
    const child = this.requireChild();
    const tracked = this.inputs.track("steering");
    try {
      await this.dispatchWithTransientAuthRetry(child, {
        type: "prompt",
        message: text,
        ...(images && images.length > 0 ? { images } : {}),
        streamingBehavior: "steer",
      });
    } catch (error) {
      tracked.acknowledge(asError(error));
      this.onDone(error);
      throw error;
    }
    if (!tracked.wasQueued) {
      tracked.acknowledge();
      return;
    }
    void tracked.consumed.catch((error) => {
      this.onDone(error);
    });
  }

  async compact(): Promise<void> {
    const child = this.requireChild();
    if (this.isProcessing) {
      throw new Error("Cannot compact context while Pi is processing a turn");
    }
    if ((await this.getState()).isStreaming) {
      throw new Error("Cannot compact context while Pi is processing a turn");
    }
    const completionCount = this.manualCompactionCompletionCount;
    this.isProcessing = true;
    this.isCompacting = true;
    try {
      await child.requestOk({ type: "compact" }, 10 * 60_000);
    } catch (error) {
      if (this.manualCompactionCompletionCount === completionCount) {
        throw error;
      }
    } finally {
      this.isProcessing = false;
      this.isCompacting = false;
    }
    await this.lastCompactionEndDelivery;
  }

  async closeGracefully(timeoutMs: number): Promise<string | undefined> {
    this.inspections.dispose();
    const child = this.child;
    this.inputs.rejectPending("Pi session closed before input was consumed");
    this.closed = true;
    if (!child || child.exited) {
      return this.lastKnownLeafId ?? undefined;
    }
    const deadline = Date.now() + timeoutMs;
    await child
      .request({ type: "abort" }, Math.max(1, Math.floor(timeoutMs / 2)))
      .catch(() => undefined);
    await this.refreshLeafId(Math.max(1, deadline - Date.now())).catch(() => undefined);
    child.closeGracefully();
    this.isProcessing = false;
    this.isCompacting = false;
    return this.lastKnownLeafId ?? undefined;
  }

  kill(): void {
    this.closed = true;
    this.inspections.dispose();
    this.child?.kill();
  }

  static async forkSessionFile(args: {
    sourceFile: string;
    targetFile: string;
    cwd: string;
    sessionDir: string;
    checkpointId?: string;
    extensionPath: string;
    scratchDir: string;
    recordThreadId: string;
  }): Promise<void> {
    const session = new PiRpcSession(
      {
        cwd: args.cwd,
        sessionFilePath: args.sourceFile,
        sessionDir: args.sessionDir,
        scratchDir: args.scratchDir,
        extensionPath: args.extensionPath,
        recordThreadId: args.recordThreadId,
        noSession: true,
      },
      () => Promise.resolve({ content: "fork helper has no tools", isError: true }),
      () => undefined,
      () => undefined,
    );
    try {
      await session.start();
      await session.channelRequest({
        method: "fork",
        sourceFile: args.sourceFile,
        targetFile: args.targetFile,
        cwd: args.cwd,
        sessionDir: args.sessionDir,
        ...(args.checkpointId === undefined ? {} : { checkpointId: args.checkpointId }),
      });
    } finally {
      session.kill();
    }
  }

  private requireChild(): PiRpcChild {
    if (!this.child || this.child.exited) {
      throw new Error("No active Pi session");
    }
    return this.child;
  }

  private async dispatchWithTransientAuthRetry(
    child: PiRpcChild,
    command: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await child.requestOk(command, timeoutMs);
        return;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error instanceof PiRpcChildExitedError ||
          !error.message.startsWith("No API key found for ") ||
          attempt >= PI_TRANSIENT_AUTH_MAX_RETRIES
        ) {
          throw error;
        }
        await waitForPiTransientAuthRetry();
      }
    }
  }

  private handleEvent(raw: Record<string, unknown>): void {
    if (typeof raw.type !== "string") {
      return;
    }
    const event = raw as PiRpcEvent;
    this.trackProcessingState(event);
    this.inputs.observe(event);
    const channel = this.channel;
    if (event.type === "agent_end") {
      this.deliverInOrder(async () => {
        const leafId = await channel.takeAgentEndLeaf();
        if (leafId !== null) {
          this.lastKnownLeafId = leafId;
        }
        this.onEvent({
          ...event,
          ...(this.lastKnownLeafId === null ? {} : { providerCheckpointId: this.lastKnownLeafId }),
        });
        this.settleRun(event);
      });
      return;
    }
    if (event.type === "turn_end" || event.type === "compaction_end") {
      const delivery = this.deliverInOrder(async () => {
        await this.refreshContextUsage().catch(() => undefined);
        this.onEvent(event);
      });
      if (event.type === "compaction_end" && event.reason === "manual") {
        this.manualCompactionCompletionCount += 1;
        this.lastCompactionEndDelivery = delivery;
      }
      return;
    }
    this.deliverInOrder(() => {
      this.onEvent(event);
    });
  }

  private deliverInOrder(deliver: () => void | Promise<void>): Promise<void> {
    const next = this.deliveryChain.then(deliver, deliver);
    this.deliveryChain = next.catch(() => undefined);
    return this.deliveryChain;
  }

  private settleRun(event: PiRpcEvent): void {
    if (event.willRetry === true) {
      return;
    }
    const pending = this.pendingRunSettlements.shift();
    if (!pending) {
      return;
    }
    const messages = Array.isArray(event.messages) ? event.messages : [];
    const last = messages[messages.length - 1] as
      | { role?: string; stopReason?: string; errorMessage?: string }
      | undefined;
    if (
      last?.role === "assistant" &&
      last.stopReason === "error" &&
      typeof last.errorMessage === "string"
    ) {
      pending.resolve({ error: new Error(last.errorMessage) });
      return;
    }
    pending.resolve({});
  }

  private dropRunSettlement(): void {
    this.pendingRunSettlements.pop();
  }

  private async refreshLeafId(timeoutMs = CHANNEL_REQUEST_TIMEOUT_MS): Promise<void> {
    const child = this.child;
    if (!child || child.exited) {
      return;
    }
    const data = (await this.channelRequest({ method: "leaf" }, timeoutMs)) as
      | { leafId?: string | null }
      | undefined;
    if (data && typeof data.leafId === "string") {
      this.lastKnownLeafId = data.leafId;
    }
  }

  private async refreshContextUsage(): Promise<void> {
    const child = this.child;
    if (!child || child.exited) {
      return;
    }
    const data = (await child.requestOk({ type: "get_session_stats" })) as
      | {
          contextUsage?: { tokens?: number | null; contextWindow?: number };
        }
      | undefined;
    const usage = data?.contextUsage;
    if (usage && typeof usage.contextWindow === "number") {
      this.lastContextUsage = {
        tokens: typeof usage.tokens === "number" ? usage.tokens : null,
        contextWindow: usage.contextWindow,
      };
    }
  }

  private handleChannelMessage(message: Record<string, unknown>): void {
    if (message.kind === "subagent-hint") {
      this.options.onSubagentHint?.();
      return;
    }
    const child = this.child;
    if (message.kind === "tool-call" && child) {
      const id = String(message.id);
      const toolName = String(message.toolName);
      const toolArgs =
        typeof message.arguments === "object" && message.arguments !== null
          ? (message.arguments as Record<string, unknown>)
          : {};
      void this.forwardToolCall(toolName, toolArgs).then(
        (result) => {
          child.sendChannel({
            kind: "tool-result",
            id,
            content: buildBridgeToolCallContent(result),
            isError: result.isError === true,
          });
        },
        (error: unknown) => {
          child.sendChannel({
            kind: "tool-result",
            id,
            content: [
              {
                type: "text",
                text: error instanceof Error ? error.message : String(error),
              },
            ],
            isError: true,
          });
        },
      );
      return;
    }
    this.channel.handle(message);
  }

  private channelRequest(
    request: Record<string, unknown>,
    timeoutMs = CHANNEL_REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    this.requireChild();
    return this.channel.request(request, timeoutMs);
  }

  private handleExit(info: PiRpcChildExitInfo): void {
    this.inspections.dispose();
    this.options.onProcessExit?.();
    this.channel.dispose(new PiRpcChildExitedError(info));
    this.inputs.rejectPending("Pi exited before input was consumed");
    for (const pending of this.pendingRunSettlements.splice(0)) {
      pending.resolve({ error: new PiRpcChildExitedError(info) });
    }
    this.isProcessing = false;
    this.isCompacting = false;
    if (!this.closed) {
      this.onDone(new PiRpcChildExitedError(info));
    }
  }

  private trackProcessingState(event: PiRpcEvent): void {
    if (
      event.type === "agent_start" ||
      (event.type === "compaction_start" && event.reason === "manual")
    ) {
      this.isProcessing = true;
    }
    if (event.type === "agent_end" && event.willRetry !== true) {
      this.isProcessing = false;
    }
    if (event.type === "compaction_end" && event.reason === "manual") {
      this.isProcessing = false;
    }
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
