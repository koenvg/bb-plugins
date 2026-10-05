import { createHash } from "node:crypto";
import { join } from "node:path";
import { getAgentDir, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import type { QuotaReason } from "../quota/quota-cache.js";

// Static OAuth loaders are required in the self-contained host artifact.
registerBunOAuthFlows();

export type { AuthState };
export { resolvePiAuth };
let runtimePromise: ReturnType<typeof ModelRuntime.create> | undefined;
function runtime() {
  runtimePromise ??= ModelRuntime.create({
    authPath: join(getAgentDir(), "auth.json"),
    allowModelNetwork: false,
    refreshOnCreate: false,
  })
    .then((model) => {
      // The provider and registered static loader must come from the same Pi AI module instance.
      // This overrides only this private runtime, not Pi's global provider configuration.
      model.registerNativeProvider(openaiCodexProvider());
      return model;
    })
    .catch((error: unknown) => {
      runtimePromise = undefined;
      throw error;
    });
  return runtimePromise;
}

type AuthState =
  | { status: "ok"; token: string; identity: string }
  | {
      status: Exclude<
        QuotaReason,
        | "ok"
        | "aged"
        | "expired"
        | "unavailable"
        | "identity-changed"
        | "identity-unavailable"
        | "network"
        | "service"
        | "unsupported"
      >;
    };

async function resolvePiAuth(signal: AbortSignal): Promise<AuthState> {
  let model;
  try {
    model = await runtime();
  } catch {
    return { status: "runtime-unavailable" };
  }
  let check;
  try {
    check = await model.checkAuth("openai-codex", { signal });
  } catch {
    return { status: "auth-check-failed" };
  }
  if (check?.type !== "oauth") return { status: "auth-required" };
  let auth;
  try {
    auth = await model.getAuth("openai-codex", { minOAuthValidityMs: 300_000, signal });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "auth") return { status: "credential-store-failed" };
    if (code === "oauth") {
      // Classify only fixed Pi prefixes; do not log or return its raw error.
      const text = error instanceof Error ? error.message : "";
      if (text.startsWith("OAuth refresh failed for openai-codex"))
        return { status: "oauth-refresh-failed" };
      if (text.startsWith("OAuth auth derivation failed for openai-codex"))
        return { status: "auth-derivation-failed" };
      if (text.startsWith("OAuth refresh returned a token that expires too soon"))
        return { status: "oauth-short-lived" };
      return { status: "oauth-resolution-failed" };
    }
    return { status: error instanceof TypeError ? "auth-runtime-failed" : "auth-unavailable" };
  }
  const token = auth?.auth.apiKey;
  if (!token) return { status: "auth-no-token" };
  // Never return this fingerprint in the host RPC or persist it on the BB server.
  return { status: "ok", token, identity: createHash("sha256").update(token).digest("hex") };
}
