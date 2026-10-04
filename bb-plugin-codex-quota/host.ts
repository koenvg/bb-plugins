import { createHash } from "node:crypto";
import { join } from "node:path";
import { getAgentDir, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { hostContract } from "./contract.js";
import { fetchNormalizedQuota } from "./feasibility.js";
import { QuotaCache, type QuotaRead, type QuotaReason, type QuotaView } from "./quota-cache.js";
import { createActivityHostReader } from "./activity-host.js";
import { fetchNormalizedActivity } from "./activity-fetch.js";
import type { ActivityRead } from "./activity-contract.js";

import { createHostHistory, type HostHistory } from "./history-host.js";
// Internal named exports let packaged tests exercise the runtime adapter and exact collector asset.
export { openHistoryDatabase } from "./history-storage.js";
export { packagedCollectorAsset } from "./collector-compatibility.js";
// The BB host artifact is self-contained; Pi AI's variable OAuth imports cannot resolve beside it.
registerBunOAuthFlows();

let runtimePromise: ReturnType<typeof ModelRuntime.create> | undefined;
function runtime() {
  runtimePromise ??= ModelRuntime.create({
    authPath: join(getAgentDir(), "auth.json"),
    allowModelNetwork: false,
    refreshOnCreate: false,
  }).then((model) => {
    // The provider and registered static loader must come from the same Pi AI module instance.
    // This overrides only this private runtime, not Pi's global provider configuration.
    model.registerNativeProvider(openaiCodexProvider());
    return model;
  }).catch((error: unknown) => {
    runtimePromise = undefined;
    throw error;
  });
  return runtimePromise;
}

type AuthState = { status: "ok"; token: string; identity: string } |
  { status: Exclude<QuotaReason, "ok" | "aged" | "expired" | "unavailable" | "identity-changed" | "identity-unavailable" | "network" | "service" | "unsupported"> };

async function resolvePiAuth(signal: AbortSignal): Promise<AuthState> {
  let model;
  try { model = await runtime(); } catch { return { status: "runtime-unavailable" }; }
  let check;
  try { check = await model.checkAuth("openai-codex", { signal }); }
  catch { return { status: "auth-check-failed" }; }
  if (check?.type !== "oauth") return { status: "auth-required" };
  let auth;
  try { auth = await model.getAuth("openai-codex", { minOAuthValidityMs: 300_000, signal }); }
  catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "auth") return { status: "credential-store-failed" };
    if (code === "oauth") {
      // Classify only fixed Pi prefixes; do not log or return its raw error.
      const text = error instanceof Error ? error.message : "";
      if (text.startsWith("OAuth refresh failed for openai-codex")) return { status: "oauth-refresh-failed" };
      if (text.startsWith("OAuth auth derivation failed for openai-codex")) return { status: "auth-derivation-failed" };
      if (text.startsWith("OAuth refresh returned a token that expires too soon")) return { status: "oauth-short-lived" };
      return { status: "oauth-resolution-failed" };
    }
    return { status: error instanceof TypeError ? "auth-runtime-failed" : "auth-unavailable" };
  }
  const token = auth?.auth.apiKey;
  if (!token) return { status: "auth-no-token" };
  // Never return this fingerprint in the host RPC or persist it on the BB server.
  return { status: "ok", token, identity: createHash("sha256").update(token).digest("hex") };
}

type Dependencies = {
  auth: (signal: AbortSignal) => Promise<AuthState>;
  read: (token: string, signal: AbortSignal) => Promise<QuotaRead>;
  activityRead?: (token: string, signal: AbortSignal) => Promise<ActivityRead>;
  now?: () => number;
  history?: HostHistory;
};
const unavailable = (reason: QuotaReason): QuotaView => ({ state: "unavailable", reason, snapshot: null });

export function createQuotaHostEntry(deps: Dependencies) {
  const cache = new QuotaCache(deps.now);
  const history = deps.history ?? createHostHistory();
  const activity = createActivityHostReader({ auth: deps.auth, read: deps.activityRead ?? (async () => ({ status: "unsupported", snapshot: null })), now: deps.now });
  return experimental_defineHostEntry({
    contract: hostContract,
    dispose: () => activity.dispose(),
    handlers: {
      ping: async () => ({ reachable: true }),
      historyReadiness: async (_input, context) => history.read({
        dataDir: context.experimental_paths.dataDir,
        signal: AbortSignal.any([context.signal, context.lifecycle.signal]),
      }),
      activity: async ({ refresh }, context) => activity.read(refresh === true, context.signal),
      quota: async ({ refresh }, context) => {
        const signal = AbortSignal.any([context.signal, AbortSignal.timeout(12_000)]);
        const auth = await deps.auth(signal);
        if (auth.status !== "ok") { cache.invalidate(); return unavailable(auth.status); }
        return cache.read(auth.identity, () => deps.read(auth.token, signal), async () => {
          const latest = await deps.auth(signal);
          return latest.status === "ok" ? latest.identity : null;
        }, refresh === true, signal);
      },
    },
  });
}

export default createQuotaHostEntry({ auth: resolvePiAuth, read: fetchNormalizedQuota, activityRead: fetchNormalizedActivity });
