// All endpoints, data and browser resources are newly owned. No BB CLI or live API.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fixtureDigest } from "./fixture.mjs";
import { runLocalHarness } from "./local-lifecycle.mjs";
import { measureLocalNavigation } from "./local-measurement.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const tasks = join(repo, "bb-plugin-tasks-plus");
const quota = join(repo, "bb-plugin-codex-quota");
const requireQuota = createRequire(join(quota, "package.json"));
const { build } = requireQuota("esbuild");
const { compile } = requireQuota("@tailwindcss/node");
const { Scanner } = requireQuota("@tailwindcss/oxide");
const { chromium } = requireQuota("@playwright/test");
const phase = process.argv[2];
if (!["preview", "latency", "profile"].includes(phase) || !process.argv[3])
  throw new Error("Usage: node local-harness.mjs preview|latency|profile NEW_OUTPUT_DIR");
const output = resolve(process.argv[3]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
try {
  await runLocalHarness({
    output,
    phase,
    execute: async ({ ledger, resources, evidence, write, saveLedger }) => {
      ledger.repo = repo;
      ledger.sourceCommit = git("rev-parse", "HEAD");
      ledger.dirtyState = git("status", "--short");
      let backend, server, browserServer, browser, context, page, cdp;
      const { consoleErrors, requests, blocked } = evidence;
      const versions = Object.fromEntries(
        await Promise.all(
          [tasks, quota].map(async (root) => [
            root,
            JSON.parse(
              await readFile(join(root, "node_modules/@get-bb/plugin-sdk/package.json"), "utf8"),
            ).version,
          ]),
        ),
      );
      if (Object.values(versions).some((version) => version !== "0.6.37"))
        throw new Error("Actual SDK mismatch");
      await mkdir(join(output, "data"), { mode: 0o700 });
      process.env.TMPDIR = join(output, "data");
      await symlink(join(tasks, "node_modules"), join(output, "node_modules"), "dir");
      await build({
        entryPoints: [join(here, "local-backend.ts")],
        outfile: join(output, "backend.mjs"),
        bundle: true,
        packages: "external",
        platform: "node",
        format: "esm",
        target: "node24",
        tsconfig: join(tasks, "tsconfig.json"),
      });
      // Resolve external backend dependencies from this owned checkout, not the evidence directory.
      const backendSource = (await readFile(join(output, "backend.mjs"), "utf8")).replaceAll(
        'from "@get-bb/plugin-sdk/testing"',
        `from ${JSON.stringify(join(tasks, "node_modules/@get-bb/plugin-sdk/dist/testing/index.js"))}`,
      );
      await writeFile(join(output, "backend.mjs"), backendSource);
      const module = await import(join(output, "backend.mjs"));
      resources.backend = backend = module.createLocalBackend("bbp60-navigation-lab");
      ledger.database = backend.databasePath;
      await saveLedger();
      // Confirm every fixture read through the schema-validating SDK boundary.
      for (const task of backend.fixture.tasks)
        task.revision = (await backend.call("getTaskByKey", { taskKey: task.key })).task.updatedAt;
      backend.calls.length = 0;
      await write("fixture.json", backend.fixture);
      const browserBuild = await build({
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
        metafile: true,
        define: { "process.env.NODE_ENV": '"production"' },
      });
      const browserInputs = Object.keys(browserBuild.metafile.inputs);
      if (
        !browserInputs.some((name) => name.endsWith("/react.production.js")) ||
        !browserInputs.some((name) => name.endsWith("/react-dom-client.production.js")) ||
        browserInputs.some(
          (name) =>
            name.includes("/testing/app.js") ||
            name.endsWith("/react.development.js") ||
            name.endsWith("/react-dom-client.development.js"),
        )
      )
        throw new Error("Production React dependency graph gate failed");
      await write("browser-build.json", {
        buildMode: "production",
        minify: true,
        inputs: browserInputs,
        metafile: browserBuild.metafile,
      });
      const cssSource = (await readFile(join(quota, "scripts/preview.css"), "utf8")).replace(
        ':where([data-bb-plugin="codex-quota"])',
        ":where(body)",
      );
      const css = await compile(cssSource, { base: join(quota, "scripts"), onDependency() {} });
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
      const styles =
        css.build(scanner.scan()) +
        `\n:root{--background:white;--foreground:#242424;--muted:#f2f2f2;--muted-foreground:#666;--border:#ddd;--border-hairline:#e5e5e5;--input:#bbb;--popover:white;--popover-foreground:#242424;--primary:#242424;--primary-foreground:white;--card:white;--card-foreground:#242424;--accent:#eee;--accent-foreground:#242424;--ring:#777;--radius:6px;--destructive:#a22;--bb-sidebar-row-height:34px;}*{box-sizing:border-box}body{margin:0;font:13px/1.43 system-ui;background:white;color:#242424}button,input{font:inherit}button{cursor:pointer}button[data-nav-item]{background:transparent;border:0}[data-sidebar="menu-button"]>svg[data-icon-root]{width:16px;height:16px;flex:none}.lab-ticket[hidden]{display:none!important}body>div:not(.lab-sidebar){margin-left:180px;height:900px}.lab-sidebar{position:absolute;inset:0 auto 0 0;width:180px;padding:12px;background:#fafafa;border-right:1px solid #ddd;display:flex;flex-direction:column;justify-content:space-between}.lab-workspace{display:grid;grid-template-columns:580px minmax(0,1fr);height:900px}.lab-list{height:100%;min-width:0;overflow:hidden}.lab-ticket{height:100%;min-width:0;overflow:hidden;border-left:1px solid #ddd;display:flex;flex-direction:column}.lab-ticket>header{height:34px;padding:8px;border-bottom:1px solid #ddd}.lab-ticket>div{flex:1;min-height:0}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`;
      await write("lab.css", styles);
      const productionCss = await readFile(join(output, "app.css"));
      const appBytes = await readFile(join(output, "app.js"));
      const provenance = {
        sourceCommit: git("rev-parse", "HEAD"),
        dirtyState: git("status", "--short"),
        sourceDigest: hash(
          Buffer.concat(
            await Promise.all(
              git("ls-files", "bb-plugin-tasks-plus", "bb-plugin-codex-quota")
                .split("\n")
                .map(async (name) =>
                  Buffer.concat([Buffer.from(name + "\0"), await readFile(join(repo, name))]),
                ),
            ),
          ),
        ),
        bundleDigest: hash(appBytes),
        hostCssDigest: hash(styles),
        productionCssDigest: hash(productionCss),
        cssCascade: ["app.css", "lab.css"],
        buildMode: "production",
        minify: true,
        react: JSON.parse(await readFile(join(tasks, "node_modules/react/package.json"), "utf8"))
          .version,
        reactDom: JSON.parse(
          await readFile(join(tasks, "node_modules/react-dom/package.json"), "utf8"),
        ).version,
        harnessDigest: hash(
          Buffer.concat(
            await Promise.all(
              [
                "local-backend.ts",
                "local-host.tsx",
                "local-ui.tsx",
                "local-identity.mjs",
                "local-harness.mjs",
                "local-lifecycle.mjs",
                "local-measurement.mjs",
              ].map((name) => readFile(join(here, name))),
            ),
          ),
        ),
        fixtureDigest: fixtureDigest(backend.fixture),
        sdk: versions,
        viewport: [1440, 900],
        cpuThrottlingRate: 1,
        mode: phase,
        node: process.version,
        machine: { platform: process.platform, architecture: process.arch },
        limitations: [
          "Local headless mock ranking only, not installed acceptance.",
          "Production createRoot with a small documented PluginSdkApp host adapter; not the installed BB renderer.",
          "Host layout is a small fixed native-tab double, not the BB renderer or compact drawer.",
          "Actual quota adapter and QuotaBadge run with unavailable synthetic quota; no collector, OAuth or host transport.",
          "50 alternating user/agent comments have no real thread/provider lifecycle; attachment metadata and text bytes are local.",
        ],
      };
      evidence.provenance = provenance;
      let signalIndex = backend.harness.realtimeSignals.length;
      resources.server = server = createServer(async (req, res) => {
        try {
          if (req.headers.host !== ledger.server?.host) return res.writeHead(403).end();
          const path = new URL(req.url, "http://127.0.0.1").pathname;
          if (req.method === "POST" && path.startsWith("/api/v1/plugins/tasks-plus/rpc/")) {
            let text = "";
            for await (const chunk of req) {
              text += chunk;
              if (text.length > 262144) throw new Error("Body too large");
            }
            const result = await backend.call(path.split("/").at(-1), JSON.parse(text));
            const signals = backend.harness.realtimeSignals.slice(signalIndex);
            signalIndex = backend.harness.realtimeSignals.length;
            return res
              .writeHead(200, { "Content-Type": "application/json" })
              .end(JSON.stringify({ ok: true, result, signals }));
          }
          const files = {
            "/": "index.html",
            "/app.js": "app.js",
            "/app.css": "app.css",
            "/lab.css": "lab.css",
            "/fixture.json": "fixture.json",
          };
          if (req.method !== "GET" || !files[path]) return res.writeHead(403).end();
          const bytes =
            path === "/"
              ? '<!doctype html><html><head><meta charset="utf-8"><title>Owned Tasks navigation lab</title><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/lab.css"></head><body><script type="module" src="/app.js"></script></body></html>'
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
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'",
            })
            .end(bytes);
        } catch (error) {
          res
            .writeHead(500, { "Content-Type": "application/json" })
            .end(JSON.stringify({ ok: false, error: error.message }));
        }
      });
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const endpoint = `http://127.0.0.1:${server.address().port}`;
      ledger.server = { pid: process.pid, endpoint, host: new URL(endpoint).host };
      await saveLedger();
      resources.browserServer = browserServer = await chromium.launchServer({ headless: true });
      ledger.browser = {
        pid: browserServer.process().pid,
        args: browserServer.process().spawnargs,
        endpoint: browserServer.wsEndpoint(),
        contextId: randomUUID(),
      };
      await saveLedger();
      resources.browser = browser = await chromium.connect(browserServer.wsEndpoint());
      resources.context = context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        timezoneId: "UTC",
        serviceWorkers: "block",
      });
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== endpoint) {
          blocked.push(url.href);
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });
      resources.page = page = await context.newPage();
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      page.on("request", (request) =>
        requests.push({ url: request.url(), method: request.method() }),
      );
      const loadedResponse = page.waitForResponse(
        (response) => response.url() === endpoint + "/app.js",
      );
      await page.goto(endpoint);
      const loadedBundle = await (await loadedResponse).body();
      if (hash(loadedBundle) !== hash(appBytes))
        throw new Error("Loaded/served/disk bundle mismatch");
      await page.waitForFunction(() => Boolean(window.lab), null, { timeout: 30000 });
      await page.waitForSelector('[data-task-key="BENCH-1"] [data-nav-item]');
      await page.locator('[data-task-key="BENCH-1"] [data-nav-item]').click();
      await page.waitForFunction(
        () => window.lab.read().rendered && window.lab.read().detailKey === "BENCH-1",
      );
      provenance.production = await page.evaluate(() => window.lab.production);
      provenance.loadedBundleDigest = hash(loadedBundle);
      if (
        provenance.production.buildMode !== "production" ||
        provenance.production.actType !== "undefined" ||
        provenance.production.reactVersion !== provenance.react ||
        provenance.production.sdkTestingRenderer !== false
      )
        throw new Error("Runtime production proof failed");
      await page.screenshot({ path: join(output, "early-ui.png") });
      const visibleOrder = await page
        .locator("[data-task-key]")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-task-key")));
      const start = visibleOrder.indexOf(backend.fixture.warmKeys[0]);
      if (start < 0 || backend.fixture.warmKeys.some((key, i) => visibleOrder[start + i] !== key))
        throw new Error("Warm fixture is not consecutive in actual visible order");
      await write("visible-order.json", visibleOrder);
      provenance.browser = browser.version();
      provenance.browserExecutable = browserServer.process().spawnfile;
      provenance.endpoint = endpoint;
      await write("provenance.json", provenance);
      if (consoleErrors.length) throw new Error("UI errors: " + consoleErrors.join("; "));
      if (phase !== "preview") {
        resources.cdp = cdp = await context.newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        const move = await measureLocalNavigation({
          page,
          cdp,
          fixture: backend.fixture,
          phase,
          evidence,
          write,
          provenance,
        });
        // Cases never enter the qualified warm result or the profile interval.
        if (phase === "latency") {
          await page.evaluate(() => window.lab.invalidate("BENCH-2"));
          await page.evaluate(() => window.lab.startProbe());
          const invalidation = await move("BENCH-2", "cold");
          await write("invalidation.json", invalidation);
          const coldBefore = await page.evaluate(() => ({
            qualification: window.lab.qualification.ledger.inspect("BENCH-80"),
            calls: window.lab.slot.inspection.rpcCalls.filter(
              (call) => call.method === "getTaskByKey" && call.input?.taskKey === "BENCH-80",
            ),
          }));
          if (coldBefore.qualification.current || coldBefore.calls.length)
            throw new Error("Cold destination was already requested");
          await page.evaluate(() =>
            document.addEventListener(
              "click",
              () => {
                window.lab.clickStart = performance.now();
              },
              { once: true, capture: true },
            ),
          );
          await page.locator('[data-task-key="BENCH-80"] [data-nav-item]').click();
          await page.waitForFunction(
            () => window.lab.read().rendered && window.lab.read().detailKey === "BENCH-80",
          );
          await page.evaluate(
            () =>
              new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
          );
          const coldAfter = await page.evaluate(
            (before) => ({
              classification: "cold",
              before,
              qualification: window.lab.qualification.ledger.qualify(before.qualification),
              identity: window.lab.read(),
              latencyMs: performance.now() - window.lab.clickStart,
              timingMethod:
                "Captured click to matching full content plus two rAF, driver polling included",
            }),
            coldBefore,
          );
          if (!coldAfter.identity.rendered || coldAfter.identity.detailKey !== "BENCH-80")
            throw new Error("Cold identity changed");
          await write("cold-selection.json", coldAfter);
          backend.control({ failRead: "BENCH-99" });
          await page.locator('[data-task-key="BENCH-99"] [data-nav-item]').click();
          await page.getByRole("button", { name: "Retry", exact: true }).first().waitFor();
          await write("failed-read.json", {
            selected: await page.locator('[data-selected="true"]').getAttribute("data-task-key"),
            text: await page.locator(".lab-ticket").innerText(),
          });
          backend.control({ failRead: null });
          const coldRetryBefore = await page.evaluate(() =>
            window.lab.qualification.ledger.inspect("BENCH-99"),
          );
          await page.evaluate(() =>
            document.addEventListener(
              "click",
              () => {
                window.lab.clickStart = performance.now();
              },
              { once: true, capture: true },
            ),
          );
          await page.getByRole("button", { name: "Retry", exact: true }).first().click();
          await page.waitForFunction(
            () => window.lab.read().rendered && window.lab.read().detailKey === "BENCH-99",
          );
          await page.evaluate(
            () =>
              new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
          );
          await write(
            "cold-retry.json",
            await page.evaluate(
              (before) => ({
                classification: "cold-retry",
                qualification: window.lab.qualification.ledger.qualify(before),
                identity: window.lab.read(),
                latencyMs: performance.now() - window.lab.clickStart,
                timingMethod:
                  "Captured Retry click to matching full content plus two rAF, driver polling included",
              }),
              coldRetryBefore,
            ),
          );
          await page.locator('[data-task-key="BENCH-3"] [data-nav-item]').click();
          await page.waitForFunction(
            () => window.lab.read().rendered && window.lab.read().detailKey === "BENCH-3",
          );
          // Native title editing creates a real pending write and save barrier.
          const input = page.getByRole("textbox", { name: "Task title" });
          await input.click();
          backend.control({ saveDelay: 350 });
          await input.fill(backend.fixture.tasks[2].title + " pending");
          const saveStart = Date.now();
          await page.locator('[data-task-key="BENCH-4"] [data-nav-item]').click();
          await page.waitForFunction(
            () => window.lab.read().rendered && window.lab.read().detailKey === "BENCH-4",
          );
          await write("save-wait.json", {
            classification: "save-pending",
            elapsedMs: Date.now() - saveStart,
            calls: backend.calls.filter((call) => call.method === "updateTask"),
          });
          backend.control({ saveDelay: 0, failSave: true });
          await page
            .getByRole("textbox", { name: "Task title" })
            .fill(backend.fixture.tasks[3].title + " failed draft");
          await page.locator('[data-task-key="BENCH-5"] [data-nav-item]').click();
          await page.getByRole("button", { name: "Retry save", exact: true }).waitFor();
          const failedSave = {
            classification: "failed",
            rowKey: await page.locator('[data-selected="true"]').getAttribute("data-task-key"),
            draft: await page.getByRole("textbox", { name: "Task title" }).textContent(),
          };
          if (failedSave.rowKey !== "BENCH-4" || !failedSave.draft.endsWith("failed draft"))
            throw new Error("Failed save lost origin/draft");
          await write("failed-save.json", failedSave);
          backend.control({ failSave: false });
          await page.getByRole("button", { name: "Retry save", exact: true }).click();
          await page.waitForFunction(
            () => window.lab.read().rendered && window.lab.read().detailKey === "BENCH-5",
          );
          const heavyStart = Date.now();
          await page.locator('[data-task-key="BENCH-100"] [data-nav-item]').click();
          await page.waitForFunction(
            () => window.lab.read().rendered && window.lab.read().detailKey === "BENCH-100",
          );
          const heavyDescription = await page.evaluate(() => window.lab.read());
          const descriptionMs = Date.now() - heavyStart;
          await page
            .getByRole("region", { name: "Activity", exact: true })
            .scrollIntoViewIfNeeded();
          await page.waitForFunction(
            () =>
              document.querySelectorAll(
                '[data-detail-key="BENCH-100"] .tiptap[contenteditable="false"]',
              ).length === 50,
          );
          const heavy = await page.evaluate(() => {
            const activity = document.querySelector(
              '[data-detail-key="BENCH-100"] [aria-label="Activity"]',
            );
            return {
              readOnlyEditors: activity.querySelectorAll('.tiptap[contenteditable="false"]').length,
              commentHeadings: [...activity.querySelectorAll(".tiptap h3")].map(
                (node) => node.textContent,
              ),
              attachmentLinks: [...activity.querySelectorAll("a[download]")].map((node) => ({
                name: node.textContent,
                href: node.getAttribute("href"),
              })),
            };
          });
          if (
            heavy.commentHeadings.length !== 50 ||
            heavy.commentHeadings.some((heading, i) => heading !== `Review ${i + 1}`)
          )
            throw new Error("Heavy activity content mismatch");
          await write("heavy-activity.json", {
            classification: "heavy",
            description: heavyDescription,
            descriptionMs,
            activationTotalMs: Date.now() - heavyStart,
            ...heavy,
          });
        }
      }
      if (blocked.length) throw new Error("Unexpected external network attempt");
      if (consoleErrors.length) throw new Error("UI errors: " + consoleErrors.join("; "));
    },
  });
} catch (error) {
  process.exitCode = 1;
  console.error(error.stack);
}
console.log(output);
