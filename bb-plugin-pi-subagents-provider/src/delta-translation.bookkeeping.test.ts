import { describe, expect, it } from "vitest";
import { createPiDeltaTranslator } from "./delta-translation.js";

function sdkMessage(message: unknown) {
  return {
    jsonrpc: "2.0" as const,
    method: "sdk/message",
    params: { threadId: "pi-thread-1", message, parent_tool_use_id: "parent-tool-1" },
  };
}

function customEntry(overrides: Record<string, unknown> = {}) {
  return {
    type: "custom",
    id: "c0de1234",
    parentId: "abcd1234",
    timestamp: "2026-06-29T10:00:00.000Z",
    customType: "codemode-store",
    data: { stored: "retained in Pi", nested: [1, "useful raw body"] },
    ...overrides,
  };
}

function createTranslator() {
  return createPiDeltaTranslator({ resolveModelContextWindow: () => null });
}

const reviewedCustomTypes = [
  "codemode-store",
  "token-audit:report",
  "token-audit:usage",
  "token-audit:watch",
  "com.openforge.codex-usage.confirmation.v2",
];

describe("reviewed bookkeeping translation", () => {
  it.each(reviewedCustomTypes)("does not resurrect bare or wrapped %s appends", (customType) => {
    const translator = createTranslator();
    for (const parentId of ["abcd1234", null]) {
      const message = { type: "entry_appended", entry: customEntry({ customType, parentId }) };
      const before = JSON.stringify(message);
      expect(translator.translate(message)).toEqual([]);
      expect(translator.translate(sdkMessage(message))).toEqual([]);
      expect(JSON.stringify(message)).toBe(before);
    }
    const unreviewed = sdkMessage({
      type: "entry_appended",
      entry: customEntry({ customType: "future-extension:state" }),
    });
    expect(translator.translate(unreviewed)).toEqual([
      {
        kind: "unhandled",
        raw: unreviewed,
        rawType: "sdk/unknown",
        vouchedTurn: true,
        parentRef: "parent-tool-1",
      },
    ]);
  });

  it.each([
    null,
    [],
    "codemode-store",
    {},
    { type: "custom", customType: "codemode-store" },
    customEntry({ id: null }),
    customEntry({ id: "" }),
    customEntry({ parentId: false }),
    customEntry({ parentId: "" }),
    customEntry({ timestamp: 1782727200000 }),
    customEntry({ timestamp: "not-a-date" }),
    customEntry({ timestamp: "2026-02-30T10:00:00.000Z" }),
    customEntry({ customType: null }),
  ])("retains the full raw body for malformed entry %#", (entry) => {
    const event = sdkMessage({ type: "entry_appended", entry });
    expect(createTranslator().translate(event)).toEqual([
      {
        kind: "unhandled",
        raw: event,
        rawType: "sdk/unknown",
        vouchedTurn: true,
        parentRef: "parent-tool-1",
      },
    ]);
  });

  it.each([
    { type: "entry_appended" },
    { type: "future_event", entry: customEntry(), useful: { result: "Do not lose me" } },
    { type: "entry_appended", entry: customEntry({ customType: "token-audit:command" }) },
    { type: "entry_appended", entry: customEntry({ customType: "codemode-store:visible" }) },
    { type: "entry_appended", entry: customEntry({ customType: "token-audit:usage-extra" }) },
    { type: "entry_appended", entry: customEntry({ customType: "codemode-store " }) },
    { type: "entry_appended", entry: customEntry({ customType: "CODEMODE-STORE" }) },
    { type: "entry_appended", entry: customEntry({ customType: "subagent-watchdog:warning" }) },
    { type: "entry_appended", entry: customEntry({ customType: "intercom:supervisor-reply" }) },
    { type: "entry_appended", entry: customEntry({ customType: "pending-completion" }) },
    {
      type: "entry_appended",
      entry: customEntry({ customType: "com.openforge.codex-usage.confirmation.v3" }),
    },
    {
      type: "entry_appended",
      entry: customEntry({
        type: "custom_message",
        display: true,
        content: "Visible command result",
      }),
    },
    {
      type: "entry_appended",
      entry: customEntry({ type: "message", message: { role: "assistant", content: "Result" } }),
    },
    {
      type: "entry_appended",
      entry: customEntry({
        type: "message",
        message: { role: "toolResult", content: "Tool result" },
      }),
    },
    { type: "entry_appended", entry: customEntry({ type: "compaction", summary: "Keep summary" }) },
    { type: "entry_appended", entry: customEntry({ type: "context_edit", details: "Keep edit" }) },
  ])("retains unknown, unreviewed and noncustom appends with raw body %#", (message) => {
    const event = sdkMessage(message);
    expect(createTranslator().translate(event)).toEqual([
      {
        kind: "unhandled",
        raw: event,
        rawType: "sdk/unknown",
        vouchedTurn: true,
        parentRef: "parent-tool-1",
      },
    ]);
  });

  it("still translates visible custom messages even with a reviewed customType", () => {
    expect(
      createTranslator().translate(
        sdkMessage({
          type: "message_start",
          message: {
            role: "custom",
            customType: "token-audit:report",
            content: "Visible token audit result",
            display: true,
          },
        }),
      ),
    ).toEqual([
      { kind: "input.provider", text: "Visible token audit result", parentRef: "parent-tool-1" },
    ]);
  });
});
