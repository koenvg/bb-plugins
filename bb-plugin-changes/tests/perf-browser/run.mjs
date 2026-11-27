import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
const { values } = parseArgs({
  options: {
    root: { type: "string", multiple: true },
    runs: { type: "string", default: "3" },
    files: { type: "string", default: "400" },
    lines: { type: "string", default: "120" },
    out: { type: "string" },
    serve: { type: "boolean", default: false },
    profile: { type: "boolean", default: false },
    heap: { type: "boolean", default: false },
  },
});
const packageDir = resolve(import.meta.dir, "../..");
const roots = (values.root ?? [packageDir]).map((root) => resolve(root));
const runs = Number(values.runs);
const out = resolve(
  values.out ?? join(process.env.BB_THREAD_STORAGE ?? tmpdir(), `perf-${Date.now()}`),
);
await mkdir(out, { recursive: true });
async function bundle(root) {
  const fakeSdk = join(import.meta.dir, "fake-sdk.tsx");
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, "fixture.tsx")],
    target: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
    minify: !values.profile,
    plugins: [
      {
        name: "perf-fixture",
        setup(build) {
          build.onResolve({ filter: /^@get-bb\/plugin-sdk\/app$/ }, () => ({ path: fakeSdk }));
          build.onResolve({ filter: /^\.\.\/\.\.\/ui\/changes-tab$/ }, ({ importer }) =>
            importer.endsWith("/tests/perf-browser/fixture.tsx")
              ? { path: Bun.resolveSync("./ui/changes-tab", root) }
              : undefined,
          );
          build.onResolve({ filter: /^@\// }, ({ path }) => ({
            path: Bun.resolveSync(`./${path.slice(2)}`, root),
          }));
          build.onResolve({ filter: /^(?![./@])|^@(?!\/)[^/]+\// }, ({ path, importer }) =>
            importer.includes("/node_modules/")
              ? undefined
              : { path: Bun.resolveSync(path, packageDir) },
          );
        },
      },
    ],
  });
  assert(
    built.success,
    built.logs.map(String).join(`
`),
  );
  return built.outputs[0].text();
}
const PROBE = `
  window.__marks = { longTasks: [] };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__marks.longTasks.push(entry.duration);
  }).observe({ type: "longtask", buffered: true });
  const firstDiff = () => {
    for (const host of document.querySelectorAll("diffs-container")) {
      if (host.shadowRoot?.querySelector("[data-line]")) return true;
    }
    return false;
  };
  const poll = () => {
    if (firstDiff()) { window.__marks.firstDiff = performance.now(); return; }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
`;
function printHotspots(profile) {
  const self = new Map();
  profile.samples.forEach((id, index) =>
    self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0)),
  );
  const byName = new Map();
  for (const node of profile.nodes) {
    const name = `${node.callFrame.functionName || "(anonymous)"} ${node.callFrame.url.split("/").at(-1)}:${node.callFrame.lineNumber}`;
    byName.set(name, (byName.get(name) ?? 0) + (self.get(node.id) ?? 0));
  }
  const total = [...byName.values()].reduce((a, b) => a + b, 0);
  for (const [name, micros] of [...byName].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(
      `${((micros / total) * 100).toFixed(1).padStart(5)}%  ${(micros / 1000).toFixed(0).padStart(7)} ms  ${name}`,
    );
  }
}
async function metrics(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
}
async function settle(page) {
  let last = -1;
  for (let quiet = 0; quiet < 4;) {
    await page.waitForTimeout(250);
    const served = await page.evaluate(() => window.__perf.patchesServed);
    quiet = served === last ? quiet + 1 : 0;
    last = served;
  }
}
async function sample(origin, root) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.addInitScript(PROBE);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.goto(`${origin}/?files=${values.files}&lines=${values.lines}`);
    await page.waitForFunction(() => window.__marks.firstDiff !== undefined, null, {
      timeout: 30000,
    });
    await settle(page);
    const firstDiffMs = await page.evaluate(() => window.__marks.firstDiff);
    const loadLongTaskMs = await page.evaluate(() =>
      window.__marks.longTasks.reduce((a, b) => a + b, 0),
    );
    await page.evaluate(() => {
      window.__marks.longTasks = [];
    });
    if (values.profile) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.start");
    }
    const before = await metrics(cdp);
    const scroll = await page.evaluate(async () => {
      const area = document.querySelector("[data-diff-scroll-area]");
      const gaps = [];
      let previous = performance.now();
      let running = true;
      const frame = (time) => {
        gaps.push(time - previous);
        previous = time;
        if (running) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      const start = performance.now();
      let steps = 0;
      let backwards = 0;
      while (area.scrollTop + area.clientHeight < area.scrollHeight - 2) {
        steps += 1;
        const target = area.scrollTop + 600;
        area.scrollTop = target;
        await new Promise((done) => requestAnimationFrame(done));
        if (area.scrollTop < target - 1) backwards += target - area.scrollTop;
        await new Promise((done) => setTimeout(done, 16));
      }
      running = false;
      gaps.sort((a, b) => a - b);
      return {
        steps,
        backwardsPx: Math.round(backwards),
        scrollHeight: area.scrollHeight,
        scrollMs: performance.now() - start,
        maxFrameGapMs: gaps.at(-1) ?? 0,
        p95FrameGapMs: gaps[Math.floor(gaps.length * 0.95)] ?? 0,
      };
    });
    await settle(page);
    const after = await metrics(cdp);
    if (values.profile) {
      const { profile } = await cdp.send("Profiler.stop");
      await Bun.write(join(out, `scroll-${Date.now()}.cpuprofile`), JSON.stringify(profile));
      printHotspots(profile);
    }
    const scrollLongTaskMs = await page.evaluate(() =>
      window.__marks.longTasks.reduce((a, b) => a + b, 0),
    );
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("HeapProfiler.collectGarbage");
    const final = await metrics(cdp);
    if (values.heap) {
      const chunks = [];
      cdp.on("HeapProfiler.addHeapSnapshotChunk", ({ chunk }) => chunks.push(chunk));
      await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
      await Bun.write(join(out, `heap-${Date.now()}.heapsnapshot`), chunks.join(""));
    }
    const dom = await page.evaluate(() => {
      const hosts = Array.from(document.querySelectorAll("diffs-container"));
      return {
        mountedDiffs: hosts.length,
        shadowElements: hosts.reduce(
          (sum, host) => sum + (host.shadowRoot?.querySelectorAll("*").length ?? 0),
          0,
        ),
        counters: window.__perf,
      };
    });
    return {
      root,
      firstDiffMs,
      loadLongTaskMs,
      ...scroll,
      scrollScriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
      scrollTaskMs: (after.TaskDuration - before.TaskDuration) * 1000,
      taskPerStepMs: ((after.TaskDuration - before.TaskDuration) * 1000) / scroll.steps,
      scrollLayoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
      scrollStyleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
      scrollLongTaskMs,
      heapMb: final.JSHeapUsedSize / 1024 / 1024,
      domNodes: final.Nodes,
      mountedDiffs: dom.mountedDiffs,
      shadowElements: dom.shadowElements,
      getPatchesCalls: dom.counters.getPatches,
      patchesServed: dom.counters.patchesServed,
      errors,
    };
  } finally {
    await browser.close();
  }
}
execFileSync("bb", ["plugin", "build", packageDir], { stdio: "ignore" });
const css = await Bun.file(join(packageDir, "dist/app.css")).text();
const bundles = await Promise.all(roots.map(bundle));
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/worker.js") {
      return new Response(
        Bun.file(Bun.resolveSync("@pierre/diffs/worker/worker-portable.js", packageDir)),
        {
          headers: { "content-type": "text/javascript" },
        },
      );
    }
    if (url.pathname === "/app.css") {
      return new Response(css, { headers: { "content-type": "text/css" } });
    }
    const match = /^\/(\d+)\/(fixture\.js)?$/.exec(url.pathname);
    if (match === null) return new Response("Not found", { status: 404 });
    if (match[2] !== undefined) {
      return new Response(bundles[Number(match[1])], {
        headers: { "content-type": "text/javascript" },
      });
    }
    return new Response(
      `<!doctype html><html class="dark"><head><link rel="stylesheet" href="/app.css"><style>html,body,#root{margin:0;height:100%}body{font:13px system-ui;background:#111;color:#eee}</style></head><body><div id="root" data-bb-plugin="changes"></div><script type="module" src="/${match[1]}/fixture.js"></script></body></html>`,
      { headers: { "content-type": "text/html" } },
    );
  },
});
if (values.serve) {
  console.log(`http://127.0.0.1:${server.port}/0/`);
  await new Promise(() => {});
}
const samples = [];
try {
  for (let run = 0; run < runs; run += 1) {
    for (const [index, root] of roots.entries()) {
      const result = await sample(`http://127.0.0.1:${server.port}/${index}`, root);
      samples.push(result);
      console.log(JSON.stringify(result));
    }
  }
} finally {
  await server.stop(true);
}
const median = (numbers) => numbers.toSorted((a, b) => a - b)[Math.floor(numbers.length / 2)];
const keys = [
  "firstDiffMs",
  "loadLongTaskMs",
  "steps",
  "backwardsPx",
  "scrollHeight",
  "scrollMs",
  "scrollScriptMs",
  "scrollTaskMs",
  "taskPerStepMs",
  "scrollLayoutMs",
  "scrollStyleMs",
  "scrollLongTaskMs",
  "maxFrameGapMs",
  "p95FrameGapMs",
  "heapMb",
  "domNodes",
  "mountedDiffs",
  "shadowElements",
  "getPatchesCalls",
];
const summary = roots.map((root) => {
  const mine = samples.filter((entry) => entry.root === root);
  return {
    root,
    runs: mine.length,
    errors: mine.flatMap((entry) => entry.errors),
    ...Object.fromEntries(
      keys.map((key) => {
        const numbers = mine.map((entry) => entry[key]);
        return [
          key,
          {
            median: Math.round(median(numbers)),
            min: Math.round(Math.min(...numbers)),
            max: Math.round(Math.max(...numbers)),
          },
        ];
      }),
    ),
  };
});
await Bun.write(join(out, "samples.json"), JSON.stringify({ samples, summary }, null, 2));
console.table(
  Object.fromEntries(
    keys.map((key) => [
      key,
      Object.fromEntries(
        summary.map((entry, index) => [
          `root${index}`,
          `${entry[key].median} (${entry[key].min}-${entry[key].max})`,
        ]),
      ),
    ]),
  ),
);
console.log(join(out, "samples.json"));
