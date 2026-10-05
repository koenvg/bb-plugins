// Endpoint and host-private header mapping adapted from OpenForge Codex Usage. See LICENSE.activity.
import { normalizeActivity } from "./activity.js";
import type { ActivityRead } from "./activity-contract.js";
import { abortable } from "./activity-cancellation.js";

const ACTIVITY_URL = "https://chatgpt.com/backend-api/wham/profiles/me";
const MAX_RESPONSE_BYTES = 64 * 1024;
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
function accountClaim(token: string): string | null {
  if (token.length > 32 * 1024) return null;
  try {
    const jwt = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    const id = jwt?.["https://api.openai.com/auth"]?.chatgpt_account_id;
    return typeof id === "string" && /^[a-zA-Z0-9_-]{1,256}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const body = response.body;
  if (!body) throw new Error("unsupported");
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    void body.cancel().catch(() => undefined);
    throw new Error("unsupported");
  }
  const reader = body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      if (signal.aborted) throw new Error("unsupported");
      const result = await abortable(reader.read(), signal, null);
      if (result === null || signal.aborted) throw new Error("unsupported");
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("unsupported");
      chunks.push(result.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
  }
}
export async function fetchNormalizedActivity(
  token: string,
  signal: AbortSignal,
  fetchImpl: FetchLike = fetch,
  now: () => number = Date.now,
): Promise<ActivityRead> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  const id = accountClaim(token);
  if (id) headers["ChatGPT-Account-Id"] = id;
  let response: Response | null;
  try {
    if (signal.aborted) return { status: "network", snapshot: null };
    response = await abortable(
      fetchImpl(ACTIVITY_URL, { method: "GET", headers, redirect: "error", signal }),
      signal,
      null,
    );
  } catch {
    return { status: "network", snapshot: null };
  }
  if (!response) return { status: "network", snapshot: null };
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    return {
      status: response.status === 401 || response.status === 403 ? "auth-expired" : "service",
      snapshot: null,
    };
  }
  try {
    const snapshot = normalizeActivity(await boundedJson(response, signal), now());
    return snapshot ? { status: "ok", snapshot } : { status: "unsupported", snapshot: null };
  } catch {
    return { status: "unsupported", snapshot: null };
  }
}
