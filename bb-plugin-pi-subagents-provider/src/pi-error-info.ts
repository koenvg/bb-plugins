/*!
MIT License

Copyright (c) 2025 Mario Zechner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import type { ProviderErrorInfo } from "@get-bb/plugin-sdk-runtime/provider-bridge";

// Pi 1.1.0 error patterns are kept local so production builds do not require Pi.
// Derived from @earendil-works/pi-ai under MIT. See ../vendor/pi-ai-LICENSE.
const OVERFLOW_PATTERNS = [
  /prompt (?:is )?too long/i,
  /prompt exceeds max length/i,
  /request_too_large/i,
  /input is too long for requested model/i,
  /exceeds the context window/i,
  /exceeds (?:the )?(?:model'?s )?maximum context length(?: of [\d,]+ tokens?|\s*\([\d,]+\))/i,
  /input token count.*exceeds the maximum/i,
  /maximum prompt length is \d+/i,
  /reduce the length of the messages/i,
  /maximum context length is \d+ tokens/i,
  /exceeds (?:the )?maximum allowed input length of [\d,]+ tokens?/i,
  /input \(\d+ tokens\) is longer than the model'?s context length \(\d+ tokens\)/i,
  /exceeds the limit of \d+/i,
  /exceeds the available context size/i,
  /greater than the context length/i,
  /context window exceeds limit/i,
  /exceeded model token limit/i,
  /too large for model with \d+ maximum context length/i,
  /prompt has [\d,]+ tokens?, but the configured context size is [\d,]+ tokens?/i,
  /model_context_window_exceeded/i,
  /prompt too long; exceeded (?:max )?context length/i,
  /range of input length should be/i,
  /context[_ ]length[_ ]exceeded/i,
  /too many tokens/i,
  /token limit exceeded/i,
];

const NON_OVERFLOW_PATTERNS = [
  /^(Throttling error|Service unavailable):/i,
  /rate limit/i,
  /too many requests/i,
];

function buildProviderErrorPattern(patterns: readonly string[]) {
  return new RegExp(patterns.join("|"), "i");
}
const NON_RETRYABLE_PROVIDER_LIMIT_ERROR_PATTERN = buildProviderErrorPattern([
  "GoUsageLimitError",
  "FreeUsageLimitError",
  "Monthly usage limit reached",
  "available balance",
  "insufficient_quota",
  "out of budget",
  "quota exceeded",
  "billing",
  "subscription_sharing_usage_limit_exceeded",
]);
const RETRYABLE_PROVIDER_ERROR_PATTERN = buildProviderErrorPattern([
  "overloaded",
  "server_busy",
  "servers are currently busy",
  "currently experiencing high demand",
  "model is at capacity",
  "rate.?limit",
  "too many requests",
  "429",
  "500",
  "502",
  "503",
  "504",
  "520",
  "524",
  "service.?unavailable",
  "server.?error",
  "internal.?error",
  "provider.?returned.?error",
  "exceeded request buffer limit while retrying upstream",
  "network.?error",
  "connection.?error",
  "connection.?refused",
  "connection.?lost",
  "other side closed",
  "fetch failed",
  "getaddrinfo",
  "ENOTFOUND",
  "EAI_AGAIN",
  "upstream.?connect",
  "reset before headers",
  "socket hang up",
  "socket connection was closed",
  "timed? out",
  "timeout",
  "terminated",
  "websocket.?closed",
  "websocket.?error",
  "ended without",
  "stream ended before message_stop",
  "stream ended before a terminal response event",
  "http2 request did not get a response",
  "pending stream has been canceled",
  "retry delay",
  "you can retry your request",
  "try your request again",
  "please retry your request",
  "ResourceExhausted",
  "subscription_sharing_usage_unavailable",
  "subscription_sharing_user_unavailable",
]);

function isContextOverflow(message: string): boolean {
  return (
    !NON_OVERFLOW_PATTERNS.some((pattern) => pattern.test(message)) &&
    OVERFLOW_PATTERNS.some((pattern) => pattern.test(message))
  );
}

function isRetryableErrorMessage(message: string): boolean {
  return (
    !NON_RETRYABLE_PROVIDER_LIMIT_ERROR_PATTERN.test(message) &&
    RETRYABLE_PROVIDER_ERROR_PATTERN.test(message)
  );
}

export function piErrorInfo(message: string): ProviderErrorInfo {
  const status = message.match(
    /\b(?:HTTP(?:\/[\d.]+)?\s+|status(?:\s+code)?[=:\s]+)([45]\d{2})\b|(?:^|:\s*)([45]\d{2})(?=[\s:]|$)/i,
  );
  const httpStatusCode = status ? Number(status[1] ?? status[2]) : null;
  const category = (): ProviderErrorInfo["category"] => {
    if (
      httpStatusCode === 401 ||
      httpStatusCode === 403 ||
      /unauthorized|authentication[_ ](?:error|failed)|invalid api key/i.test(message)
    )
      return "unauthorized";
    if (isContextOverflow(message)) return "context-window-exceeded";
    if (httpStatusCode === 402 || /insufficient[_ ]quota|\bbilling\b/i.test(message))
      return "billing";
    if (
      httpStatusCode === 429 ||
      /rate[_ -]?limit(?:ed|_error)?\b|too many requests/i.test(message)
    )
      return "rate-limit";
    if (
      httpStatusCode !== 529 &&
      !/\bE(?:CONNRESET|CONNREFUSED|PIPE|TIMEDOUT)\b/.test(message) &&
      !isRetryableErrorMessage(message)
    )
      return httpStatusCode !== null && httpStatusCode < 500 ? "bad-request" : "unknown";
    if (httpStatusCode === 529 || /\boverloaded(?:_error)?\b/i.test(message)) return "overloaded";
    if (httpStatusCode !== null && httpStatusCode >= 500) return "internal";
    return "connection-failed";
  };
  return { category: category(), providerCode: null, httpStatusCode };
}
