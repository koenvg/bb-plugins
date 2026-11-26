import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runLocalHarness } from "./local-lifecycle.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../package.json"));
const { chromium } = require("@playwright/test");
const output = resolve(process.argv[2]);
const profile = process.argv[3] === "profile";
if (!process.argv[2]) throw new Error("Usage: node home-measure.mjs NEW_OUTPUT_DIR [profile]");
await runLocalHarness({
  output,
  phase: "home",
  execute: async ({ resources, capture }) => {
    const server = spawn(
      process.execPath,
      [join(here, "home-server.mjs"), join(output, "server")],
      {
        cwd: resolve(here, "../../.."),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    resources.serverProcess = server;
    let log = "";
    server.stdout.on("data", (data) => {
      log += data;
    });
    server.stderr.on("data", (data) => {
      log += data;
    });
    let browser, page, cdp;
    try {
      const origin = await (() => {
        const { promise, resolve, reject } = Promise.withResolvers();
        try {
          const timer = setTimeout(
            () => reject(new Error("No owned origin handoff: " + log)),
            30000,
          );
          server.on("exit", (code) => {
            clearTimeout(timer);
            reject(new Error("Server exit " + code + " " + log));
          });
          server.stdout.on("data", () => {
            const match = log.match(/BB_FIXTURE_READY (.+)/);
            if (match) {
              clearTimeout(timer);
              resolve(JSON.parse(match[1]).origin);
            }
          });
        } catch (setupError) {
          reject(setupError);
        }
        return promise;
      })();
      browser = await chromium.launch({
        headless: true,
        executablePath:
          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
          "/Users/koen/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      });
      resources.browser = browser;
      const context = await browser.newContext({
        viewport: { width: 1920, height: 900 },
        timezoneId: "UTC",
        serviceWorkers: "block",
      });
      const blocked = [];
      await context.route("**/*", (route) => {
        if (new URL(route.request().url()).origin !== origin) {
          blocked.push(route.request().url());
          return route.abort();
        }
        return route.continue();
      });
      page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin);
      await page.waitForSelector('[data-task-key="BENCH-11"]');
      if (!(await page.locator(".task-list-columns").isVisible()))
        throw new Error("Wide HOME LIST columns required");
      await fs.writeFile(
        join(output, "browser.json"),
        JSON.stringify(
          {
            version: browser.version(),
            executable: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "cached full Chromium 1248",
            origin,
            profile,
          },
          null,
          2,
        ),
      );
      cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await page.evaluate(() => {
        window.bench = { samples: [], errors: [], calls: [], frames: [], active: null, pending: 0 };
        const b = window.bench;
        window.addEventListener("error", (e) => b.errors.push(String(e.message)));
        window.addEventListener("unhandledrejection", (e) => b.errors.push(String(e.reason)));
        const original = window.fetch;
        window.fetch = async (...args) => {
          const method = String(args[0]).split("/").at(-1);
          const call = { method, start: performance.now(), end: null, ok: false };
          b.calls.push(call);
          b.pending++;
          try {
            const response = await original(...args);
            const copy = await response.clone().json();
            call.ok = response.ok && copy.ok !== false;
            return response;
          } finally {
            call.end = performance.now();
            b.pending--;
          }
        };
        let last;
        const frame = () => {
          const now = performance.now();
          const gap = last === undefined ? 0 : now - last;
          b.frames.push(gap);
          last = now;
          const s = b.active;
          if (s?.start) {
            s.gaps.push(gap);
            const row = document.querySelector(`[data-task-key="${s.key}"]`);
            const matches =
              s.kind === "switch"
                ? row?.getAttribute("data-selected") === "true"
                : row
                    ?.closest("section")
                    ?.querySelector("[data-status-group-header]")
                    ?.getAttribute("data-status-group-header") === s.status;
            if (matches && !s.visual) s.visual = performance.now();
            const calls = b.calls.slice(s.callStart);
            const completed =
              s.kind === "switch"
                ? document
                    .querySelector(".lab-ticket")
                    ?.textContent.includes(
                      window.lab.fixture.tasks.find((t) => t.key === s.key).title,
                    )
                : calls.some((c) => c.method === "updateTask" && c.end && c.ok) &&
                  calls.some((c) => c.method === "listTasks" && c.end && c.ok);
            if (matches && completed && b.pending === 0) {
              if (!s.complete) s.complete = performance.now();
              s.settledFrames++;
              if (s.settledFrames >= 3) {
                s.end = performance.now();
                s.calls = calls;
                s.worstGap = Math.max(...s.gaps);
                s.visualMs = s.visual - s.start;
                s.completionMs = s.complete - s.start;
                s.rows = document.querySelectorAll("[data-task-key]").length;
                b.samples.push(s);
                b.active = null;
              }
            } else s.settledFrames = 0;
            if (performance.now() - s.start > 10000) {
              s.error = "timeout";
              b.samples.push(s);
              b.active = null;
            }
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        b.arm = (spec) => {
          if (b.active) throw new Error("Previous interaction unfinished");
          b.active = {
            ...spec,
            start: null,
            gaps: [],
            callStart: b.calls.length,
            settledFrames: 0,
          };
          document.addEventListener(
            spec.kind === "switch" ? "keydown" : "click",
            () => {
              b.active.start = performance.now();
            },
            { capture: true, once: true },
          );
        };
      });
      await page.click('[data-task-key="BENCH-21"] [data-nav-item]');
      await page.waitForFunction(() => window.lab.read().rendered);
      const idle = await page.evaluate(() =>
        (() => {
          const { promise, resolve, reject } = Promise.withResolvers();
          try {
            const start = window.bench.frames.length;
            setTimeout(() => resolve(window.bench.frames.slice(start)), 2500);
          } catch (setupError) {
            reject(setupError);
          }
          return promise;
        })(),
      );
      await fs.writeFile(output + "/idle.json", JSON.stringify(idle));
      if (idle.length < 100 || [...idle].sort((a, b) => a - b)[Math.floor(idle.length * 0.95)] > 20)
        throw new Error(
          `Invalid idle cadence. ${idle.length} frames in 2500ms. See ${output}/idle.json`,
        );
      if (profile) {
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.start");
        await cdp.send("Tracing.start", {
          categories: "devtools.timeline,blink.user_timing,v8",
          transferMode: "ReturnAsStream",
        });
      }
      await Array.fromAsync(
        (function* () {
          for (let run = 0; run < (profile ? 1 : 5); run++) yield run;
        })(),
        async (run) => {
          await Array.fromAsync(
            (function* () {
              for (let i = 0; i < (profile ? 12 : 32); i++) yield i;
            })(),
            async (i) => {
              const key = i % 2 === 0 ? "BENCH-26" : "BENCH-21";
              await page.focus(
                `[data-task-key="${i % 2 === 0 ? "BENCH-21" : "BENCH-26"}"] [data-nav-item]`,
              );
              await page.evaluate((spec) => window.bench.arm(spec), {
                kind: "switch",
                key,
                run,
                warmup: i < 8,
              });
              await page.keyboard.press(i % 2 === 0 ? "ArrowDown" : "ArrowUp");
              await page.waitForFunction(() => !window.bench.active);
              if (await page.evaluate(() => Boolean(window.bench.samples.at(-1)?.error)))
                throw new Error("Interaction timeout");
              if (
                !(await page.evaluate((key) => {
                  const state = window.lab.read();
                  return state.rendered && state.detailKey === key;
                }, key))
              )
                throw new Error("Full selected ticket mismatch");
            },
          );
          await Array.fromAsync(
            (function* () {
              for (let i = 0; i < (profile ? 12 : 32); i++) yield i;
            })(),
            async (i) => {
              await page.click('[data-task-key="BENCH-11"] button[aria-label^="Change status"]');
              const status = i % 2 === 0 ? "todo" : "backlog";
              await page.evaluate((spec) => window.bench.arm(spec), {
                kind: "status",
                key: "BENCH-11",
                status,
                run,
                warmup: i < 8,
              });
              await page
                .getByRole("menuitem", {
                  name: status === "todo" ? "Todo" : "Backlog",
                  exact: true,
                })
                .click();
              await page.waitForFunction(() => !window.bench.active);
              if (await page.evaluate(() => Boolean(window.bench.samples.at(-1)?.error)))
                throw new Error("Interaction timeout");
            },
          );
          const raw = await page.evaluate(() => ({
            samples: window.bench.samples,
            errors: window.bench.errors,
            failedCalls: window.bench.calls.filter((c) => !c.ok),
            production: window.lab.production,
            viewport: [innerWidth, innerHeight],
            visibility: document.visibilityState,
            browser: navigator.userAgent,
          }));
          await fs.writeFile(output + `/control-${run + 1}.json`, JSON.stringify(raw, null, 2));
          console.log({
            run,
            errors: raw.errors,
            timeouts: raw.samples.filter((s) => s.error).length,
            measured: raw.samples.filter((s) => !s.warmup).length,
          });
        },
      );
      console.log(
        await page.evaluate(() => ({
          selected: document.querySelector('[data-selected="true"]')?.getAttribute("data-task-key"),
          rows: document.querySelectorAll("[data-task-key]").length,
        })),
      );
      if (profile) {
        const result = await cdp.send("Profiler.stop");
        await fs.writeFile(join(output, "cpu-profile.json"), JSON.stringify(result.profile));
        const done = (() => {
          const { promise, resolve, reject } = Promise.withResolvers();
          try {
            cdp.once("Tracing.tracingComplete", resolve);
          } catch (setupError) {
            reject(setupError);
          }
          return promise;
        })();
        await cdp.send("Tracing.end");
        const { stream } = await done;
        let trace = "";
        {
          const runStep = async () => {
            const chunk = await cdp.send("IO.read", { handle: stream });
            trace += chunk.data;
            if (chunk.eof) return { kind: "break" };
          };
          for await (const stepResult of (async function* () {
            while (true) yield runStep();
          })()) {
            if (stepResult?.kind === "break") break;
          }
        }
        await cdp.send("IO.close", { handle: stream });
        await fs.writeFile(join(output, "timeline.json"), trace);
      }
      await page.screenshot({ path: join(output, "fixture.png") });
      await fs.writeFile(join(output, "errors.json"), JSON.stringify({ errors, blocked }));
      if (errors.length || blocked.length) throw new Error("Browser errors/network");
    } finally {
      await capture(
        "partial.json",
        () =>
          page.evaluate(() => ({
            samples: window.bench?.samples,
            active: window.bench?.active,
            errors: window.bench?.errors,
          })),
        Boolean(page),
      );
      await capture("server.log", () => log);
    }
  },
});
console.log(output);
