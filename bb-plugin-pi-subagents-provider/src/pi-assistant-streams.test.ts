import { expect, it } from "vitest";
import { PiAssistantStreams } from "./pi-assistant-streams.js";

it.each(["before", "after"])(
  "preserves message closure when thinking ends %s it is consumed",
  (order) => {
    const streams = new PiAssistantStreams();
    const context = { threadId: "thread", parentToolCallId: "child" };
    streams.appendThinking(context, 0);
    streams.markMessageClosed(context);
    if (order === "before") streams.finishThinking(context, 0);
    expect(streams.takeMessageClosed(context)).toBe(true);
    if (order === "after") streams.finishThinking(context, 0);
    expect(streams.takeMessageClosed(context)).toBe(false);
    expect(streams.start(context)).toEqual([
      {
        kind: "item.textClose",
        key: { channel: "assistant", parentRef: "child" },
        channel: "agentMessage",
      },
    ]);
  },
);
