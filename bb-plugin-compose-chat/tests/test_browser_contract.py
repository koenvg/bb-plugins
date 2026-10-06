"""Runner contract tests with fake browser helpers, not live browser evidence.

Run from the repository root with:
python3 -m unittest discover -s bb-plugin-compose-chat/tests -p 'test_browser_contract.py'
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import unittest.mock

ROOT = Path(__file__).resolve().parents[1]
FAKE_CLI = '''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
log = Path(os.environ["FAKE_LOG"])
def record(action, **data):
    with log.open("a") as out:
        out.write(json.dumps({"action": action, **data}) + "\\n")
record("invoke", args=sys.argv[1:], name=os.environ.get("BU_NAME"),
       strict=os.environ.get("BH_REQUIRE_EXISTING_DAEMON"),
       marker=os.environ.get("BH_TAB_MARKER"))
if os.environ.get("FAKE_MODE") == "connection":
    sys.exit("required daemon is not running")
if os.environ.get("FAKE_MODE") == "no-completion":
    sys.exit(0)
def list_tabs():
    record("list")
    if os.environ.get("FAKE_MODE") == "missing":
        return [{"targetId": "user-tab", "url": base}]
    return [{"targetId": "owned-tab", "url": base}]
def js(expression):
    if os.environ.get("FAKE_MODE") == "wrong-page":
        return base + ".unrelated"
    if os.environ.get("FAKE_MODE") == "login":
        return "https://example.invalid/login"
    return base
viewport = [1440, 1046]
session_lost = False
def cdp(method, session_id=None, **params):
    global session_lost
    if session_lost:
        if session_id:
            record("session-error", method=method)
            raise RuntimeError("Session with given id not found")
        record("fallback", method=method)
    if not method.startswith("Target.") and session_id != "owned-session":
        raise RuntimeError("Tab command was not bound to the recorded target session")
    record(method, params=params)
    if method == "Target.attachToTarget":
        return {"sessionId": "owned-session"}
    if method == "Page.navigate" and os.environ.get("FAKE_MODE") == "tab-loss":
        session_lost = True
    if method == "Emulation.clearDeviceMetricsOverride" and os.environ.get("FAKE_MODE") == "cleanup-tab-loss":
        session_lost = True
        if session_id:
            record("session-error", method=method)
            raise RuntimeError("Session with given id not found")
        record("fallback", method=method)
    if method == "Page.captureScreenshot":
        return {"data": "bm90IGEgcG5n"}
    if method == "Emulation.clearDeviceMetricsOverride" and os.environ.get("FAKE_MODE") == "cleanup":
        raise RuntimeError("reset failed")
    if method == "Emulation.setDeviceMetricsOverride":
        viewport[:] = [params["width"], params["height"]]
    if method == "Runtime.evaluate":
        expression = params["expression"]
        if expression == "location.href":
            return {"result": {"value": js(expression)}}
        if expression == "document.readyState":
            return {"result": {"value": "complete"}}
        if "devicePixelRatio" in expression:
            return {"result": {"value": 1}}
        if "fixture.check" in expression:
            if os.environ.get("FAKE_MODE") == "assertion":
                return {"exceptionDetails": {"exception": {"description": "fixture failed"}}}
            return {"result": {"value": {"theme": "dark", "mode": "expanded",
                    "viewport": viewport[:], "checks": 1, "passed": []}}}
        if "document.activeElement.getAttribute" in expression:
            return {"result": {"value": True}}
    return {}
exec(sys.stdin.read(), globals())
'''


class BrowserContractTests(unittest.TestCase):
    def run_runner(self, mode="ok", **overrides):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            cli = directory / "browser-use"
            cli.write_text(FAKE_CLI)
            cli.chmod(0o700)
            log = directory / "calls.jsonl"
            env = {key: value for key, value in os.environ.items()
                   if not key.startswith(("BU_", "BH_", "COMPOSE_CHAT_BROWSER_"))}
            env.update(PATH=str(directory) + os.pathsep + env["PATH"],
                       BU_NAME="verify-contract-test", BU_CDP_URL="http://127.0.0.1:12345",
                       COMPOSE_CHAT_BROWSER_TARGET="owned-tab",
                       COMPOSE_CHAT_BROWSER_CASES="desktop-dark",
                       COMPOSE_CHAT_BROWSER_SKIP_SCREENSHOTS="1",
                       COMPOSE_CHAT_BROWSER_EVIDENCE_DIR=str(directory / "evidence"),
                       FAKE_LOG=str(log), FAKE_MODE=mode)
            env.update(overrides)
            result = subprocess.run(["bash", str(ROOT / "tests/browser-checks.sh")],
                                    env=env, text=True, capture_output=True)
            calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
            return result, calls

    def test_requires_explicit_scope_before_cli(self):
        for overrides in ({"BU_NAME": ""}, {"BU_NAME": "default"},
                          {"BU_CDP_URL": ""}, {"COMPOSE_CHAT_BROWSER_TARGET": ""},
                          {"BU_CDP_WS": "ws://127.0.0.1:12345"}):
            with self.subTest(overrides=overrides):
                result, calls = self.run_runner(**overrides)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(calls, [])

    def test_supported_stdin_helpers_and_strict_reuse(self):
        result, calls = self.run_runner(BH_REQUIRE_EXISTING_DAEMON="0")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("COMPOSE_CHAT_BROWSER_MATRIX_PASSED", result.stdout)
        self.assertEqual(calls[0], {"action": "invoke", "args": [],
                                   "name": "verify-contract-test", "strict": "1", "marker": "0"})
        self.assertEqual(calls[2], {"action": "Target.attachToTarget", "params": {"targetId": "owned-tab", "flatten": True}})
        self.assertTrue(any(call["action"] == "Input.dispatchKeyEvent" for call in calls))
        self.assertFalse(any(call["action"] == "Target.closeTarget" for call in calls))

    def test_missing_target_or_wrong_page_never_mutates_fixture(self):
        for mode in ("missing", "wrong-page", "login"):
            with self.subTest(mode=mode):
                result, calls = self.run_runner(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any(call["action"] in ("goto", "Page.bringToFront",
                                                        "Emulation.setDeviceMetricsOverride") for call in calls))

    def test_websocket_endpoint_uses_same_strict_contract(self):
        result, calls = self.run_runner(BU_CDP_URL="", BU_CDP_WS="ws://127.0.0.1:12345")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls[0]["strict"], "1")

    def test_default_capture_still_rejects_invalid_png(self):
        result, calls = self.run_runner(COMPOSE_CHAT_BROWSER_SKIP_SCREENSHOTS="0")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("screenshot returned no complete PNG", result.stderr)
        self.assertEqual(calls[-1]["action"], "Network.setCacheDisabled")

    def test_connection_failure_does_not_retry_or_pass(self):
        result, calls = self.run_runner("connection")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(calls), 1)
        self.assertNotIn("COMPOSE_CHAT_BROWSER_MATRIX_PASSED", result.stdout)

    def test_missing_completion_marker_is_failure(self):
        result, calls = self.run_runner("no-completion")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(calls), 1)

    def test_assertion_and_cleanup_failures_attempt_all_resets(self):
        for mode in ("assertion", "cleanup"):
            with self.subTest(mode=mode):
                result, calls = self.run_runner(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("COMPOSE_CHAT_BROWSER_MATRIX_PASSED", result.stdout)
                self.assertTrue(any(call["action"] == "Emulation.clearDeviceMetricsOverride" for call in calls))
                self.assertEqual(calls[-1], {"action": "Network.setCacheDisabled", "params": {"cacheDisabled": False}})
                self.assertIn({"action": "Page.navigate", "params": {"url": "http://127.0.0.1:56429/tests/preview.html"}}, calls)

    def test_lost_session_never_redirects_actions_or_cleanup(self):
        for mode in ("tab-loss", "cleanup-tab-loss"):
            with self.subTest(mode=mode):
                result, calls = self.run_runner(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("COMPOSE_CHAT_BROWSER_MATRIX_PASSED", result.stdout)
                self.assertFalse(any(call["action"] == "fallback" for call in calls))
                self.assertEqual(sum(call["action"] == "session-error" for call in calls), 1)

    def test_documented_cleanup_closes_only_recorded_created_target(self):
        contract = ROOT.parent / ".pi/skills/verify/references/browser-contract.md"
        script = contract.read_text().split("browser-use <<'PY'")[-1].split("\nPY")[0]
        with unittest.mock.patch.dict(os.environ, {"task_created_targets": '["provisioning-tab", "owned-tab"]'}):
            for present, close_fails in ((True, False), (False, False), (True, True)):
                with self.subTest(present=present, close_fails=close_fails):
                    targets = {"user-tab", "provisioning-tab"} | ({"owned-tab"} if present else set())
                    closed = []
                    def close_tab(target):
                        closed.append(target)
                        if not close_fails:
                            targets.remove(target)
                    helpers = {"list_tabs": lambda: [{"targetId": target} for target in targets],
                               "close_tab": close_tab}
                    if close_fails:
                        with self.assertRaisesRegex(RuntimeError, "remains open"):
                            exec(script, helpers)
                    else:
                        exec(script, helpers)
                    self.assertIn("user-tab", targets)
                    if not close_fails:
                        self.assertNotIn("provisioning-tab", targets)
                    self.assertEqual(closed, ["provisioning-tab", "owned-tab"] if present else ["provisioning-tab"])


if __name__ == "__main__":
    unittest.main()
