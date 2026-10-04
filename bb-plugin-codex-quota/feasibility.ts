import { normalizeQuota } from "./quota.js";

const QUOTA_URL = "https://chatgpt.com/backend-api/wham/usage";
const MAX_RESPONSE_BYTES = 64 * 1024;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
function accountClaim(token: string): string | null {
  try {
    const jwt = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
    const claim = jwt["https://api.openai.com/auth"];
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) return null;
    const id = (claim as Record<string, unknown>).chatgpt_account_id;
    return typeof id === "string" && id.length > 0 && id.length <= 256 ? id : null;
  } catch {
    return null;
  }
}

async function boundedJson(response: Response): Promise<unknown> {
  const size = Number(response.headers.get("content-length"));
  if (Number.isFinite(size) && size > MAX_RESPONSE_BYTES) throw new Error("oversize");
  if (!response.body) throw new Error("missing-body");
  const reader = response.body.getReader();
  let sizeRead = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      sizeRead += value.byteLength;
      if (sizeRead > MAX_RESPONSE_BYTES) throw new Error("oversize");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

/** Only the host process can observe raw upstream payloads and credentials. */
async function quotaPayload(token: string, signal: AbortSignal, fetchImpl: FetchLike): Promise<
  { status: "ok"; payload: unknown } | { status: "auth-expired" | "network" | "service" | "unsupported" }
> {
  const headers: Record<string, string> = { Accept: "application/json", Authorization: `Bearer ${token}` };
  const id = accountClaim(token);
  if (id) headers["ChatGPT-Account-Id"] = id;
  let response: Response;
  try {
    response = await fetchImpl(QUOTA_URL, { method: "GET", headers, signal });
  } catch {
    return { status: "network" };
  }
  if (response.status === 401 || response.status === 403) return { status: "auth-expired" };
  if (!response.ok) return { status: "service" };
  try {
    return { status: "ok", payload: await boundedJson(response) };
  } catch {
    return { status: "unsupported" };
  }
}

export async function fetchNormalizedQuota(
  token: string, signal: AbortSignal, fetchImpl: FetchLike = fetch, observedAtMs = Date.now(),
): Promise<{ status: "ok"; snapshot: import("./quota.js").QuotaSnapshot } |
  { status: "auth-expired" | "network" | "service" | "unsupported"; snapshot: null }> {
  const read = await quotaPayload(token, signal, fetchImpl);
  if (read.status !== "ok") return { status: read.status, snapshot: null };
  const snapshot = normalizeQuota(read.payload, observedAtMs);
  return snapshot ? { status: "ok", snapshot } : { status: "unsupported", snapshot: null };
}
