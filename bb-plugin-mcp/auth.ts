import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";
import { z } from "zod";
import type { Config, Connection } from "./config.js";
import type { Identity } from "./control.js";

const discoverySchema = z.object({ issuer: z.string(), jwks_uri: z.string().url() });

export function authenticator(fetcher: typeof fetch = fetch) {
  // Only the configured issuer supplies key locations. Keep one issuer cache.
  let cached:
    | { issuer: string; keys: ReturnType<typeof createRemoteJWKSet>; expires: number }
    | undefined;
  let loading: { issuer: string; promise: Promise<NonNullable<typeof cached>> } | undefined;
  const boundedFetch: typeof fetch = async (input, init) => {
    const response = await fetcher(input, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok || !response.body) throw new Error("AUTH_UNAVAILABLE");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 32768) throw new Error("AUTH_UNAVAILABLE");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return new Response(Buffer.concat(chunks), {
      status: response.status,
      headers: response.headers,
    });
  };
  async function keys(issuer: string) {
    if (cached?.issuer === issuer && cached.expires > Date.now()) return cached.keys;
    if (loading?.issuer !== issuer) {
      loading = {
        issuer,
        promise: (async () => {
          const response = await boundedFetch(issuer + "/.well-known/openid-configuration");
          const discovery = discoverySchema.parse(await response.json());
          const url = new URL(discovery.jwks_uri);
          if (
            discovery.issuer !== issuer ||
            url.protocol !== "https:" ||
            url.username ||
            url.password ||
            url.hash ||
            url.search
          )
            throw new Error();
          return {
            issuer,
            keys: createRemoteJWKSet(url, {
              [customFetch]: boundedFetch,
              timeoutDuration: 3000,
              cacheMaxAge: 300000,
              cooldownDuration: 30000,
            }),
            expires: Date.now() + 300000,
          };
        })(),
      };
    }
    const pending = loading;
    try {
      cached = await pending.promise;
      return cached.keys;
    } finally {
      if (loading === pending) loading = undefined;
    }
  }
  return async (
    authorization: string | undefined,
    config: Config,
    connection: Connection,
  ): Promise<Identity> => {
    if (
      !authorization ||
      authorization.length > 8192 ||
      !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)
    )
      throw new Error();
    const { payload } = await jwtVerify(authorization.slice(7), await keys(config.issuer), {
      algorithms: ["RS256"],
      issuer: config.issuer,
      audience: connection.publicOrigin + "/mcp",
      requiredClaims: ["exp", "sub", "iss", "aud"],
      clockTolerance: 0,
    });
    if (payload.sub !== config.owner) throw new Error();
    if (typeof payload.scope !== "string" || !payload.scope.split(" ").includes("bb.read"))
      throw new Error("INSUFFICIENT_SCOPE");
    return {
      issuer: config.issuer,
      owner: payload.sub,
      scopes: payload.scope.split(" "),
      expiresAt: payload.exp,
    };
  };
}
