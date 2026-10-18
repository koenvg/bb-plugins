# Task webhooks

`bb tasks webhook create --config-file <file> [--project <tracker-prefix-or-id>] --json`
registers a `task.created` receiver. The default is global, even in a linked
thread. Global endpoints supplement matching tracker endpoints. `--project` never
takes a BB `proj_...` ID.

The config file is regular UTF-8 JSON containing `url` and optional
`authorization`. Use a private file with mode `0600`. Do not put tokens in argv,
logs, or task descriptions. Relative paths use the invoking CLI's working
directory. `--machine` selects the file's machine. Stdin is not supported.

- `bb tasks webhook list --json` returns IDs, scopes, and `hasAuthorization` only.
- `bb tasks webhook delete <id> --json` removes the endpoint.
- `bb tasks webhook test <id> --json` sends a marked sample without creating a task.
  Check `outcome.code`, not just the command exit code. `delivered` means an HTTP
  success. Other outcomes contain safe codes and, when available, an HTTP status.

The POST contains `event`, `key`, `project`, `title`, and `createdAt`. The project
is the tracker prefix. Test samples additionally contain `test: true`, key
`WEBHOOK-0`, and title `Webhook test sample`. Authorization is sent exactly.
Redirects are not followed. Use HTTPS for remote receivers.

Task creation does not wait for delivery. Delivery can be lost at restart or
queue overflow. Retries can duplicate events. Endpoint changes affect new jobs;
unload aborts pending jobs without draining. Management permits outbound access
from the BB server, so use only approved receivers.

Limits and retry details are in the package README's Task-created webhooks section.
Registering an endpoint or testing it sends network traffic or configures future
traffic. Do either only within the assigned scope.
