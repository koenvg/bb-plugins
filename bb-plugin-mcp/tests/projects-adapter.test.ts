import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import plugin from "../server.js";
import { freePort, loopbackFetch, project } from "./fixtures.js";

let host: ReturnType<typeof createFakePluginHost>;
let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  client = undefined;
  await host?.harness.lifecycle.dispose();
  vi.unstubAllGlobals();
});

const personal = { ...project("proj_personal", "Personal"), kind: "personal" as const };
const ordinary = project("proj_a", "Ordinary");
const call = { name: "bb_list_projects", arguments: {} };

// Load the production plugin, not a copy of its SDK adapter. Only the issuer
// fetch and BB data are fixtures; MCP requests use the real loopback listener.
async function setup(authMode: "bearer-jwt" | "cloudflare-access", projects: string) {
  const settings = {
    publicOrigin: "https://mcp.example.org",
    port: await freePort(),
    issuer: "https://issuer.example.org",
    owner: "owner",
    projects,
    remoteEnabled: true,
    controlEnabled: true,
    authMode,
    accessAudience: "dedicated-app",
    accessPermission: "read",
    accessOAuthIssuer: "https://oauth.example.org",
  };
  const pair = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "fixture", alg: "RS256", use: "sig" };
  vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    if (url === settings.issuer + "/.well-known/openid-configuration") {
      return Response.json({ issuer: settings.issuer, jwks_uri: settings.issuer + "/keys" });
    }
    if (url === settings.issuer + "/keys" || url === settings.issuer + "/cdn-cgi/access/certs") {
      return Response.json({ keys: [jwk] });
    }
    throw new Error("Unexpected external fetch: " + url);
  });
  host = createFakePluginHost({ settings });
  const list = vi.fn<typeof host.bb.sdk.projects.list>(async (args) => {
    const records = [personal, project("proj_hidden", "Hidden"), ordinary];
    return args?.includePersonal ? records : records.filter((p) => p.kind !== "personal");
  });
  host.harness.sdk.stub("projects.list", list);
  await plugin(host.bb);
  host.harness.behavior.runService("listener");
  await expect
    .poll(async () => {
      const status = await host.harness.behavior.runCli(["status", "--json"]);
      return JSON.parse(status.stdout ?? "{}").listener;
    })
    .toBe("listening");

  const token = await new SignJWT({
    iss: settings.issuer,
    sub: settings.owner,
    aud:
      authMode === "cloudflare-access" ? settings.accessAudience : settings.publicOrigin + "/mcp",
    scope: "bb.read",
    type: "app",
    exp: Math.floor(Date.now() / 1000) + 900,
  })
    .setProtectedHeader({ alg: "RS256", kid: "fixture" })
    .sign(pair.privateKey);
  client = new Client({ name: "adapter-fixture", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${settings.port}/mcp`), {
      fetch: loopbackFetch,
      requestInit: {
        headers: {
          host: "mcp.example.org",
          ...(authMode === "cloudflare-access"
            ? { "cf-access-jwt-assertion": token }
            : { authorization: "Bearer " + token }),
        },
      },
    }),
  );
  return { client, list };
}

describe.each(["bearer-jwt", "cloudflare-access"] as const)(
  "%s production project adapter",
  (mode) => {
    const discovered = [
      { id: "proj_a", name: "Ordinary" },
      { id: "proj_hidden", name: "Hidden" },
      { id: "proj_personal", name: "Personal" },
    ];

    it.each([
      "proj_a",
      "proj_personal\nproj_a",
      "proj_personal",
      "proj_a\nproj_personal_other",
      "",
    ])(
      "discovers every project regardless of the thread-access allowlist: %j",
      async (projects) => {
        const f = await setup(mode, projects);
        expect((await f.client.callTool(call)).structuredContent).toEqual({
          projects: discovered,
          nextCursor: null,
        });
        expect(f.list.mock.calls).toEqual([[{ includePersonal: true }]]);
        expect(host.harness.inspection.sdk.calls.map((c) => c.path)).toEqual(["projects.list"]);
      },
    );

    it("preserves pagination, ID order and project-only fields", async () => {
      const f = await setup(mode, "");
      expect(
        (await f.client.callTool({ name: call.name, arguments: { limit: 2 } })).structuredContent,
      ).toEqual({ projects: discovered.slice(0, 2), nextCursor: "2" });
      expect(
        (await f.client.callTool({ name: call.name, arguments: { limit: 2, cursor: "2" } }))
          .structuredContent,
      ).toEqual({ projects: discovered.slice(2), nextCursor: null });
      expect(f.list.mock.calls).toEqual([[{ includePersonal: true }], [{ includePersonal: true }]]);
    });

    it("discovers newly created projects on the next request without a settings edit", async () => {
      const f = await setup(mode, "proj_a");
      expect((await f.client.callTool(call)).structuredContent).toEqual({
        projects: discovered,
        nextCursor: null,
      });
      f.list.mockResolvedValueOnce([personal, ordinary, project("proj_future", "Future")]);
      expect((await f.client.callTool(call)).structuredContent).toEqual({
        projects: [
          { id: "proj_a", name: "Ordinary" },
          { id: "proj_future", name: "Future" },
          { id: "proj_personal", name: "Personal" },
        ],
        nextCursor: null,
      });
    });

    it("keeps discovery independent of project grants without granting thread-content or control access", async () => {
      const f = await setup(mode, "proj_personal\nproj_a");
      f.list.mockImplementationOnce(async () => {
        await host.harness.behavior.setSettings({ projects: "" });
        return [personal, ordinary];
      });
      expect((await f.client.callTool(call)).structuredContent).toEqual({
        projects: [
          { id: "proj_a", name: "Ordinary" },
          { id: "proj_personal", name: "Personal" },
        ],
        nextCursor: null,
      });
      const threads = await f.client.callTool({
        name: "bb_list_threads",
        arguments: { projectId: "proj_personal" },
      });
      expect(threads.isError).toBe(true);
      const denied = await f.client.callTool({
        name: "bb_start_thread",
        arguments: {
          projectId: "proj_personal",
          prompt: "Fixture only",
          operationKey: "personal-start",
        },
      });
      expect(denied.isError).toBe(true);
      expect(host.harness.inspection.sdk.calls.map((c) => c.path)).toEqual(["projects.list"]);
    });

    it("rechecks the owner after the SDK read before returning project names", async () => {
      const f = await setup(mode, "");
      f.list.mockImplementationOnce(async () => {
        await host.harness.behavior.setSettings({ owner: "another-owner" });
        return [personal];
      });
      const result = await f.client.callTool(call);
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain("Personal");
      expect(f.list.mock.calls).toEqual([[{ includePersonal: true }]]);
    });
  },
);
