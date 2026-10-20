# Dedicated Chrome browser contract

Use this reference for installed BB checks through Browser Use, including connection failures, login walls, and cleanup. Browser Use 0.13.10 accepts Python scripts on stdin. Browser Harness 0.1.13 provides the helpers and named daemons. Legacy sessions do not migrate. Leave their processes and files unchanged.

Owned Playwright fixtures, including Compose Chat's synthetic runner, use the package's documented prerequisites and `bun run test:browser` command instead. They do not require Browser Use, Browser Harness, or a separately provisioned browser or profile. The runner starts this checkout on an owned loopback port, hands its origin to Playwright, and cleans only its own processes and temporary resources. Follow the package's evidence and cleanup rules. A fixture pass does not establish installed acceptance.

The remaining sections apply only to the installed Browser Use route.

## Browser policy and approval

Verify requires dedicated local Chrome or Chromium. The global browser policy prefers Arc for signed-in work. The verify rule does not grant permission to change that global selection. Before authenticated checks, record explicit approval to use dedicated Chrome and the intended account. Without that approval, mark the browser checks blocked. Ask one question, for example:

> May I use dedicated Chrome for this signed-in verification and close only the tabs and processes this run creates? This does not allow Arc attachment or credential transfer.

Use a user-approved, separately provisioned Chrome browser and profile with an explicit local CDP endpoint. Record how the user selected it and how the endpoint maps to its process and profile. A Chrome product string alone cannot distinguish Arc from Chrome. A familiar port or matching page URL does not prove identity. If process/profile identity is uncertain, stop and ask the user to identify or provision the dedicated browser.

This route does not start Chrome automatically. Ask before browser launch, remote-debugging or Accessibility permission changes, or foreground activation. Define setup and cleanup approval together. A daemon name isolates tool routing, not browser profiles or BB's database. Run local actions in sequence.

## Inspect the installed contract

1. Load the installed `browser-use` skill and its multi-session and CDP/Python references. Inspect `browser-use --help` and the matching `browser-harness --help` before choosing commands. Resolve the harness executable from the same installation as Browser Use, not another environment. In the inspected installation it is `/Users/koen/.browser-use-env/bin/browser-harness`. Set `harness` to the confirmed executable path.
2. Confirm helper signatures from the installed harness `helpers.py` without making a browser call. This route uses `cdp(method, session_id=None, _response_timeout=..., **params)`, `current_tab`, `list_tabs`, `new_tab`, and `close_tab`. Public `Target.attachToTarget` returns a CDP session ID for the recorded target. If these are unavailable, report the prerequisite. Do not change installed tools or use private session internals.
3. Use harness diagnostics directly. In Browser Use 0.13.10, the wrapper rejects `doctor --json` despite advertising it. The strict harness diagnostic checks only the named daemon and does not start, repair, or discover a browser.

## Provision once, then require strict reuse

Set a fresh unique `BU_NAME`, for example `verify-<plugin-id>-<run-id>`. Record the approved browser process/profile, endpoint, name, and process ownership in the state ledger before connection. Do not use `default` or borrow another run's name. The examples use an approved HTTP endpoint. For a WebSocket endpoint, set `BU_CDP_WS` instead and unset `BU_CDP_URL`.

```sh
export BU_NAME="$run_name" BU_CDP_URL="$approved_chrome_endpoint"
unset BU_CDP_WS
export BH_TAB_MARKER=0 BH_RECORD=0 BU_AUTOSPAWN=""
"$harness" doctor --json --require-existing-daemon
```

Before provisioning, require JSON with this exact name and `daemon.alive=false`. Exit 1 is expected for an absent daemon. A nonzero exit alone does not prove absence. If it is alive, choose another fresh name. If the diagnostic fails without valid JSON, stop. An endpoint variable does not replace an existing healthy daemon.

Only after browser identity and approval are recorded, connect once with read-only script commands. A fresh named local CDP daemon creates its own blank provisioning tab during startup. This is a task-created resource, even though the script does not call `new_tab()`. Record its returned target ID as `provisioning_target` and add it to the task-created target ledger before any later call. If startup fails before the ID is available, report uncertain ownership and pending cleanup; do not guess a tab.

