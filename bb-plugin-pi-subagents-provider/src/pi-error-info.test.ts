import { expect, it } from "vitest";
import { isContextOverflow, type AssistantMessage } from "@earendil-works/pi-ai";
import { piErrorInfo } from "./pi-error-info.js";

it.each([
  "request_too_large",
  "Input length (265330) exceeds model's maximum context length (262144).",
  "The input token count (1196265) exceeds the maximum number of tokens allowed (1048575)",
  "Please reduce the length of the messages or completion",
  "Input length 200 exceeds the maximum allowed input length of 100 tokens.",
  "context window exceeds limit",
  "Range of input length should be [1, 100]",
  "too many tokens",
  "Throttling error: Too many tokens, please wait before trying again.",
  "Service unavailable: too many tokens",
  "rate limit: too many tokens",
])("keeps standalone overflow classification aligned with pinned Pi for %s", (errorMessage) => {
  const message = { stopReason: "error", errorMessage, provider: "pi" } as AssistantMessage;
  expect(piErrorInfo(errorMessage).category === "context-window-exceeded").toBe(
    isContextOverflow(message),
  );
});

it.each([
  ["Monthly usage limit reached: 503", "unknown"],
  ["HTTP 429 insufficient_quota", "billing"],
  ["429 subscription_sharing_usage_limit_exceeded", "rate-limit"],
  ["HTTP 500 internal error", "internal"],
  ["socket connection was closed", "connection-failed"],
  ["subscription_sharing_user_unavailable", "connection-failed"],
  ["unrecognized failure", "unknown"],
])("preserves upstream error category for %s", (message, category) => {
  expect(piErrorInfo(message).category).toBe(category);
});
