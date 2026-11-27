import { createRoot } from "react-dom/client";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import { ChangesTab } from "../../ui/changes-tab";

const params = new URLSearchParams(location.search);
const FILES = Number(params.get("files") ?? 400);
const LINES = Number(params.get("lines") ?? 120);
const LATENCY = Number(params.get("latency") ?? 40);
const INITIAL = 10;

const delay = () => new Promise((resolve) => setTimeout(resolve, LATENCY));

function pathOf(index: number): string {
  return `src/module-${String(Math.floor(index / 20)).padStart(3, "0")}/file-${String(index).padStart(4, "0")}.ts`;
}

function linesOf(index: number): number {
  return index % 50 === 7 ? LINES * 20 : LINES;
}

function patchOf(index: number): string {
  const path = pathOf(index);
  const count = linesOf(index);
  const body: string[] = [];
  for (let line = 1; line <= count; line += 1) {
    const code = `export function value${index}_${line}(input: number): string { return \`\${input * ${line}}\`; }`;
    if (line % 6 === 0) {
      body.push(`-${code.replace("string", "number")}`, `+${code}`);
    } else if (line % 6 === 3) {
      body.push(`+// added ${line}`);
    } else {
      body.push(` ${code}`);
    }
  }
  const oldCount = body.filter((line) => !line.startsWith("+")).length;
  const newCount = body.filter((line) => !line.startsWith("-")).length;
  return [
    `diff --git a/${path} b/${path}`,
    "index 1111111..2222222 100644",
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${oldCount} +1,${newCount} @@`,
    ...body,
    "",
  ].join("\n");
}

const files = Array.from({ length: FILES }, (_, index) => {
  const count = linesOf(index);
  return {
    path: pathOf(index),
    previousPath: null,
    additions: Math.floor(count / 6) * 2,
    deletions: Math.floor(count / 6),
    binary: false,
    loadMode: "auto" as const,
    status: "modified" as const,
  };
});

const counters = { getPatches: 0, patchesServed: 0 };
(globalThis as unknown as { __perf: unknown }).__perf = counters;
(globalThis as unknown as { __rpc: unknown }).__rpc = {
  getChanges: async () => {
    await delay();
    return {
      kind: "ok",
      environmentId: "env_perf",
      query: { target: "all", mergeBaseBranch: "origin/main" },
      imageBasis: null,
      files,
      patches: Object.fromEntries(
        files.slice(0, INITIAL).map((file, index) => [file.path, patchOf(index)]),
      ),
      commits: [],
    };
  },
  getPatches: async ({ paths }: { paths: string[] }) => {
    counters.getPatches += 1;
    counters.patchesServed += paths.length;
    await delay();
    return {
      kind: "ok",
      patches: Object.fromEntries(
        paths.map((path) => [path, patchOf(files.findIndex((file) => file.path === path))]),
      ),
    };
  },
  getViewed: async () => ({ kind: "ok", marks: {} }),
  updateViewed: async () => ({ kind: "ok" }),
};

const POOL = {
  workerFactory: () => new Worker("/worker.js", { type: "module" }),
  poolSize: 4,
};
const HIGHLIGHTER = { theme: { dark: "pierre-dark", light: "pierre-light" } } as const;

createRoot(document.getElementById("root")!).render(
  params.get("worker") === "0" ? (
    <ChangesTab threadId="thr_perf" />
  ) : (
    <WorkerPoolContextProvider poolOptions={POOL} highlighterOptions={HIGHLIGHTER}>
      <ChangesTab threadId="thr_perf" />
    </WorkerPoolContextProvider>
  ),
);