```sh
BH_REQUIRE_EXISTING_DAEMON=0 browser-use <<'PY'
print("Created provisioning target:", current_tab()["targetId"], flush=True)
PY
export BH_REQUIRE_EXISTING_DAEMON=1
"$harness" doctor --json --require-existing-daemon
```

Require exit 0, `healthy=true`, `daemon.alive=true`, and `daemon.browser_ready=true` for the recorded name. Keep the same name, endpoint, and `BH_REQUIRE_EXISTING_DAEMON=1` on every later call, including cleanup. Each script is a separate Python execution. Do not rely on earlier Python variables. Keep recording off unless the user requests it.

On any connection failure, retain safe failure evidence, mark dependent checks blocked, and attempt only scoped cleanup. Do not repeat connection discovery, reconnect with strict mode disabled, choose another browser, or restart a shared daemon. Ask for help with the recorded Chrome connection. Resume only after its identity and strict health are confirmed again.

## Own and select the target

Inspect `current_tab()` and `list_tabs()` without retaining unrelated page titles or content. Reuse only a target recorded as created by this run, or an existing tab explicitly selected by the user. Keep that distinction in the ledger. A matching URL is not ownership.

Select a recorded task-owned target, not automatically the daemon's provisioning tab. Named daemons create that tab in the background; `new_tab()` does not establish visibility either. When this run launched a fresh owned browser, prefer its recorded initial tab. Record that ID from the approved browser launch before daemon provisioning. The first tab in a user-provided browser is not thereby owned. Set `approved_task_target` to the selected recorded ID.

Keep every task-created ID, including the initial and provisioning tabs, in the ledger. Export their JSON array as `task_created_targets` for cleanup. User-selected existing tabs do not belong in that array. If the selected target is hidden, stop and ask for activation approval. Do not activate it, switch targets, or borrow an unowned visible tab automatically.

