# review-ui

Review UI parts that more than one plugin in this repo uses: the diff with a gutter **+** and inline cards, the inline comment form, the pending comment card, the "Viewed" checkbox and collapse button, the diff stat, the hunk line helper, the patch hash that viewed marks compare, and `pinToTop`, which keeps an element at the top of a scroll area while content above it loads.

Rules:

- Source files import only `react` and `@pierre/diffs`. bb shims both at runtime, so the plugin bundle needs no copy. Tests can also import `vitest` and `@testing-library/react`.
- Do not import `@get-bb/plugin-sdk`. Pass SDK values (code theme, icons) in through props.
- Props and callbacks only. No RPC calls and no plugin state.

A plugin that uses this folder needs:

- `"../review-ui"` in `tsconfig.json` `include`, and `paths` entries that map `react`, `react/*`, `@pierre/diffs`, `@pierre/diffs/react`, `vitest`, and `@testing-library/react` to its own `node_modules`. See `bb-plugin-changes/tsconfig.json`.
- In `vitest.config.ts`: the same packages in `resolve.dedupe`, `server.fs.allow: [".."]`, and `"../review-ui/**/*.test.{ts,tsx}"` in `test.include`.
