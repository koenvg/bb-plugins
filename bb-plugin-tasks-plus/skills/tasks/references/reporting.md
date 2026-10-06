# Task outcome comments

Read this reference when review readiness, completion, failure, a blocker or a user decision needs a task comment.

Write a short plain-language result with relevant checks, material limits and any decision needed. A single sentence is enough when it covers the outcome. Use any readable Markdown format; there is no word target or required bullet count.

For review or completion, name relevant passed, unrun or blocked checks. Do not present unrun checks as passed. Distinguish worker-reported results from checks you verified. A comment does not change status or meet unfinished review or acceptance gates.

Keep logs, file lists, full commit hashes and detailed handoff evidence in the linked thread or an artifact. Preserve exact commits and baselines in handoffs. Use real task, thread, PR or attachment links. Task-card directives belong in chat responses, not comments.

If the user requests a parent summary, read current relevant task/child state. Treat failed reads or conflicting state as unknown. Count only done children as done; child counts or worker reports do not prove parent acceptance. State remaining integration or acceptance work. Posting a comment does not authorize dispatch, task restructuring or approval.

## Post a multiline comment

Use `bb tasks comment ABC-12 --body-file <path>` for an existing Markdown file. For inline text, use a quoted heredoc to keep backticks and shell expressions literal. Replace placeholder task and thread IDs with real destinations:

```sh
bb tasks comment ABC-12 --body "$(cat <<'REPORT'
**The change is ready for review.**

- Focused checks pass for `parse()` and literal `$(name)` input.
- Next: complete the required review.
- [Evidence](bbthread://thr_abc123).
REPORT
)"
```

Before using `--notify`, read [Notify the latest responder](task-records.md#notify-the-latest-responder). Reporting alone does not authorize a notification, polling or wakeups.
