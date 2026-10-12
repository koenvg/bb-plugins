import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

// The generated extension runs its real shared controller against this HTTP/auth seam.
export function fakeSpeedRuntime(models, emit) {
  let registered;
  const state = () =>
    process.env.FAKE_PI_SPEED_STATE
      ? JSON.parse(readFileSync(process.env.FAKE_PI_SPEED_STATE, "utf8"))
      : { tiers: ["priority"] };
  let accountOverride;
  let nativeSimple;
  globalThis.fetch = async (url) => {
    const fixture = state();
    if (!String(url).startsWith("https://chatgpt.com/backend-api/codex/models?")) {
      if (fixture.networkCallsFile) writeFileSync(fixture.networkCallsFile, "dispatch");
      throw new Error("Unexpected native network dispatch");
    }
    if (fixture.discoveryStartedFile) {
      writeFileSync(fixture.discoveryStartedFile, "started");
      while (!existsSync(fixture.releaseDiscoveryFile)) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    if (fixture.fail) throw new Error("private fixture response must not cross the bridge");
    return Response.json({
      models: models
        .filter((m) => m.provider === "openai-codex")
        .map((m) => ({
          slug: m.id,
          service_tiers: (fixture.tiers ?? []).map((id) => ({ id, description: "Uses 2x usage." })),
        })),
    });
  };
  return {
    registry: {
      find: (provider, id) => models.find((m) => m.provider === provider && m.id === id),
      getRegisteredNativeProvider: () => registered,
      getRegisteredProviderConfig: () => undefined,
      getProvider: () =>
        registered ?? {
          id: "openai-codex",
          stream() {},
          streamSimple(model, context, options) {
            if (state().nativeGuardFailure === "account-changed")
              accountOverride = "changed-at-payload";
            return nativeSimple(model, context, options);
          },
        },
      isUsingOAuth: () => !state().missingAuth,
      getApiKeyAndHeaders: async () => {
        const claims = {
          "https://api.openai.com/auth": {
            chatgpt_account_id: accountOverride ?? state().account ?? "fixture-account",
          },
        };
        return {
          ok: true,
          apiKey: `fixture.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`,
        };
      },
    },
    async runNativeFailure(model, text) {
      if (!state().nativeGuardFailure) return;
      nativeSimple ??= (await import("@earendil-works/pi-ai/api/openai-codex-responses"))
        .streamSimple;
      const { apiKey } = await this.registry.getApiKeyAndHeaders();
      return registered
        .streamSimple(
          { ...model, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
          { messages: [{ role: "user", content: text, timestamp: Date.now() }] },
          {
            apiKey,
            transport: "sse",
            ...(state().nativeGuardFailure === "provider-error"
              ? {
                  onPayload() {
                    throw new Error("Unrelated provider error: Select /speed default.");
                  },
                }
              : {}),
          },
        )
        .result();
    },
    async prepareSessionManager(context) {
      if (!state().realSessionManager) return;
      const { SessionManager } = await import("@earendil-works/pi-coding-agent");
      const file = context.sessionManager.getSessionFile();
      const existing = SessionManager.open(file);
      if (
        state().unflushedSessionManager &&
        !existing.getEntries().some((entry) => entry.type === "message")
      ) {
        rmSync(file, { force: true });
        context.sessionManager = SessionManager.open(file);
        context.sessionManager.appendModelChange(context.model.provider, context.model.id);
        context.sessionManager.appendThinkingLevelChange("high");
      } else {
        context.sessionManager = existing;
      }
    },
    appendUserMessage(context, text) {
      if (!state().unflushedSessionManager) return;
      context.sessionManager.appendMessage({
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      });
    },
    register(provider) {
      registered = provider;
    },
    ui: {
      setStatus() {},
      notify(message) {
        emit({ type: "extension_ui_request", id: "speed-notification", method: "notify", message });
      },
    },
  };
}
