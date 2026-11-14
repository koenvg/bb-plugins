import { experimental_buildBridgeToolCallContent as buildBridgeToolCallContent } from "@get-bb/plugin-sdk-runtime/provider-bridge";
import type { ImageContent } from "@earendil-works/pi-ai";
import {
  NO_REQUEST_TIMEOUT,
  PiRpcChild,
  PiRpcChildExitedError,
  type PiRpcChildExitInfo,
} from "./rpc-child.js";
import { PiSessionChannel, type SettlementReport } from "./session-channel.js";
import { runSettlementError } from "./run-settlement.js";
import { PiSessionInputs, type TrackedSessionInput } from "./session-inputs.js";
import { spawnPiSessionChild } from "./session-launch.js";
import { createInspectionChannel } from "./subagents/inspection-channel.js";
import { type CaptureTarget } from "./subagents/capture.js";
import { createSessionModelReader } from "./subagents/session-model.js";

export interface PiRpcSessionOptions {
  cwd: string;
  model?: { provider: string; id: string };
  thinkingLevel?: string;
  serviceTier?: string;
  additionalSkillPaths?: readonly string[];
  shellEnvOverrides?: Record<string, string>;
  dynamicTools?: readonly DynamicToolDefinition[];
  sessionFilePath: string;
  generation?: number;
  sessionDir: string;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  scratchDir: string;
  extensionPath: string;
  recordThreadId: string;
  noSession?: boolean;
  onExtensionUiRequest?: (request: Record<string, unknown>) => void;
  onSubagentHint?: (readyRunId?: string) => void;
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
  boundaryDelivered?: boolean;
  error?: unknown;
  /** Recheck private-command completion at the bridge's settlement boundary. */
  canSettle?: () => boolean;
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
const PI_COMPACTION_PROMPT_MAX_RETRIES = 8;
function isPiCompactionPromptRejection(error: unknown): boolean {
  return (
    error instanceof Error &&
    !(error instanceof PiRpcChildExitedError) &&
    error.message.startsWith("Cannot submit a prompt while compaction is in progress.")
  );
}
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
  private modelChild: PiRpcChild | undefined;
  private readonly sessionModels: ReturnType<typeof createSessionModelReader>;
  private nativeRunActive = false;
  private get isProcessing(): boolean {
    return (
      this.nativeRunActive ||
      this.isCompacting ||
      this.piManualCompactionActive ||
      this.pendingRunSettlements.length > 0
    );
  }
  private agentRunsStarted = 0;
  private agentRunsSettled = 0;
  private readonly runs = new Map<
    number,
    {
      end?: PiRpcEvent;
      leafId?: string | null;
      recoveryError?: string;
      overflowRecovered?: boolean;
    }
  >();
  private deliveredRunActive = false;
  private piManualCompactionActive = false;
  private piManualCompactionWaiters: (() => void)[] = [];
  private get supportsSettlement(): boolean {
    return this.channel?.supportsSettlement === true;
  }

  private processingGeneration = 0;
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
  private serviceTier = "default";
  private readonly inspections = createInspectionChannel({
    context: () => this.channelRequest({ method: "subagent-inspection-context" }, 1500),
    command: (message) => this.requireChild().requestOk({ type: "prompt", message }, 2500),
    current: () => !this.closed && !!this.child && !this.child.exited,
    epoch: () => this.child,
  });

  constructor(
    private readonly options: PiRpcSessionOptions,
    private readonly forwardToolCall: ToolCallForwarder,
    private readonly onEvent: PiSessionEventHandler,
    private readonly onDone: PiSessionDoneHandler,
  ) {
    this.serviceTier = options.serviceTier ?? "default";
    this.sessionModels = createSessionModelReader({
      parentFile: options.sessionFilePath,
      env: process.env,
      generation: options.generation ?? -1,
      current: () =>
        !this.closed &&
        !!this.modelChild &&
        this.child === this.modelChild &&
        !this.modelChild.exited,
      context: () => this.channelRequest({ method: "subagent-inspection-context" }, 250),
    });
  }

  getIsCompacting(): boolean {
    return this.isCompacting;
  }

  readSubagentStatus(): Promise<unknown> {
    return this.channelRequest({ method: "subagent-status" }, 3000);
  }
  subagentCurrent(target: CaptureTarget): boolean {
    return (
      !this.closed &&
      !!this.child &&
      !this.child.exited &&
      target.sessionFile === this.options.sessionFilePath &&
      (this.options.generation === undefined || target.generation === this.options.generation)
    );
  }
  async inspectSubagent(target: CaptureTarget, requestId: string): Promise<unknown> {
    const child = this.child;
    if (!this.subagentCurrent(target)) throw new Error("Inspection session replaced");
    const result = await this.inspections.inspect(target, requestId);
    if (child !== this.child || !this.subagentCurrent(target))
      throw new Error("Inspection session replaced");
    return result;
  }
  resolveSubagentModel(target: CaptureTarget, signal: AbortSignal) {
    return this.sessionModels.resolve(target, signal);
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
    if (this.channel.supportsSpeed) {
      await this.channelRequest({ method: "speed-restore", serviceTier: this.serviceTier });
    }
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
    this.modelChild ??= child;
    return { ok: true };
  }

