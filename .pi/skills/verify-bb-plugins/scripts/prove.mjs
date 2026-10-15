#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const [origin, evidence] = process.argv.slice(2);
if (!origin || !evidence) throw new Error("Usage: prove.mjs ORIGIN EXISTING_EVIDENCE_DIRECTORY");
const url = new URL(origin);
assert.equal(url.origin, origin);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.protocol, "http:");
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const require = createRequire(join(root, "bb-plugin-markdown-reader/package.json"));
const { chromium } = require("@playwright/test");
const sourcePath = join(root, "bb-plugin-markdown-reader/tests/fixtures/report.md");
const source = await readFile(sourcePath, "utf8");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const actions = [];
const errors = [];
const blocked = [];
const requests = [];
const record = (action) => actions.push({ action, at: new Date().toISOString() });
let browser;
let context;
let passed = false;
try {
  browser = await chromium.launch();
  context = await browser.newContext({
    viewport: { width: 1100, height: 1000 },
    serviceWorkers: "block",
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  await context.route("**/*", async (route) => {
    const request = route.request();
    requests.push({ method: request.method(), url: request.url() });
    if (new URL(request.url()).origin === origin) await route.continue();
    else {
      blocked.push(request.url());
      await route.abort("blockedbyclient");
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  const capture = async (name) => {
    await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true });
    await writeFile(join(evidence, `${name}.aria.txt`), await page.locator("body").ariaSnapshot());
  };
  record("Open the read-only document in Preview");
  await page.goto(`${origin}/?width=760&theme=light`);
  await page.getByRole("heading", { name: "Reading a workspace document", exact: true }).waitFor();
  const readsBefore = await page.locator("html").getAttribute("data-fixture-reads");
  assert.equal(readsBefore, "1");
  await capture("01-preview");
  record("Focus Raw and press Enter");
  await page.getByRole("button", { name: "Raw", exact: true }).focus();
  await page.keyboard.press("Enter");
  const raw = page.getByLabel("Raw Markdown", { exact: true });
  await raw.waitFor();
  assert.equal(await raw.textContent(), source);
  assert.equal(await raw.getAttribute("contenteditable"), null);
  await capture("02-raw");
  record("Focus Preview and press Enter");
  await page.getByRole("button", { name: "Preview", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Reading a workspace document", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Preview", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await page.locator("html").getAttribute("data-fixture-reads"), readsBefore);
  assert.equal(hash(await readFile(sourcePath, "utf8")), hash(source));
  await capture("03-preview-restored");
  assert.deepEqual(blocked, []);
  assert.deepEqual(errors, []);
  assert(requests.every(({ method }) => method === "GET"));
  record(
    "Assert exact Raw text, unchanged source hash, one boundary read, only GET requests, and no remote requests or page errors",
  );
  passed = true;
} finally {
  try {
    if (context) await context.tracing.stop({ path: join(evidence, "trace.zip") });
  } finally {
    try {
      await browser?.close();
    } finally {
      await writeFile(
        join(evidence, "result.json"),
        JSON.stringify(
          {
            feature: "document-views",
            entry: "fixture root",
            fixtureOnly: true,
            passed,
            origin,
            sourceSha256: hash(source),
            actions,
            requests,
            blocked,
            errors,
            limits: [
              "Host reads are simulated; no installed BB, opener routing, native host files, or live composer acceptance.",
            ],
          },
          null,
          2,
        ) + "\n",
      );
    }
  }
}
console.log(`Document views passed. Evidence: ${evidence}`);
