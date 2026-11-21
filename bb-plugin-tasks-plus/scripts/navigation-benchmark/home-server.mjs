import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { runLocalHarness } from "./local-lifecycle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const tasks = join(repo, "bb-plugin-tasks-plus");
const quota = join(repo, "bb-plugin-codex-quota");
const require = createRequire(join(quota, "package.json"));
const { build } = require("esbuild");
const { compile } = require("@tailwindcss/node");
const { Scanner } = require("@tailwindcss/oxide");
const output = resolve(process.argv[2]);
await runLocalHarness({
  output,
  phase: "home-server",
  execute: async ({ resources, capture }) => {
    await mkdir(join(output, "data"));
    process.env.TMPDIR = join(output, "data");
    await symlink(join(tasks, "node_modules"), join(output, "node_modules"), "dir");
    const write = (name, value) => writeFile(join(output, name), JSON.stringify(value, null, 2));
    let backend;
    let server;
    try {
      await build({
        entryPoints: [join(here, "local-backend.ts")],
        outfile: join(output, "backend.mjs"),
        bundle: true,
        packages: "external",
        platform: "node",
        format: "esm",
        tsconfig: join(tasks, "tsconfig.json"),
      });
      backend = (await import(join(output, "backend.mjs"))).createLocalBackend(
        "bbp60-home-413",
        413,
      );
      resources.backend = backend;
      await write("fixture.json", backend.fixture);
      const graph = await build({
        entryPoints: [join(here, "local-ui.tsx")],
        outfile: join(output, "app.js"),
        bundle: true,
        platform: "browser",
        format: "esm",
        target: "chrome120",
        jsx: "automatic",
        tsconfig: join(tasks, "tsconfig.json"),
        alias: {
          react: join(tasks, "node_modules/react"),
          "react-dom": join(tasks, "node_modules/react-dom"),
          "@get-bb/plugin-sdk/internal/plugin-app-collector": join(
            tasks,
            "node_modules/@get-bb/plugin-sdk/dist/internal/plugin-app-collector.js",
          ),
          "@get-bb/plugin-sdk/app": join(tasks, "node_modules/@get-bb/plugin-sdk/dist/app.js"),
          "@get-bb/plugin-sdk": join(tasks, "node_modules/@get-bb/plugin-sdk/dist/index.js"),
        },
        minify: true,
        sourcemap: true,
        metafile: true,
        define: { "process.env.NODE_ENV": '"production"' },
      });
      const inputs = Object.keys(graph.metafile.inputs);
      if (
        !inputs.some((x) => x.endsWith("/react.production.js")) ||
        !inputs.some((x) => x.endsWith("/react-dom-client.production.js")) ||
        inputs.some((x) => x.endsWith("/react.development.js"))
      )
        throw new Error("Not production React");
      await write("build.json", graph.metafile);
      const css = await compile(await readFile(join(tasks, "tests/preview.css"), "utf8"), {
        base: join(tasks, "tests"),
        onDependency() {},
      });
      const scanner = new Scanner({
        sources: [
          {
            base: tasks,
            pattern: "{components,editor,shell,views}/**/*.{ts,tsx,css}",
            negated: false,
          },
          { base: join(quota, "src"), pattern: "**/*.{ts,tsx}", negated: false },
        ],
      });
      await writeFile(
        join(output, "lab.css"),
        css.build(scanner.scan()) +
          `\n:root{--background:white;--foreground:#242424;--muted:#f2f2f2;--muted-foreground:#666;--border:#ddd;--border-hairline:#e5e5e5;--input:#bbb;--popover:white;--popover-foreground:#242424;--primary:#242424;--primary-foreground:white;--accent:#eee;--accent-foreground:#242424;--ring:#777;--radius:6px;--bb-sidebar-row-height:34px}*{box-sizing:border-box}body{margin:0;font:13px/1.43 system-ui}button,input{font:inherit}button[data-nav-item]{background:transparent;border:0}.lab-sidebar{display:none}.lab-ticket[hidden]{display:none!important}.lab-workspace{display:grid;grid-template-columns:60% 40%;height:100vh}.lab-list,.lab-ticket{height:100%;min-width:0;overflow:hidden}.lab-ticket{border-left:1px solid #ddd;display:flex;flex-direction:column}.lab-ticket>div{flex:1;min-height:0}`,
      );
      const hashes = {};
      for (const name of ["app.js", "app.css", "lab.css", "fixture.json"])
        hashes[name] = createHash("sha256")
          .update(await readFile(join(output, name)))
          .digest("hex");
      await write("provenance.json", {
        commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
        dirty: execFileSync("git", ["status", "--short"], { cwd: repo, encoding: "utf8" }),
        hashes,
        node: process.version,
        rows: 413,
        production: true,
      });
      let signalIndex = backend.harness.realtimeSignals.length;
      server = createServer(async (req, res) => {
        try {
          if (req.headers.host !== new URL(origin).host) return res.writeHead(403).end();
          const path = new URL(req.url, origin).pathname;
          if (req.method === "POST" && path.startsWith("/api/v1/plugins/tasks-plus/rpc/")) {
            let body = "";
            for await (const chunk of req) body += chunk;
            const result = await backend.call(path.split("/").at(-1), JSON.parse(body));
            const signals = backend.harness.realtimeSignals.slice(signalIndex);
            signalIndex += signals.length;
            return res
              .writeHead(200, { "Content-Type": "application/json" })
              .end(JSON.stringify({ ok: true, result, signals }));
          }
          if (req.method === "GET" && path === "/counts")
            return res
              .writeHead(200, { "Content-Type": "application/json" })
              .end(JSON.stringify(backend.calls));
          const files = {
            "/app.js": "app.js",
            "/app.js.map": "app.js.map",
            "/app.css": "app.css",
            "/lab.css": "lab.css",
            "/fixture.json": "fixture.json",
          };
          if (req.method !== "GET" || (path !== "/" && !files[path]))
            return res.writeHead(403).end();
          const bytes =
            path === "/"
              ? '<!doctype html><title>Owned Tasks HOME LIST 413</title><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/lab.css"><script type="module" src="/app.js"></script>'
              : await readFile(join(output, files[path]));
          res
            .writeHead(200, {
              "Content-Type": path.endsWith(".js")
                ? "text/javascript"
                : path.endsWith(".css")
                  ? "text/css"
                  : path.endsWith(".json")
                    ? "application/json"
                    : "text/html",
              "Content-Security-Policy":
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'",
            })
            .end(bytes);
        } catch (error) {
          res
            .writeHead(500, { "Content-Type": "application/json" })
            .end(JSON.stringify({ ok: false, error: error.message }));
        }
      });
      resources.server = server;
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const origin = `http://127.0.0.1:${server.address().port}`;
      await write("ownership.json", {
        pid: process.pid,
        origin,
        repo,
        database: backend.databasePath,
      });
      console.log(`BB_FIXTURE_READY ${JSON.stringify({ origin })}`);
      await new Promise((resolve) => {
        process.once("SIGINT", resolve);
        process.once("SIGTERM", resolve);
      });
    } finally {
      await capture("calls.json", () => backend?.calls ?? []);
    }
  },
});
