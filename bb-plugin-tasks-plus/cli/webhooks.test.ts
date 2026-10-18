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
      url: req.url!,
      authorization: req.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString()),
    });
    res.writeHead(statuses[Math.min(requests.length - 1, statuses.length - 1)]!, {
      location: "http://127.0.0.1:1/secret-redirect",
    });
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

async function fixture(settings?: Record<string, string>) {
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
  const project = async (prefix: string) =>
    (await run(["project", "create", "--name", prefix, "--prefix", prefix])).project;
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
    const summary = (await f.add(global.url, undefined, "Bearer exact-secret")).endpoint;
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
    expect(tracker.requests[0]!.body).toEqual(global.requests[0]!.body);
    expect(other.requests[0]!.body).toEqual(global.requests[1]!.body);
  });

  it("lists redacted summaries, tests marked samples without tasks, deletes and reloads persisted configuration", async () => {
    const target = await receiver();
    const f = await fixture();
    const endpoint = (await f.add(target.url, undefined, "Bearer hidden")).endpoint;
    expect(await f.run(["webhook", "list"])).toEqual({ endpoints: [endpoint] });
    expect(await f.run(["webhook", "test", endpoint.id])).toEqual({
      endpoint,
      outcome: { code: "delivered", attempts: 1, status: 204 },
    });
    expect(target.requests[0]!.body).toEqual({
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
    expect(
      (await f.run(["webhook", "list"])).endpoints.sort((a: { id: string }, b: { id: string }) =>
        a.id.localeCompare(b.id),
      ),
    ).toEqual([...endpoints].sort((a, b) => a.id.localeCompare(b.id)));
    await Promise.all(endpoints.slice(0, 4).map((e) => f.run(["webhook", "delete", e.id])));
    expect(
      (await f.run(["webhook", "list"])).endpoints.sort((a: { id: string }, b: { id: string }) =>
        a.id.localeCompare(b.id),
      ),
    ).toEqual(endpoints.slice(4).sort((a, b) => a.id.localeCompare(b.id)));
  });

  it.each([408, 429, 500])("retries HTTP %s briefly and reports safe outcomes", async (status) => {
    const target = await receiver([status, 204]);
    const f = await fixture();
    const endpoint = (await f.add(target.url, undefined, "Bearer hidden")).endpoint;
    expect(await f.run(["webhook", "test", endpoint.id])).toEqual({
      endpoint,
      outcome: { code: "delivered", attempts: 2, status: 204 },
    });
    expect(target.requests.map((r) => r.body)).toEqual([
      target.requests[0]!.body,
      target.requests[0]!.body,
    ]);
  });

  it.each([400, 302, 600])(
    "does not retry or follow HTTP %s and never exposes receiver details",
    async (status) => {
      const target = await receiver([status]);
      const f = await fixture();
      const endpoint = (await f.add(target.url, undefined, "Bearer hidden")).endpoint;
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
    const endpoint = (
      await f.add("http://127.0.0.1:1/?private=url-secret", undefined, "Bearer hidden")
    ).endpoint;
    const success = (await f.add(target.url)).endpoint;
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
    const label = (await f.run(["label", "create", "--project", "ROLL", "--name", "Failure"]))
      .label;
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
    expect(target.requests[0]!.body).toMatchObject({ key: "ROLL-1", title: "Committed" });
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

  it("fails closed on malformed persisted documents and recovers after a valid settings update", async () => {
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
    await f.harness.setSettings({ taskWebhooks: JSON.stringify({ version: 1, endpoints: [] }) });
    await f.add(target.url);
    await f.run(["create", "--project", "SAFE", "--title", "Delivery restored"]);
    await waitForCount(target.requests, 1);
    expect(target.requests[0]!.body).toMatchObject({ key: "SAFE-2", title: "Delivery restored" });
    expect(JSON.stringify(f.harness.logEntries)).not.toContain("private");
  });

  it("returns successful CLI and RPC creation before a stalled receiver settles and aborts on host disposal", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", (_url: string, options: RequestInit) => {
      signals.push(options.signal!);
      return new Promise<Response>((_resolve, reject) =>
        options.signal!.addEventListener(
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