  async getState(timeoutMs?: number): Promise<PiRpcSessionState> {
    const data = await this.requireChild().requestOk({ type: "get_state" }, timeoutMs);
    const state = (data ?? {}) as PiRpcSessionState;
    this.liveModel = state.model;
    return state;
  }

  setServiceTier(serviceTier: string): void {
    this.serviceTier = serviceTier;
  }

  private async runSpeedCommand(action: string): Promise<void> {
    if (action !== "refresh")
      throw new Error(
        "Choose Default or Fast in the BB speed selector. Only /speed refresh is supported.",
      );
    if (!this.channel.supportsSpeed)
      throw new Error("Speed control is unavailable. Select Default.");
    await this.channelRequest({ method: "speed-refresh" });
  }

  speedCommand(action: string): PiInputDispatch {
    const duringTurn = this.isProcessing;
    const processingGeneration = this.processingGeneration;
    const dispatch = this.runSpeedCommand(action).then(() => ({
      consumed: Promise.resolve(),
      settled: Promise.resolve(
        duringTurn
          ? null
          : {
              canSettle: () =>
                !this.isProcessing && this.processingGeneration === processingGeneration,
            },
      ),
    }));
    return {
      consumed: dispatch.then((run) => run.consumed),
      settled: dispatch.then(
        (run) => run.settled,
        () => null,
      ),
    };
  }

  prompt(text: string, images?: ImageContent[]): PiInputDispatch {
    const dispatch = this.prepareSpeed().then(() => this.dispatchPrompt(text, images));
    return {
      consumed: dispatch.then((run) => run.consumed),
      settled: dispatch.then(
        (run) => run.settled,
        () => null,
      ),
    };
  }

  private async prepareSpeed(): Promise<void> {
    if (!this.channel.supportsSpeed) {
      if (this.serviceTier !== "default")
        throw new Error("Speed control is unavailable. Select Default in the BB speed selector.");
      return;
    }
    await this.channelRequest({ method: "speed-select", serviceTier: this.serviceTier });
  }

