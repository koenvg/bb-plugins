import { describe, expect, it } from "vitest";
import { piVisibilityMetadata } from "./visibility.js";

function sdkMessage(message: unknown) {
  return {
    jsonrpc: "2.0" as const,
    method: "sdk/message",
    params: { threadId: "pi-thread-1", message },
  };
}

function customEntry(overrides: Record<string, unknown> = {}) {
  return {
    type: "custom",
    id: "c0de1234",
    parentId: "abcd1234",
    timestamp: "2026-06-29T10:00:00.000Z",
    customType: "codemode-store",
    data: { stored: "retained in Pi" },
    ...overrides,
  };
}

const reviewedCustomTypes = [
  "codemode-store",
  "token-audit:report",
  "token-audit:usage",
  "token-audit:watch",
  "com.openforge.codex-usage.confirmation.v2",
];

const malformedEntries = [
  null,
  [],
  "codemode-store",
  {},
  { type: "custom", customType: "codemode-store" },
  customEntry({ type: null }),
  customEntry({ id: null }),
  customEntry({ id: "" }),
  customEntry({ id: " " }),
  customEntry({ id: 42 }),
  customEntry({ parentId: "" }),
  customEntry({ parentId: " " }),
  customEntry({ parentId: 42 }),
  customEntry({ timestamp: null }),
  customEntry({ timestamp: 1782727200000 }),
  customEntry({ timestamp: "" }),
  customEntry({ timestamp: "not-a-date" }),
  customEntry({ timestamp: "2026-02-30T10:00:00.000Z" }),
  customEntry({ customType: null }),
  customEntry({ customType: ["codemode-store"] }),
];

const preservedCustomTypes = [
  "token-audit:command",
  "subagent-watchdog:warning",
  "intercom:supervisor-reply",
  "pending-completion",
  "future-extension:state",
  "codemode-store:visible",
  "token-audit:usage-extra",
  "codemode-store ",
  "CODEMODE-STORE",
  "com.openforge.codex-usage.confirmation.v3",
];

const preservedEntryTypes = ["custom_message", "message", "compaction", "context_edit"];

describe("reviewed bookkeeping visibility", () => {
  it.each(reviewedCustomTypes)("classifies only reviewed %s appends as noise", (customType) => {
    for (const parentId of ["abcd1234", null]) {
      expect(
        piVisibilityMetadata.describeRawEvent(
          sdkMessage({ type: "entry_appended", entry: customEntry({ customType, parentId }) }),
        ),
      ).toEqual({ kind: "sdk/entry_appended:bookkeeping", coverage: "noise" });
    }
    expect(
      piVisibilityMetadata.describeRawEvent(
        sdkMessage({ type: "entry_appended", entry: customEntry({ customType: "visible-state" }) }),
      ),
    ).toEqual({ kind: "sdk/unknown", coverage: "unknown" });
  });

  it.each(malformedEntries)("preserves malformed entry %#", (entry) => {
    expect(
      piVisibilityMetadata.describeRawEvent(sdkMessage({ type: "entry_appended", entry })),
    ).toEqual({ kind: "sdk/unknown", coverage: "unknown" });
  });

  it.each([
    { type: "entry_appended" },
    { type: "entry_appended", entry: customEntry({ parent: "abcd1234", parentId: false }) },
    { type: "entry_appended", customType: "codemode-store", entry: { type: "custom" } },
    { type: "future_entry_appended", entry: customEntry() },
    { entry: customEntry() },
    null,
    [],
  ])("preserves malformed or different SDK envelope %#", (message) => {
    expect(piVisibilityMetadata.describeRawEvent(sdkMessage(message))).toEqual({
      kind: "sdk/unknown",
      coverage: "unknown",
    });
  });

  it.each(preservedCustomTypes)("preserves unreviewed %s", (customType) => {
    expect(
      piVisibilityMetadata.describeRawEvent(
        sdkMessage({ type: "entry_appended", entry: customEntry({ customType }) }),
      ),
    ).toEqual({ kind: "sdk/unknown", coverage: "unknown" });
  });

  it.each(preservedEntryTypes)("preserves %s appends even with a reviewed customType", (type) => {
    expect(
      piVisibilityMetadata.describeRawEvent(
        sdkMessage({
          type: "entry_appended",
          entry: customEntry({ type, content: "Visible result" }),
        }),
      ),
    ).toEqual({ kind: "sdk/unknown", coverage: "unknown" });
  });

  it("preserves missing persisted fields", () => {
    const { id, parentId, timestamp, ...entry } = customEntry();
    for (const incomplete of [
      { ...entry, parentId, timestamp },
      { ...entry, id, timestamp },
      { ...entry, id, parentId },
    ]) {
      expect(
        piVisibilityMetadata.describeRawEvent(
          sdkMessage({ type: "entry_appended", entry: incomplete }),
        ),
      ).toEqual({ kind: "sdk/unknown", coverage: "unknown" });
    }
  });
});
