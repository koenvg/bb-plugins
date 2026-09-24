# Tasks

## 1. Standalone package

- [x] 1.1 Run `bb plugin new code-cleanup`, keep the server-only package under `bb-plugin-code-cleanup/`, remove scaffolded frontend and sample behavior, set `bb.skills: []`, and verify the manifest names only shipped entries and the existing checkout changes remain untouched.
- [x] 1.2 Pin the installed Plugin SDK with `bb plugin types`, install test dependencies needed for the SDK fake host, and verify package installation and TypeScript configuration work without importing private BB modules.

## 2. Project configuration

- [x] 2.1 Add plugin-owned, per-project SQLite state and its migration, defaulting to disabled and preserving a nullable prompt override; verify tests cover isolated project rows and state after reload.
- [x] 2.2 Add validated `bb code-cleanup` enable, disable, show, prompt set, and prompt reset commands for standard project IDs; verify fake-host CLI tests cover invalid projects, empty or oversized text, reset, saved overrides, and unchanged state after rejection.
- [x] 2.3 Document the management commands and saved-state behavior in `bb-plugin-code-cleanup/README.md` and its plugin-local command reference; verify every example matches `bb code-cleanup --help` and no command reference is selected as agent cleanup policy.

## 3. Agent guidance

- [x] 3.1 Write the short default guidance for agent-judged substantial adjacent cleanup, non-issues, duplicate checking, and the actual `bb task-board list` / `add` syntax; verify a prompt-content test excludes OpenForge CLI flags, automatic creation, and minor-nit tasks.
- [x] 3.2 Register exactly one `bb.agents.configure` contribution for enabled standard projects, excluding other projects and side chats; verify fake-host resolution tests cover project isolation, custom overrides, no selected tools or skills, and one contribution after reload.
- [x] 3.3 Document global plugin disable versus project opt-in, task-board unavailability, and the already-running-session limit in the package README; verify the documented behavior against the capability scenarios and package manifest.

## 4. Integration verification

- [x] 4.1 Run focused tests, `bb plugin types`, TypeScript checking, `experimental_scanPublicSdkOnly`, and `bb plugin build`; verify each command passes and only the new plugin and change artifacts differ from the pre-existing checkout state.
- [x] 4.2 Install and globally enable the built plugin in live BB, opt in a test project, and use fresh non-task-creating agent sessions to check guidance appears once there and not in another project; verify the task board remains unchanged.
- [x] 4.3 In live BB, check project disable, prompt override/reset, plugin reload, and global disable against fresh sessions; verify no duplicate or disabled contribution, restore previous plugin/project settings, and clean up disposable verification threads.
