# Changes tab performance fixture

Measures the Changes tab in Chromium with a large synthetic diff. Use it to compare two versions of the tab before you report a speedup or regression.

```sh
bun install --cwd bb-plugin-changes --frozen-lockfile
(cd bb-plugin-changes && bun --bun run playwright install chromium)
bun run --cwd bb-plugin-changes test:perf-browser --runs 3
```

## What it does

- Builds the plugin with `bb plugin build` to get the real Tailwind CSS.
- Bundles `ChangesTab` with a fake bb SDK. RPCs answer from memory after 40 ms.
- Wraps the tab in a `@pierre/diffs` worker pool, as bb does, so highlighting runs off the main thread.
- Opens 400 files of 120 lines. Every 50th file has 2,400 lines. The first 10 patches come with the file list.
- Scrolls the diff 600 px per frame to the bottom, then waits until no patch loads for 1 s.

## Options

| Option         | Default                          | Effect                                                                                                     |
| -------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `--root <dir>` | this package                     | A `bb-plugin-changes` directory to measure. Repeat it to compare versions. Runs alternate between roots.   |
| `--runs <n>`   | 3                                | Runs per root.                                                                                             |
| `--files <n>`  | 400                              | Files in the diff.                                                                                         |
| `--lines <n>`  | 120                              | Lines per normal file.                                                                                     |
| `--out <dir>`  | `$BB_THREAD_STORAGE/perf-<time>` | Where `samples.json` goes.                                                                                 |
| `--profile`    | off                              | Saves a CPU profile of the scroll and prints the top functions. Do not report numbers from a profiled run. |
| `--heap`       | off                              | Saves a heap snapshot after the scroll.                                                                    |
| `--serve`      | off                              | Serves the fixture and prints its URL.                                                                     |

To measure an older version, extract it next to its `review-ui`:

```sh
mkdir -p /tmp/perf-base && git archive main bb-plugin-changes review-ui | tar -x -C /tmp/perf-base
bun run --cwd bb-plugin-changes test:perf-browser --root /tmp/perf-base/bb-plugin-changes --root .
```

## Read the result

| Metric                                               | Meaning                                                                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `firstDiffMs`                                        | Page start until the first diff line shows.                                                                                         |
| `taskPerStepMs`                                      | Main-thread busy time per 600 px scroll step. Compare this, not `scrollTaskMs`, because scroll anchoring can change the step count. |
| `scrollLongTaskMs`, `maxFrameGapMs`, `p95FrameGapMs` | Jank while scrolling.                                                                                                               |
| `heapMb`, `domNodes`                                 | Main-thread JS heap and DOM nodes after a forced GC at the bottom.                                                                  |
| `mountedDiffs`                                       | `diffs-container` elements still in the page at the bottom.                                                                         |

The fixture is not bb. It does not cover bb's server, real git reads, or the native file viewer. Close other heavy work while it runs, and run at least 3 times per root.
