import { fail as missingValue } from "node:assert/strict";
import { isUtf8 } from "node:buffer";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "../server";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function receiver(statuses = [204]) {
  const requests: { url: string; authorization: string | undefined; body: unknown }[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push({
      url: req.url ?? missingValue("Expected req.url"),
      authorization: req.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString()),
    });
    res.writeHead(
      statuses[Math.min(requests.length - 1, statuses.length - 1)] ??
        missingValue("Expected a non-null value"),
      {
        location: "http://127.0.0.1:1/secret-redirect",
      },
    );
    res.end("private response body");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  return {
    requests,
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}/hook?token=url-secret`,
  };
}

async function fixture(
  settings?: Record<string, string>,
  onSettingsRead?: (values: Record<string, unknown>) => void | Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "tasks-webhooks-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const host = createFakePluginHost({
    pluginId: "tasks",
    settings,
    sdk: {
      files: {
        read: async ({ path }) => {
          const info = await stat(path);
          if (!info.isFile()) throw new Error(`private path ${path}`);
          const bytes = await readFile(path);
          return {
            path,
            content: bytes.toString(isUtf8(bytes) ? "utf8" : "base64"),
            contentEncoding: isUtf8(bytes) ? ("utf8" as const) : ("base64" as const),
            sizeBytes: bytes.length,
          };
        },
      },
    },
  });
  if (onSettingsRead) {
    const define = host.bb.settings.define.bind(host.bb.settings);
    host.bb.settings.define = (...args) => {
      const handle = define(...args);
      const get = handle.get.bind(handle);
      handle.get = async () => {
        const values = await get();
        await onSettingsRead(values);
        return values;
      };
      return handle;
    };
  }
  await plugin(host.bb);
  let current = host;
  cleanup.push(() => current.harness.dispose());
  const run = async (args: string[]) => {
    const result = await current.harness.runCli([...args, "--json"], { cwd: directory });
    expect(result, result.stderr).toMatchObject({ exitCode: 0, stderr: "" });
    return JSON.parse(result.stdout);
  };
  let fileNumber = 0;
  const config = async (value: unknown) => {
    const file = `endpoint-${++fileNumber}.json`;
    await writeFile(
      join(directory, file),
      typeof value === "string" ? value : JSON.stringify(value),
    );
    return file;
  };
  const add = async (url: string, project?: string, authorization?: string) =>
    run([
      "webhook",
      "create",
      "--config-file",
      await config({ url, ...(authorization ? { authorization } : {}) }),
      ...(project ? ["--project", project] : []),
    ]);
  const project = async (prefix: string) => {
    const result = await run(["project", "create", "--name", prefix, "--prefix", prefix]);
    return result.project;
  };
  return {
    ...host,
    run,
    add,
    config,
    project,
    directory,
    reload: async () => {
      current = await current.harness.reload(plugin);
      return current;
    },
  };
}

async function waitForCount(requests: unknown[], count: number) {
  await expect.poll(() => requests.length).toBe(count);
}

describe("bb tasks webhook", () => {
  it("posts exact creation data and auth through CLI and RPC to global plus matching tracker endpoints", async () => {
    const global = await receiver();
    const tracker = await receiver();
    const other = await receiver();
    const f = await fixture();
    const alpha = await f.project("ALPHA");
    const beta = await f.project("BETA");
    const { endpoint: summary } = await f.add(global.url, undefined, "Bearer exact-secret");
    expect(summary).toEqual({
      id: expect.stringMatching(/^wh_[a-f0-9]{32}$/),
      scope: { kind: "global" },
      hasAuthorization: true,
    });
    await f.add(tracker.url, alpha.id);
    await f.add(other.url, "BETA");
    const cli = await f.run(["create", "--project", "ALPHA", "--title", "Created by CLI"]);
    const rpc = (await f.harness.callRpc("createTask", {
      projectId: beta.id,
      title: "Created by RPC",
    })) as { task: { key: string; createdAt: string } };
    await waitForCount(global.requests, 2);
    await waitForCount(tracker.requests, 1);
    await waitForCount(other.requests, 1);
    expect(global.requests.map((r) => r.body)).toEqual([
      {
        event: "task.created",
        key: "ALPHA-1",
        project: "ALPHA",
        title: "Created by CLI",
        createdAt: cli.task.createdAt,
      },
      {
        event: "task.created",
        key: "BETA-1",
        project: "BETA",
        title: "Created by RPC",
        createdAt: rpc.task.createdAt,
      },
    ]);
    expect(global.requests.map((r) => r.authorization)).toEqual([
      "Bearer exact-secret",
      "Bearer exact-secret",
    ]);
    expect((tracker.requests[0] ?? missingValue("Expected tracker.requests[0]")).body).toEqual(
      (global.requests[0] ?? missingValue("Expected global.requests[0]")).body,
    );
    expect((other.requests[0] ?? missingValue("Expected other.requests[0]")).body).toEqual(
      (global.requests[1] ?? missingValue("Expected global.requests[1]")).body,
    );
  });

  it("lists redacted summaries, tests marked samples without tasks, deletes and reloads persisted configuration", async () => {
    const target = await receiver();
    const f = await fixture();
    const { endpoint } = await f.add(target.url, undefined, "Bearer hidden");
    expect(await f.run(["webhook", "list"])).toEqual({ endpoints: [endpoint] });
    expect(await f.run(["webhook", "test", endpoint.id])).toEqual({
      endpoint,
      outcome: { code: "delivered", attempts: 1, status: 204 },
    });
    expect((target.requests[0] ?? missingValue("Expected target.requests[0]")).body).toEqual({
      event: "task.created",
      key: "WEBHOOK-0",
      project: "WEBHOOK",
      title: "Webhook test sample",
      createdAt: expect.any(String),
      test: true,
    });
    expect(await f.run(["list"])).toMatchObject({ tasks: [] });
    await f.reload();
    expect(await f.run(["webhook", "list"])).toEqual({ endpoints: [endpoint] });
    await f.project("RELOAD");
    const created = await f.run(["create", "--project", "RELOAD", "--title", "After reload"]);
    await waitForCount(target.requests, 2);
    expect(target.requests[1]).toEqual({
      url: "/hook?token=url-secret",
      authorization: "Bearer hidden",
      body: {
        event: "task.created",
        key: "RELOAD-1",
        project: "RELOAD",
        title: "After reload",
        createdAt: created.task.createdAt,
      },
    });
    expect(await f.run(["webhook", "delete", endpoint.id])).toEqual({ endpoint, deleted: true });
    expect(await f.run(["webhook", "list"])).toEqual({ endpoints: [] });
    expect(f.harness.registrations.settingsDescriptors.taskWebhooks).toMatchObject({
      type: "string",
      secret: true,
    });
  });

  it("serializes concurrent mutations without losing endpoints", async () => {
    const target = await receiver();
    const f = await fixture();
    const additions = await Promise.all(Array.from({ length: 8 }, () => f.add(target.url)));
    const endpoints = additions.map((r) => r.endpoint);
    const result = await f.run(["webhook", "list"]);
    expect(
      result.endpoints.sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)),
    ).toEqual([...endpoints].sort((a, b) => a.id.localeCompare(b.id)));
    await Promise.all(endpoints.slice(0, 4).map((e) => f.run(["webhook", "delete", e.id])));
    const result2 = await f.run(["webhook", "list"]);
    expect(
      result2.endpoints.sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)),
    ).toEqual(endpoints.slice(4).sort((a, b) => a.id.localeCompare(b.id)));
  });

  it.each([408, 429, 500])("retries HTTP %s briefly and reports safe outcomes", async (status) => {
    const target = await receiver([status, 204]);
    const f = await fixture();
    const { endpoint } = await f.add(target.url, undefined, "Bearer hidden");
    expect(await f.run(["webhook", "test", endpoint.id])).toEqual({
      endpoint,
      outcome: { code: "delivered", attempts: 2, status: 204 },
    });
    expect(target.requests.map((r) => r.body)).toEqual([
      (target.requests[0] ?? missingValue("Expected target.requests[0]")).body,
      (target.requests[0] ?? missingValue("Expected target.requests[0]")).body,
    ]);
  });

  it.each([400, 302, 600])(
    "does not retry or follow HTTP %s and never exposes receiver details",
    async (status) => {
      const target = await receiver([status]);
      const f = await fixture();
      const { endpoint } = await f.add(target.url, undefined, "Bearer hidden");
      const outcome = await f.run(["webhook", "test", endpoint.id]);
      expect(outcome).toEqual({ endpoint, outcome: { code: "http_error", attempts: 1, status } });
      expect(target.requests.length).toBe(1);
      expect(f.harness.logEntries.filter((r) => r.level === "warn").map((r) => r.message)).toEqual([
        `Webhook ${endpoint.id} attempts=1 code=http_error status=${status}`,
      ]);
    },
  );

  it("retries network errors safely without failing CLI creation", async () => {
    const target = await receiver();
    const f = await fixture();
    await f.project("ERR");
    const { endpoint } = await f.add(
      "http://127.0.0.1:1/?private=url-secret",
      undefined,
      "Bearer hidden",
    );
    const { endpoint: success } = await f.add(target.url);
    expect(await f.run(["create", "--project", "ERR", "--title", "Still created"])).toMatchObject({
      task: { key: "ERR-1" },
    });
    await waitForCount(target.requests, 1);
    await expect
      .poll(() => f.harness.logEntries.filter((r) => r.level === "warn").map((r) => r.message))
      .toEqual([`Webhook ${endpoint.id} attempts=3 code=network_error`]);
    expect(await f.run(["webhook", "list"])).toEqual({ endpoints: [endpoint, success] });
  });

  it("does not publish a rolled-back outer transaction", async () => {
    const target = await receiver();
    const f = await fixture();
    const p = await f.project("ROLL");
    await f.add(target.url);
    f.bb.storage
      .database()
      .exec(
        "CREATE TRIGGER fail_labels BEFORE INSERT ON task_labels BEGIN SELECT RAISE(ABORT, 'rollback'); END",
      );
    const { label } = await f.run(["label", "create", "--project", "ROLL", "--name", "Failure"]);
    await expect(
      f.harness.callRpc("createTask", {
        projectId: p.id,
        title: "Rolled back",
        labelIds: [label.id],
      }),
    ).rejects.toThrow("rollback");
    expect(await f.run(["list", "--project", "ROLL"])).toMatchObject({ tasks: [] });
    await f.harness.callRpc("createTask", { projectId: p.id, title: "Committed" });
    await waitForCount(target.requests, 1);
    expect((target.requests[0] ?? missingValue("Expected target.requests[0]")).body).toMatchObject({
      key: "ROLL-1",
      title: "Committed",
    });
  });

  it.each([
    { url: "https://user:private@example.com" },
    { url: "https://example.com/#private" },
    { url: "file:///private" },
    { url: "https://example.com", authorization: "private\r\nInjected: yes" },
    { url: "https://example.com", authorization: " private " },
    { url: "https://example.com", authorization: "x".repeat(4097) },
    { url: "https://example.com", unexpected: "private" },
    "{private malformed JSON",
  ])("rejects invalid endpoint input without echoing secrets", async (input) => {
    const f = await fixture();
    const result = await f.harness.runCli(
      ["webhook", "create", "--config-file", await f.config(input), "--json"],
      { cwd: f.directory },
    );
    expect(result).toMatchObject({ exitCode: 1, stderr: "Invalid webhook configuration\n" });
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      error: { code: "webhook_invalid_input", message: "Invalid webhook configuration" },
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(await f.run(["webhook", "list"])).toEqual({ endpoints: [] });
  });

  it("uses a bounded regular UTF-8 invoking-machine file boundary with generic errors", async () => {
    const f = await fixture();
    const binary = join(f.directory, "binary-secret");
    await writeFile(binary, Buffer.from([255]));
    const huge = join(f.directory, "huge-secret");
    await writeFile(huge, "x".repeat(8193));
    for (const path of ["missing-secret", ".", "/dev/stdin", binary, huge]) {
      const result = await f.harness.runCli(
        ["webhook", "create", "--config-file", path, "--json"],
        { cwd: f.directory },
      );
      expect(result).toMatchObject({ exitCode: 1, stderr: "Could not read webhook config file\n" });
      expect(JSON.parse(result.stdout)).toEqual({
        ok: false,
        error: { code: "webhook_file_error", message: "Could not read webhook config file" },
      });
      expect(result.stdout).not.toContain(path);
    }
    expect(await f.run(["webhook", "list"])).toEqual({ endpoints: [] });
  });

  it("fails closed on malformed persisted documents and recovers after an explicit admin unset", async () => {
    const target = await receiver();
    const f = await fixture({ taskWebhooks: "{private invalid stored config" });
    await f.project("SAFE");
    const result = await f.harness.runCli(["webhook", "list", "--json"]);
    expect(result).toMatchObject({ exitCode: 1, stderr: "Invalid stored webhook configuration\n" });
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      error: { code: "webhook_invalid_stored", message: "Invalid stored webhook configuration" },
    });
    await f.run(["create", "--project", "SAFE", "--title", "No delivery"]);
    await f.harness.setSettings({ taskWebhooks: null });
    await f.add(target.url);
    await f.run(["create", "--project", "SAFE", "--title", "Delivery restored"]);
    await waitForCount(target.requests, 1);
    expect((target.requests[0] ?? missingValue("Expected target.requests[0]")).body).toMatchObject({
      key: "SAFE-2",
      title: "Delivery restored",
    });
    expect(JSON.stringify(f.harness.logEntries)).not.toContain("private");
  });

  it("shares one redacted settings RPC boundary with CLI-created endpoints", async () => {
    const f = await fixture();
    const tracker = await f.project("SCOPE");
    const target = await receiver([403]);
    const cli = await f.add(target.url, undefined, "Bearer fixture-secret");
    const rpc = f.harness.behavior.callRpc;
    const scope = { kind: "tracker", projectId: tracker.id };
    const input = {
      url: "https://127.0.0.1:1/synthetic-secret",
      authorization: "Bearer fixture-secret",
      scope,
    };
    const added = (await rpc("addWebhook", input)) as { ok: true; endpoint: { id: string } };
    const endpoint = {
      id: expect.stringMatching(/^wh_[a-f0-9]{32}$/),
      scope,
      hasAuthorization: true,
    };
    expect(added).toEqual({ ok: true, endpoint });
    expect(await rpc("listWebhooks", null)).toEqual({
      state: "healthy",
      endpoints: [cli.endpoint, endpoint],
      trackers: [{ id: tracker.id, prefix: tracker.prefix, name: tracker.name }],
    });
    expect(await f.run(["webhook", "list"])).toEqual({ endpoints: [cli.endpoint, added.endpoint] });
    expect(await rpc("testWebhook", { id: cli.endpoint.id })).toEqual({
      ok: true,
      outcome: { code: "http_error", attempts: 1, status: 403 },
    });
    expect(target.requests).toEqual([
      {
        url: "/hook?token=url-secret",
        authorization: "Bearer fixture-secret",
        body: expect.objectContaining({ event: "task.created", test: true }),
      },
    ]);
    expect(await rpc("deleteWebhook", { id: added.endpoint.id })).toEqual({ ok: true, endpoint });
    expect(await f.run(["webhook", "list"])).toEqual({ endpoints: [cli.endpoint] });
    expect(await rpc("addWebhook", input)).toMatchObject({ ok: true });
    const missing = { ...scope, projectId: "00000000000000000000000000" };
    expect(await rpc("addWebhook", { ...input, scope: missing })).toEqual({
      ok: false,
      code: "tracker_not_found",
    });
    expect(await rpc("addWebhook", { ...input, url: { private: target.url } })).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(JSON.stringify(f.harness.logEntries)).not.toMatch(
      /url-secret|fixture-secret|private response body/,
    );
  });

  it("persists names by ID across RPC and CLI without changing legacy delivery", async () => {
    const legacy = await receiver();
    const scope = { kind: "global" } as const;
    const id = `wh_${"a".repeat(32)}`;
    const authorization = "Bearer legacy-secret";
    const f = await fixture({
      taskWebhooks: JSON.stringify({
        version: 1,
        endpoints: [{ id, scope, url: legacy.url, authorization }],
      }),
    });
    const unnamed = { id, scope, hasAuthorization: true };
    expect(await f.run(["webhook", "list"])).toEqual({ endpoints: [unnamed] });
    const file = await f.config({
      url: "https://127.0.0.1:1/other-secret",
      name: "  Build alerts  ",
    });
    const { endpoint: other } = await f.run(["webhook", "create", "--config-file", file]);
    expect(other).toEqual({
      id: expect.stringMatching(/^wh_[a-f0-9]{32}$/),
      name: "Build alerts",
      scope,
      hasAuthorization: false,
    });
    expect(other.id).not.toBe(id);
    const rpc = f.harness.behavior.callRpc;
    const named = { ...unnamed, name: "Build alerts" };
    expect(await rpc("renameWebhook", { id, name: "  Build alerts  " })).toEqual({
      ok: true,
      endpoint: named,
    });
    expect(legacy.requests).toEqual([]);
    const reloaded = await f.reload();
    expect(await reloaded.harness.callRpc("listWebhooks", null)).toEqual({
      state: "healthy",
      endpoints: [named, other],
      trackers: [],
    });
    expect(await f.run(["webhook", "rename", id, "--name", ""])).toEqual({ endpoint: unnamed });
    expect(legacy.requests).toEqual([]);
    await f.reload();
    expect(await f.run(["webhook", "list"])).toEqual({ endpoints: [unnamed, other] });
    expect(await f.run(["webhook", "test", id])).toEqual({
      endpoint: unnamed,
      outcome: { code: "delivered", attempts: 1, status: 204 },
    });
    expect(legacy.requests).toEqual([
      {
        url: "/hook?token=url-secret",
        authorization,
        body: {
          event: "task.created",
          key: "WEBHOOK-0",
          project: "WEBHOOK",
          title: "Webhook test sample",
          createdAt: expect.any(String),
          test: true,
        },
      },
    ]);
  });

  it("accepts a trimmed RPC name and reports invalid names without echoing input", async () => {
    const f = await fixture();
    const rpc = f.harness.behavior.callRpc;
    const scope = { kind: "global" };
    const url = "https://127.0.0.1:1/private-url";
    const name = "N".repeat(80);
    const { endpoint } = (await rpc("addWebhook", { scope, url, name: `  ${name}  ` })) as {
      endpoint: { id: string; name?: string };
    };
    expect(endpoint).toEqual({ id: expect.any(String), scope, name, hasAuthorization: false });
    const invalid = "private-label".repeat(10);
    expect(await rpc("addWebhook", { scope, url, name: invalid })).toEqual({
      ok: false,
      code: "invalid_name",
    });
    expect(await rpc("renameWebhook", { id: endpoint.id, name: { invalid } })).toEqual({
      ok: false,
      code: "invalid_name",
    });
    const result = await f.harness.runCli(
      ["webhook", "rename", endpoint.id, "--name", invalid, "--json"],
      { cwd: f.directory },
    );
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "webhook_invalid_name",
        message: "Webhook name must be text with at most 80 characters",
      },
    });
    expect(await f.run(["webhook", "list"])).toEqual({ endpoints: [endpoint] });
  });

  it("rejects a valid native replacement while a Tasks write preserves the saved endpoint", async () => {
    const scope = { kind: "global" } as const;
    const id = `wh_${"a".repeat(32)}`;
    const f = await fixture({
      taskWebhooks: JSON.stringify({
        version: 1,
        endpoints: [{ id, scope, url: "https://example.test/old" }],
      }),
    });
    const rpc = f.harness.behavior.callRpc;
    const add = rpc("addWebhook", { scope, url: "https://example.test/new" });
    const replacement = JSON.stringify({ version: 1, endpoints: [] });
    const [, created] = await Promise.all([
      expect(f.harness.setSettings({ taskWebhooks: replacement })).rejects.toThrow(
        "Use the Webhooks form or the Tasks webhook commands.",
      ),
      add,
    ]);
    expect(created).toMatchObject({ ok: true });
    expect(await f.run(["webhook", "list"])).toEqual({
      endpoints: [
        { id, scope, hasAuthorization: false },
        { id: expect.stringMatching(/^wh_[a-f0-9]{32}$/), scope, hasAuthorization: false },
      ],
    });
  });

  it("keeps delivering after a Rename storage failure and reloads saved settings on Retry", async () => {
    const target = await receiver();
    let storageError = false;
    const f = await fixture(undefined, () => {
      if (storageError) throw new Error("private settings read failure");
    });
    await f.project("RETRY");
    const { endpoint } = await f.add(target.url, undefined, "Bearer saved-secret");
    const rpc = f.harness.behavior.callRpc;

    storageError = true;
    expect(await rpc("renameWebhook", { id: endpoint.id, name: "Not saved" })).toEqual({
      ok: false,
      code: "storage_error",
    });
    await f.run(["create", "--project", "RETRY", "--title", "Created during storage outage"]);
    await waitForCount(target.requests, 1);
    expect(target.requests[0]).toMatchObject({
      authorization: "Bearer saved-secret",
      body: { key: "RETRY-1", title: "Created during storage outage" },
    });
    await expect(rpc("listWebhooks", null)).rejects.toThrow("Could not load webhook settings");
    const cli = await f.harness.runCli(["webhook", "list", "--json"]);
    expect(cli.stderr).toBe("Webhook configuration unavailable\n");
    expect(JSON.parse(cli.stdout)).toEqual({
      ok: false,
      error: { code: "webhook_storage_error", message: "Webhook configuration unavailable" },
    });

    storageError = false;
    expect(await rpc("listWebhooks", null)).toMatchObject({
      state: "healthy",
      endpoints: [endpoint],
    });
    expect(await rpc("renameWebhook", { id: endpoint.id, name: "Saved" })).toEqual({
      ok: true,
      endpoint: { ...endpoint, name: "Saved" },
    });
  });

  it("retries an unread startup document and invalidates a verified snapshot only on malformed data", async () => {
    const target = await receiver();
    const id = `wh_${"a".repeat(32)}`;
    const scope = { kind: "global" } as const;
    let storage: "unavailable" | "healthy" | "malformed" = "unavailable";
    const f = await fixture(
      {
        taskWebhooks: JSON.stringify({
          version: 1,
          endpoints: [{ id, scope, url: target.url, name: "Already saved" }],
        }),
      },
      (values) => {
        if (storage === "unavailable") throw new Error("private startup read failure");
        if (storage === "malformed") values.taskWebhooks = "{private malformed data";
      },
    );
    const rpc = f.harness.behavior.callRpc;
    await expect(rpc("listWebhooks", null)).rejects.toThrow("Could not load webhook settings");
    expect(await rpc("testWebhook", { id })).toEqual({ ok: false, code: "storage_error" });
    storage = "healthy";
    expect(await rpc("listWebhooks", null)).toEqual({
      state: "healthy",
      endpoints: [{ id, scope, name: "Already saved", hasAuthorization: false }],
      trackers: [],
    });
    storage = "malformed";
    expect(await rpc("listWebhooks", null)).toEqual({ state: "blocked" });
    expect(await rpc("testWebhook", { id })).toEqual({ ok: false, code: "invalid_stored" });
    expect(target.requests).toEqual([]);
  });

  it("does not replace a completed Rename with an older in-flight Settings list", async () => {
    const target = await receiver();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let resume!: () => void;
    const paused = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let pauseNextRead = false;
    const f = await fixture(undefined, () => {
      if (!pauseNextRead) return;
      pauseNextRead = false;
      markStarted();
      return paused;
    });
    const { endpoint } = await f.add(target.url);
    const rpc = f.harness.behavior.callRpc;
    pauseNextRead = true;
    const list = rpc("listWebhooks", null);
    await Promise.race([
      started,
      list.then(() => {
        throw new Error("Settings list did not read persisted configuration");
      }),
    ]);
    const rename = rpc("renameWebhook", { id: endpoint.id, name: "New name" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    resume();
    await list;
    expect(await rename).toEqual({ ok: true, endpoint: { ...endpoint, name: "New name" } });
    expect(await f.run(["webhook", "test", endpoint.id])).toEqual({
      endpoint: { ...endpoint, name: "New name" },
      outcome: { code: "delivered", attempts: 1, status: 204 },
    });
  });

  it("does not restore a cleared webhook from an older in-flight Settings list", async () => {
    const target = await receiver();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let resume!: () => void;
    const paused = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let pauseNextRead = false;
    const f = await fixture(undefined, () => {
      if (!pauseNextRead) return;
      pauseNextRead = false;
      markStarted();
      return paused;
    });
    const { endpoint } = await f.add(target.url);
    const rpc = f.harness.behavior.callRpc;
    pauseNextRead = true;
    const list = rpc("listWebhooks", null);
    await Promise.race([
      started,
      list.then(() => {
        throw new Error("Settings list did not read persisted configuration");
      }),
    ]);
    try {
      await f.harness.setSettings({ taskWebhooks: null });
    } finally {
      resume();
    }
    expect(await list).toEqual({ state: "healthy", endpoints: [], trackers: [] });
    expect(await rpc("testWebhook", { id: endpoint.id })).toEqual({ ok: false, code: "not_found" });
    expect(target.requests).toEqual([]);
  });

  it("blocks all normal webhook actions while stored configuration is invalid", async () => {
    const f = await fixture({ taskWebhooks: "{private invalid stored data" });
    const rpc = f.harness.behavior.callRpc;
    const id = `wh_${"a".repeat(32)}`;
    expect(await rpc("listWebhooks", null)).toEqual({ state: "blocked" });
    for (const [method, input] of [
      ["addWebhook", { scope: { kind: "global" }, url: "https://127.0.0.1:1/private-url" }],
      ["deleteWebhook", { id }],
      ["testWebhook", { id }],
    ] as const) {
      expect(await rpc(method, input)).toEqual({ ok: false, code: "invalid_stored" });
    }
  });
  it("returns successful CLI and RPC creation before a stalled receiver settles and aborts on host disposal", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", (_url: string, options: RequestInit) => {
      signals.push(options.signal ?? missingValue("Expected options.signal"));
      return new Promise<Response>((_resolve, reject) =>
        (options.signal ?? missingValue("Expected options.signal")).addEventListener(
          "abort",
          () => reject(new Error("private receiver failure")),
          { once: true },
        ),
      );
    });
    const f = await fixture();
    const project = await f.project("SLOW");
    await f.add("https://receiver.test/private", undefined, "Bearer private");
    expect(await f.run(["create", "--project", "SLOW", "--title", "CLI success"])).toMatchObject({
      task: { key: "SLOW-1", title: "CLI success" },
    });
    expect(
      await f.harness.callRpc("createTask", { projectId: project.id, title: "RPC success" }),
    ).toMatchObject({ ok: true, task: { key: "SLOW-2", title: "RPC success" } });
    expect(signals.map((s) => s.aborted)).toEqual([false, false]);
    await f.harness.dispose();
    expect(signals.map((s) => s.aborted)).toEqual([true, true]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(signals.length).toBe(2);
  });

  it("routes demo seed creation through the same production owner", async () => {
    const target = await receiver();
    const f = await fixture();
    await f.add(target.url);
    const result = await f.run(["seed-demo", "--yes"]);
    expect(result.tasksCreated).toBe(12);
    await waitForCount(target.requests, 12);
    expect(new Set(target.requests.map((r) => (r.body as { key: string }).key)).size).toBe(12);
    expect(
      target.requests.every((r) => (r.body as { event: string }).event === "task.created"),
    ).toBe(true);
  });

  it("registers webhook help and defaults to global even with tracker context", async () => {
    const target = await receiver();
    const f = await fixture();
    const help = await f.harness.runCli(["--help"]);
    expect(help.stdout).toContain("webhook create");
    const file = await f.config({ url: target.url });
    const result = await f.harness.runCli(["webhook", "create", "--config-file", file, "--json"], {
      cwd: f.directory,
      projectId: "proj_context",
    });
    expect(JSON.parse(result.stdout)).toEqual({
      endpoint: {
        id: expect.stringMatching(/^wh_[a-f0-9]{32}$/),
        scope: { kind: "global" },
        hasAuthorization: false,
      },
    });
    for (const command of ["delete", "test"]) {
      const missing = await f.harness.runCli([
        "webhook",
        command,
        "https://private.test?token=secret",
        "--json",
      ]);
      expect(JSON.parse(missing.stdout)).toEqual({
        ok: false,
        error: { code: "webhook_not_found", message: "Webhook endpoint not found" },
      });
      expect(missing.stderr).toBe("Webhook endpoint not found\n");
    }
  });
});
