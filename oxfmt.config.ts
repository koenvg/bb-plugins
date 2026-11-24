import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  sortPackageJson: false,
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "**/bun.lock",
    ".claude/**",
    ".pi/**",
    ".impeccable/**",
    "openspec/changes/archive/**",
    "**/test/fixtures/**",
    "**/tests/fixtures/**",
    "**/__snapshots__/**",
  ],
  proseWrap: "preserve",
  sortImports: false,
  sortTailwindcss: false,
});