  private dispatchPrompt(text: string, images?: ImageContent[]): PiInputDispatch {
    const child = this.child;
    if (this.closed || !child || child.exited) {
      const consumed = Promise.reject(new Error("No active Pi session"));
      void consumed.catch(() => undefined);
      return { consumed, settled: Promise.resolve(null) };
    }
    this.processingGeneration += 1;
    const tracked = this.inputs.track("followUp");
    let pendingRun!: PendingRunSettlement;
    const settlement = new Promise<PiPromptRunOutcome>((resolve) => {
      pendingRun = { resolve };
      this.pendingRunSettlements.push(pendingRun);
    });
    const settled = this.dispatchPromptAfterManualCompaction(
      child,
      {
        type: "prompt",
        message: text,
        ...(images && images.length > 0 ? { images } : {}),
        streamingBehavior: "followUp",
      },
      tracked,
    ).then(
      async (): Promise<PiPromptRunOutcome | null> => {
        if (tracked.wasQueued) {
          this.dropRunSettlement(pendingRun);
          return null;
        }
        tracked.acknowledge();
        const outcome = await settlement;
        return outcome;
      },
      (error: unknown): PiPromptRunOutcome | null => {
        this.dropRunSettlement(pendingRun);
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
    await this.prepareSpeed();
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
    await this.prepareSpeed();
    const completionCount = this.manualCompactionCompletionCount;
    this.processingGeneration += 1;
    this.isCompacting = true;
    try {
      await child.requestOk({ type: "compact" }, 10 * 60_000);
    } catch (error) {
      if (this.manualCompactionCompletionCount === completionCount) {
        throw error;
      }
    } finally {
      this.isCompacting = false;
    }
    await this.lastCompactionEndDelivery;
  }

  async closeGracefully(timeoutMs: number): Promise<string | undefined> {
    this.inspections.dispose();
    this.sessionModels.dispose();
    const child = this.child;
    this.inputs.rejectPending("Pi session closed before input was consumed");
    this.closed = true;
    this.releasePiManualCompactionWaiters();
    if (!child || child.exited) {
      return this.lastKnownLeafId ?? undefined;
    }
    const deadline = Date.now() + timeoutMs;
    await child
      .request({ type: "abort" }, Math.max(1, Math.floor(timeoutMs / 2)))
      .catch(() => undefined);
    await this.refreshLeafId(Math.max(1, deadline - Date.now())).catch(() => undefined);
    child.closeGracefully();
    this.nativeRunActive = false;
    this.isCompacting = false;
    return this.lastKnownLeafId ?? undefined;
  }

  kill(): void {
    this.closed = true;
    this.inspections.dispose();
    this.sessionModels.dispose();
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
      session.closed = true;
      session.child?.closeGracefully();
      await session.child?.waitForExit();
    }
  }

  private requireChild(): PiRpcChild {
    if (!this.child || this.child.exited) {
      throw new Error("No active Pi session");
    }
    return this.child;
  }

  private async dispatchPromptAfterManualCompaction(
    child: PiRpcChild,
    command: Record<string, unknown>,
    pending: Pick<TrackedSessionInput, "acceptLocally">,
  ): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      if (this.piManualCompactionActive) {
        pending.acceptLocally();
        await this.waitForPiManualCompactionEnd();
      }
      if (this.closed) {
        throw new Error("Pi session closed before queued input was sent");
      }
      try {
        await this.prepareSpeed();
        await this.dispatchWithTransientAuthRetry(child, command, NO_REQUEST_TIMEOUT);
        return;
      } catch (error) {
        if (!isPiCompactionPromptRejection(error) || attempt >= PI_COMPACTION_PROMPT_MAX_RETRIES) {
          throw error;
        }
        pending.acceptLocally();
        if (!this.piManualCompactionActive) {
          await waitForPiTransientAuthRetry();
        }
      }
    }
  }

  private waitForPiManualCompactionEnd(): Promise<void> {
    if (!this.piManualCompactionActive || this.closed) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.piManualCompactionWaiters.push(resolve);
    });
  }

  private releasePiManualCompactionWaiters(): void {
    this.piManualCompactionActive = false;
    for (const resolve of this.piManualCompactionWaiters.splice(0)) {
      resolve();
    }
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
    if (event.type === "agent_settled" && this.supportsSettlement) {
      void this.deliverInOrder(async () => {
        this.deliverSettlement(await this.channel.takeAgentSettledLeaf());
      });
      return;
    }
    this.trackProcessingState(event);
    this.inputs.observe(event, this.supportsSettlement);
    if (event.type === "agent_start" && this.supportsSettlement) {
      const runId = this.agentRunsStarted;
      void this.deliverInOrder(async () => {
        const report = await this.channel.takeAgentStart();
        if (!report || report.runId !== runId) {
          this.failSettlementProtocol();
          return;
        }
        if (report.previousSettlement) this.deliverSettlement(report.previousSettlement);
        if (this.closed) return;
        if (this.deliveredRunActive) this.reportSupersededRunFailure(runId - 1);
        else this.onEvent(event);
        this.deliveredRunActive = true;
      });
      return;
    }
    if (event.type === "agent_end") {
      const runId = this.agentRunsStarted;
      const observedRun = this.runs.get(runId);
      if (observedRun) observedRun.end = event;
      void this.deliverInOrder(async () => {
        const leafId = await this.channel.takeAgentEndLeaf();
        if (leafId !== null) this.lastKnownLeafId = leafId;
        const run = this.runs.get(runId) ?? {};
        run.end = event;
        run.leafId = leafId;
        this.runs.set(runId, run);
        this.onEvent({
          ...event,
          ...(this.supportsSettlement ? { deferSettlement: true } : {}),
          ...(leafId === null ? {} : { providerCheckpointId: leafId }),
        });
        if (!this.supportsSettlement) {
          this.settleRun(event);
          if (event.willRetry !== true) this.retireRunsThrough(runId);
        }
      });
      return;
    }
    const run = this.runs.get(this.agentRunsStarted);
    const messages = run?.end?.messages;
    const assistant = Array.isArray(messages)
      ? [...messages]
          .reverse()
          .find(
            (message: unknown): message is Record<string, unknown> =>
              typeof message === "object" &&
              message !== null &&
              "role" in message &&
              message.role === "assistant",
          )
      : undefined;
    if (
      run?.end &&
      event.type === "compaction_end" &&
      event.reason === "overflow" &&
      event.willRetry === true
    ) {
      run.overflowRecovered = true;
    }
    if (
      run &&
      event.type === "compaction_end" &&
      event.reason === "overflow" &&
      event.willRetry === false &&
      (assistant?.stopReason === "length" ||
        assistant?.stopReason === "error" ||
        assistant?.stopReason === "aborted")
    ) {
      if (event.aborted === true) {
        run.recoveryError = "Automatic context compaction was interrupted";
      } else if (typeof event.errorMessage === "string") {
        run.recoveryError = event.errorMessage.trim() || "Automatic context compaction failed";
      }
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
    void this.deliverInOrder(() => {
      this.onEvent(event);
    });
  }

  private deliverInOrder(deliver: () => void | Promise<void>): Promise<void> {
    const next = this.deliveryChain.then(deliver, deliver);
    this.deliveryChain = next.catch(() => undefined);
    return this.deliveryChain;
  }

  private failSettlementProtocol(): void {
    if (this.closed) return;
    this.closed = true;
    this.nativeRunActive = false;
    const error = new Error("Pi extension settlement identity is missing or invalid");
    this.onDone(error);
    for (const pending of this.pendingRunSettlements.splice(0)) {
      pending.resolve({ boundaryDelivered: true, error });
    }
    this.inputs.rejectPending(error.message);
    this.child?.kill();
  }

  private deliverSettlement(report: SettlementReport | null): void {
    if (this.closed) return;
    if (!report) {
      this.failSettlementProtocol();
      return;
    }
    const { runId, leafId, event } = report;
    if (runId <= this.agentRunsSettled) return;
    const run = this.runs.get(runId);
    if (!run?.end) {
      this.failSettlementProtocol();
      return;
    }
    const messages = run.end.messages ?? [];
    const error = run.recoveryError ?? runSettlementError(event, messages);
    const checkpoint = leafId ?? run.leafId;
    const finalEvent: PiRpcEvent = {
      type: "agent_end",
      messages,
      settlementOnly: true,
      ...(error ? { settlementError: error } : {}),
      ...(run.recoveryError === undefined ? {} : { settlementErrorReported: true }),
      ...(checkpoint ? { providerCheckpointId: checkpoint } : {}),
    };
    if (this.agentRunsStarted === runId) this.nativeRunActive = false;
    this.agentRunsSettled = runId;
    this.deliveredRunActive = false;
    this.retireRunsThrough(runId);
    this.onEvent(finalEvent);
    this.onEvent({ ...event, type: "agent_settled" });
    this.settleRun(finalEvent);
    if (this.agentRunsStarted === runId) this.inputs.settleTerminalSteer();
  }

  private reportSupersededRunFailure(runId: number): void {
    const run = this.runs.get(runId);
    if (
      !run?.end ||
      run.end.willRetry === true ||
      run.overflowRecovered === true ||
      run.recoveryError !== undefined
    ) {
      return;
    }
    const error = runSettlementError(run.end, run.end.messages);
    if (!error) return;
    this.onEvent({
      type: "agent_end",
      messages: [],
      deferSettlement: true,
      settlementSuperseded: true,
      settlementError: error,
    });
  }

  private retireRunsThrough(runId: number): void {
    for (const id of this.runs.keys()) {
      if (id <= runId) this.runs.delete(id);
    }
  }

  private settleRun(event: PiRpcEvent): void {
    if (event.willRetry === true) {
      return;
    }
    const pending = this.pendingRunSettlements.shift();
    if (!pending) {
      return;
    }
    const error =
      typeof event.settlementError === "string"
        ? event.settlementError
        : runSettlementError(event, event.messages);
    pending.resolve({
      boundaryDelivered: true,
      ...(error ? { error: new Error(error) } : {}),
    });
  }

  private dropRunSettlement(pending: PendingRunSettlement): void {
    const index = this.pendingRunSettlements.indexOf(pending);
    if (index !== -1) this.pendingRunSettlements.splice(index, 1);
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
      void this.sessionModels.observe(message.evidence).then((readyRunId) => {
        if (readyRunId && !this.closed && this.child === this.modelChild && !this.child?.exited)
          this.options.onSubagentHint?.(readyRunId);
      });
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
    this.sessionModels.dispose();
    this.options.onProcessExit?.();
    const wasClosed = this.closed;
    this.closed = true;
    this.channel.dispose(new PiRpcChildExitedError(info));
    this.inputs.rejectPending("Pi exited before input was consumed");
    for (const pending of this.pendingRunSettlements.splice(0)) {
      pending.resolve({ error: new PiRpcChildExitedError(info) });
    }
    this.nativeRunActive = false;
    this.isCompacting = false;
    this.releasePiManualCompactionWaiters();
    if (!wasClosed) {
      this.onDone(new PiRpcChildExitedError(info));
    }
  }

  private trackProcessingState(event: PiRpcEvent): void {
    if (
      event.type === "agent_start" ||
      (event.type === "compaction_start" && event.reason === "manual")
    ) {
      this.processingGeneration += 1;
    }
    if (event.type === "compaction_start" && event.reason === "manual") {
      this.piManualCompactionActive = true;
    }
    if (event.type === "agent_start") {
      this.nativeRunActive = true;
      this.agentRunsStarted += 1;
      this.runs.set(this.agentRunsStarted, {});
    }
    if (!this.supportsSettlement && event.type === "agent_end" && event.willRetry !== true) {
      this.nativeRunActive = false;
    }
    if (event.type === "compaction_end" && event.reason === "manual") {
      this.releasePiManualCompactionWaiters();
    }
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