Native-input preflight requires `document.visibilityState == "visible"` and `document.hidden == false` through the selected public session. `document.hasFocus()` is insufficient. In BBP-246 with Chromium 153 and Harness 0.1.13, a hidden provisioning tab accepted mouse input but its first touchStart had no Chromium reply within 30 seconds; the reply arrived only during cleanup. Other browser requests remained responsive. The visible initial tab passed the matched input sequence and installed chart checks. This identifies the reproduced hidden-tab completion stall, not the exact cause of the earlier five-second mouse timeout. Evidence: [BBP-246 investigation](bbthread://thr_mawquzi5yr).

The example sets a 30-second IPC response wait. That wait is not a total operation deadline or cancellation. BBP-246's reviewed driver also used an interrupting 35-second total caller deadline. Do not raise waits or replay input to recover from a hidden target. The separate five-second cleanup budget remains unchanged.

After recording the selected task target and confirming strict health:

```sh
export task_target="$approved_task_target"
export bb_url
browser-use <<'PY'
import os, time
target = os.environ["task_target"]
if target not in {tab["targetId"] for tab in list_tabs()}:
    raise RuntimeError("Recorded target is missing")
session_id = cdp("Target.attachToTarget", targetId=target, flatten=True, _response_timeout=30)["sessionId"]
if not session_id:
    raise RuntimeError("No session for the recorded target")
def bound(method, **params):
    return cdp(method, session_id=session_id, _response_timeout=30, **params)
def require_visible():
    state = bound("Runtime.evaluate", expression="({visibility:document.visibilityState,hidden:document.hidden})", returnByValue=True)["result"]["value"]
    if state["visibility"] != "visible" or state["hidden"] is not False:
        raise RuntimeError("Recorded target is not visible; stop and ask for activation approval")
require_visible()
bound("Page.navigate", url=os.environ["bb_url"])
deadline = time.monotonic() + 15
while bound("Runtime.evaluate", expression="document.readyState", returnByValue=True)["result"]["value"] != "complete":
    if time.monotonic() >= deadline:
        raise RuntimeError("Page load timed out")
    time.sleep(0.3)
require_visible()
print(bound("Runtime.evaluate", expression="location.href", returnByValue=True)["result"]["value"])
PY
```

Set `bb_url` to the confirmed URL before the navigation call. Repeat target existence checks and session binding at the start of each later script. Attach with browser-level `Target.attachToTarget` and use its returned public session ID for every tab-scoped CDP call. This avoids `switch_tab()`'s implicit title update on the previous page, which can itself trigger stale-session recovery. Strict daemon reuse alone is insufficient. Harness can redirect commands without an explicit session to its startup tab after tab loss. If the bound session fails, stop actions and tab-scoped resets; never retry on a default or replacement session. Record any approved replacement tab separately. `ensure_real_tab()` and `new_tab(url)` are not ownership recovery methods.

At a login wall, keep required checks blocked and ask the user to sign in to this dedicated browser or supply an approved test setup. Ask for MFA, consent, or an uncertain account choice. Do not copy credentials or cookies, attach to Arc, launch a cloud browser, or open a public tunnel as a fallback.

## Interact and retain evidence

Bind a public session as shown above. Call `require_visible()` immediately before each native mouse or touch batch, and recheck after navigation or viewport changes. Use bounded `Runtime.evaluate` polling for the expected element's visible state. Read a filtered accessibility tree with `bound("Accessibility.getFullAXTree")`. Get a fresh `backendDOMNodeId` and box with `bound("DOM.getBoxModel", backendNodeId=node_id)`. Check that its center is inside the viewport, then send `Input.dispatchMouseEvent` for mousePressed and mouseReleased through the same bound session. Reinspect after navigation, scrolling, or a rerender. The installed CDP reference describes node and coordinate checks, but its default-session helper examples do not enforce this ownership contract.

Verify the expected result through session-bound DOM reads, persistence checks, or installed runtime observations. A URL or page title alone does not establish success. For visual evidence, call `bound("Page.captureScreenshot", format="png")`, decode its base64 `data`, and write it to an explicit local PNG path. Inspect the frame before sharing it. Withhold secrets or unrelated private content and report the evidence gap. Never inject passing results or replace application responses in a live check. Default-session helpers such as `goto_url`, `js`, `wait_for_element`, `click_at_xy`, and `capture_screenshot` cannot bind this session and must not replace these calls.

## Scoped cleanup

On success, failure, or a blocker, close only IDs recorded as task-created. A user-selected existing tab must remain open. Before invoking cleanup, run the strict diagnostic for the recorded name and require exit 0, `healthy=true`, `daemon.alive=true`, and `daemon.browser_ready=true`. Recheck the endpoint's browser process/profile and the named daemon's PID against the approved ledger. Uncertain or changed ownership blocks cleanup before mutation.

Export `cleanup_ownership` as a JSON object with `recorded` and `current` identity objects. Each has exactly `name`, `endpoint`, `daemon_pid`, `browser_pid`, and `profile`. Names, endpoints, and profile paths are nonempty strings; PIDs are positive integers. Take `recorded` from the ledger and `current` from the fresh diagnostic and process/profile inspection, not a copy of `recorded`. Keep the same `BU_NAME`, exactly one endpoint variable, and `BH_REQUIRE_EXISTING_DAEMON=1`. Export `provisioning_target` and the complete `task_created_targets` JSON array from the task-created ledger. Include the provisioning ID even if `list_tabs()` hides it. Keep user-selected and unowned IDs out of this array.

```sh
browser-use <<'PY'
import json, os, signal, time
deadline = time.monotonic() + 5
ownership = json.loads(os.environ["cleanup_ownership"])
fields = {"name", "endpoint", "daemon_pid", "browser_pid", "profile"}
if not isinstance(ownership, dict) or set(ownership) != {"recorded", "current"}:
    raise RuntimeError("Cleanup ownership is uncertain")
for identity in ownership.values():
    if not isinstance(identity, dict) or set(identity) != fields:
        raise RuntimeError("Invalid cleanup identity")
    if any(not isinstance(identity[key], str) or not identity[key].strip()
           for key in ("name", "endpoint", "profile")):
        raise RuntimeError("Invalid cleanup identity")
    if any(type(identity[key]) is not int or identity[key] <= 0
           for key in ("daemon_pid", "browser_pid")):
        raise RuntimeError("Invalid cleanup process identity")
recorded = ownership["recorded"]
endpoints = [os.environ[key] for key in ("BU_CDP_URL", "BU_CDP_WS") if os.environ.get(key)]
if (ownership["current"] != recorded or recorded["name"] == "default"
        or os.environ.get("BU_NAME") != recorded["name"]
        or endpoints != [recorded["endpoint"]]
        or os.environ.get("BH_REQUIRE_EXISTING_DAEMON") != "1"):
    raise RuntimeError("Cleanup ownership conflict or non-strict route")
targets = json.loads(os.environ["task_created_targets"])
if (not isinstance(targets, list) or not targets
        or any(not isinstance(target, str) or not target or any(c.isspace() for c in target)
               for target in targets)
        or len(set(targets)) != len(targets)
        or os.environ.get("provisioning_target") not in targets):
    raise RuntimeError("Invalid task-created target ledger")

if not hasattr(signal, "setitimer") or signal.getitimer(signal.ITIMER_REAL) != (0.0, 0.0):
    raise RuntimeError("Cleanup requires an unused POSIX real-time timer")

def expire(signum, frame):
    raise TimeoutError("Target cleanup timed out")

def bounded(method, **params):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise RuntimeError("Target cleanup timed out")
    previous_handler = signal.signal(signal.SIGALRM, expire)
    try:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Target cleanup timed out")
        signal.setitimer(signal.ITIMER_REAL, remaining)
        result = cdp(method, _response_timeout=remaining, **params)
    except Exception as error:
        raise RuntimeError("Target cleanup RPC failed for " + method + ": " + str(error)) from error
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous_handler)
    if time.monotonic() >= deadline:
        raise RuntimeError("Target cleanup timed out")
    return result

present = {info["targetId"] for info in bounded("Target.getTargets")["targetInfos"]}
for target in targets:
    if target in present:
        ack = bounded("Target.closeTarget", targetId=target)
        if ack.get("success") is not True:
            raise RuntimeError("Cleanup conflict, close not acknowledged for " + target)
if set(targets) & present:
    while True:
        present = {info["targetId"] for info in bounded("Target.getTargets")["targetInfos"]}
        if not set(targets) & present:
            break
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError("Target cleanup timed out")
        time.sleep(min(0.1, remaining))
if time.monotonic() >= deadline:
    raise RuntimeError("Target cleanup timed out")
print("All recorded task-created targets absent")
PY
```

`Target.closeTarget` runs at browser level with the exact recorded ID. Use raw `cdp` here because `close_tab()` discards its `success` acknowledgment. A true acknowledgment is not absence. The snippet polls fresh browser-level `Target.getTargets` for the complete recorded set, without `list_tabs()`'s page and provisioning filters.

One five-second monotonic deadline covers all RPCs and polling. Run this script on Python's main thread with POSIX `signal.setitimer` available and no active real-time timer. Otherwise cleanup blocks before CDP calls. Each synchronous call has an interrupting alarm for its remaining budget, including IPC connection and send/receive. The helper's `_response_timeout` alone covers response waiting, not its separate connection timeout. The snippet clears its timer and restores the prior signal handler on success or failure. It leaves no worker that could transmit a late close.

A false acknowledgment is a conflict. An RPC error or deadline expiry leaves cleanup pending; an already-sent close may still finish, so preserve that uncertainty and do not replay it. Confirmed absence in this same call is decisive, including after the last page closes. No later live-page health check or page-session recovery is required.

After tab cleanup, `browser-use --reload` may stop only this run's recorded, still-owned named daemon. It stops the daemon, not Chrome. Check the same name with the strict diagnostic and confirm `daemon.alive=false`. Do not issue another script that would recreate it. If daemon ownership changed or the connection is unavailable, preserve state and report pending cleanup instead of forcing a restart or broad close.

Leave a user-provided browser/profile open. Stop a browser or local server only if this run created its recorded process and cleanup was approved. Preserve concurrent user changes. Record intentionally retained resources and any cleanup failure or blocker. Pending cleanup prevents an overall pass.
