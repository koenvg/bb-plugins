import type { ThreadDelta } from "@get-bb/plugin-sdk-runtime/provider-bridge";

interface StreamContext {
  threadId?: string;
  parentToolCallId?: string;
}

interface AssistantStream {
  messageClosed: boolean;
  thinking: Set<number>;
}

export const ASSISTANT_STREAM_KEY = "assistant";

export function thinkingStreamChannel(contentIndex: number): string {
  return `thinking-${contentIndex}`;
}

export class PiAssistantStreams {
  private readonly streams = new Map<string, AssistantStream>();

  start(context?: StreamContext): ThreadDelta[] {
    const key = this.key(context);
    const previous = this.streams.get(key);
    this.streams.delete(key);
    const parentRef = context?.parentToolCallId;
    const parent = parentRef ? { parentRef } : {};
    return [
      ...[...(previous?.thinking ?? [])].map((index): ThreadDelta => ({
        kind: "item.textClose",
        key: { channel: thinkingStreamChannel(index), ...parent },
        channel: "reasoningText",
      })),
      {
        kind: "item.textClose",
        key: { channel: ASSISTANT_STREAM_KEY, ...parent },
        channel: "agentMessage",
      },
    ];
  }

  markMessageClosed(context?: StreamContext): void {
    this.state(context).messageClosed = true;
  }

  takeMessageClosed(context?: StreamContext): boolean {
    const key = this.key(context);
    const state = this.streams.get(key);
    if (!state?.messageClosed) return false;
    state.messageClosed = false;
    if (state.thinking.size === 0) this.streams.delete(key);
    return true;
  }

  appendThinking(context: StreamContext | undefined, index: number): void {
    this.state(context).thinking.add(index);
  }

  finishThinking(context: StreamContext | undefined, index: number): void {
    const key = this.key(context);
    const state = this.streams.get(key);
    if (!state) return;
    state.thinking.delete(index);
    if (!state.messageClosed && state.thinking.size === 0) this.streams.delete(key);
  }

  resetThread(threadId: string): void {
    const prefix = `${threadId} `;
    for (const key of this.streams.keys()) {
      if (key.startsWith(prefix)) this.streams.delete(key);
    }
  }

  private state(context: StreamContext | undefined): AssistantStream {
    const key = this.key(context);
    let state = this.streams.get(key);
    if (!state) {
      state = { messageClosed: false, thinking: new Set() };
      this.streams.set(key, state);
    }
    return state;
  }

  private key(context: StreamContext | undefined): string {
    return `${context?.threadId ?? ""} ${context?.parentToolCallId ?? ""}`;
  }
}
