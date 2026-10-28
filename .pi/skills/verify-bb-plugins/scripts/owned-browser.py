#!/usr/bin/env python3
"""Own one approved disposable Chrome lifetime around a trusted verifier command."""
import argparse
import ast
from dataclasses import dataclass
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
from urllib.parse import urlsplit
import uuid


@dataclass(frozen=True)
class Tools:
    chrome: Path
    browser_use: Path
    harness: Path
    ps: Path
    lsof: Path
    interpreter_image: Path
    core: Path
    versions: dict


@dataclass(frozen=True)
class Ready:
    identity: dict
    browser_stamp: str
    daemon_stamp: str
    initial: str
    provisioning: str


class Refused(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise Refused(message)


def executable(value):
    path = Path(value).expanduser().resolve()
    require(path.is_file() and os.access(path, os.X_OK), "Required executable unavailable")
    return path


def inspect_tools(args):
    browser_use, harness = executable(args.browser_use), executable(args.harness)
    require(browser_use.parent == harness.parent, "Browser Use and Harness must share an installation")
    interpreters = []
    for path in (browser_use, harness):
        first = path.read_text().splitlines()[0]
        require(first.startswith("#!/") and len(first[2:].split()) == 1, "Unsupported CLI interpreter")
        interpreters.append(executable(first[2:]))
    require(interpreters[0] == interpreters[1], "CLI interpreters do not match")
    interpreter_image = interpreters[0]
    framework = interpreter_image.parent.parent
    if sys.platform == "darwin" and framework.parent.name == "Versions" and framework.parent.parent.name == "Python.framework" and interpreter_image == framework / "bin" / ("python" + framework.name):
        interpreter_image = executable(framework / "Resources/Python.app/Contents/MacOS/Python")
    sites = list(browser_use.parent.parent.glob("lib/python*/site-packages"))
    require(len(sites) == 1, "Unsupported installation layout")
    site = sites[0]
    versions = {}
    for package, allowed in (("browser_use", {"0.13.10", "0.13.11"}), ("browser_harness", {"0.1.13"})):
        metadata = list(site.glob(package + "-*.dist-info/METADATA"))
        require(len(metadata) == 1, "Missing or ambiguous installed metadata")
        match = re.search(r"^Version: (.+)$", metadata[0].read_text(), re.M)
        require(match and match[1] in allowed, "Unsupported installed version")
        versions[package] = match[1]
    core = site / "browser_harness"
    functions = {node.name: node for node in ast.parse((core / "helpers.py").read_text()).body if isinstance(node, ast.FunctionDef)}
    require({"cdp", "current_tab", "list_tabs", "new_tab", "close_tab"} <= functions.keys(), "Required public helpers unavailable")
    require({"method", "session_id", "_response_timeout"} <= {arg.arg for arg in functions["cdp"].args.args}, "Unsupported public CDP signature")
    for path in (core.parent.parent / ".env",):
        if path.exists():
            for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
                if line.strip().startswith("#") or "=" not in line:
                    continue
                key, value = line.strip().split("=", 1)
                value = value.strip().strip('"').strip("'")
                if key.strip() in {"BU_CDP_URL", "BU_CDP_WS", "BU_BROWSER_ID", "BU_AUTOSPAWN"}:
                    require(not value, "Conflicting installed .env route; no automatic repair")
    return Tools(executable(args.chrome), browser_use, harness, executable(args.ps), executable(args.lsof), interpreter_image, core, versions)


def bb_origin():
    raw = os.environ.get("BB_SERVER_URL", "")
    require(raw and not any(c.isspace() for c in raw), "Runtime BB_SERVER_URL required")
    try:
        parsed = urlsplit(raw)
        require(parsed.scheme in {"http", "https"} and parsed.hostname and not parsed.username and not parsed.password and "@" not in parsed.netloc, "Invalid or credential-bearing BB_SERVER_URL")
        port = parsed.port
        require(port != 0 and not parsed.netloc.endswith(":"), "Invalid BB_SERVER_URL port")
        host = parsed.hostname
        host = f"[{host}]" if ":" in host else host
        return f"{parsed.scheme}://{host}" + (f":{port}" if port else "")
    except ValueError:
        raise Refused("Invalid BB_SERVER_URL") from None


def approval_for(args, tools):
    require(args.approval, "Explicit launch, possible foreground effect, and owned cleanup approval required")
    approval = json.loads(Path(args.approval).read_text())
    require(isinstance(approval, dict) and isinstance(approval.get("reference"), str) and approval["reference"].strip(), "Approval reference required")
    require(all(approval.get(key) is True for key in ("launch", "foreground", "cleanup")), "Launch, foreground, and cleanup approval required")
    require(Path(approval.get("chrome", "")).expanduser().resolve() == tools.chrome, "Approval must select this Chrome executable")
    if args.signed_in:
        require(approval.get("signed_in") is True and isinstance(approval.get("account"), str) and approval["account"].strip() and isinstance(approval.get("account_reference"), str) and approval["account_reference"].strip(), "Separate dedicated-Chrome signed-in account approval required")
    return approval


def remaining(deadline):
    duration = deadline - time.monotonic()
    require(duration > 0, "Operation deadline expired")
    return duration


class Invocation:
    def __init__(self, args, tools, origin, approval):
        self.args, self.tools = args, tools
        self.evidence = Path(args.evidence).expanduser().absolute()
        self.evidence.mkdir(mode=0o700)
        self.root = None
        self.browser = None
        self.active = None
        self.ready = None
        self.call_number = 0
        self.env = {}
        self.ledger = dict(
            schema_version=1, status="acquiring", approval=approval,
            bb_origin=origin, versions=tools.versions, targets={}, resources={}, calls=[],
            cleanup=dict(targets="never_sent", daemon="never_sent", browser="never_sent"),
        )
        self.save()

    def save(self):
        path = self.evidence / "ledger.json"
        path.write_text(json.dumps(self.ledger, indent=2) + "\n")
        path.chmod(0o600)

    def record_directory(self, path):
        stat = path.stat()
        self.ledger["directories"][str(path)] = [stat.st_dev, stat.st_ino]
        self.save()

    def require_directories(self):
        for raw, identity in self.ledger.get("directories", {}).items():
            path = Path(raw)
            stat = path.stat()
            require(not path.is_symlink() and path.is_dir() and [stat.st_dev, stat.st_ino] == identity, "Owned directory identity changed")

    def resource(self, key, value):
        self.ledger[key] = value
        self.ledger["resources"][key] = "acquired"
        self.save()

    def call(self, argv, deadline, source=None, env=None):
        require(self.active is None, "Previous child is not quiescent")
        self.call_number += 1
        stem = self.evidence / f"call-{self.call_number}"
        call = dict(argv=[str(arg) for arg in argv], stdout=stem.name + ".stdout", stderr=stem.name + ".stderr", exit=None)
        self.ledger["calls"].append(call)
        if source is not None:
            stem.with_suffix(".py").write_text(source)
        with stem.with_suffix(".stdout").open("w+") as out, stem.with_suffix(".stderr").open("w+") as err:
            process = subprocess.Popen([str(a) for a in argv], env=env or self.env, cwd=self.root, stdin=subprocess.PIPE if source is not None else subprocess.DEVNULL, stdout=out, stderr=err, text=True, start_new_session=True)
            self.active = process
            call["pid"] = process.pid
            self.ledger["active_child"] = dict(pid=process.pid, command=str(argv[0]))
            self.save()
            process.communicate(source, timeout=remaining(deadline))
            self.quiesce(deadline, terminate=False)
            out.seek(0)
            return process.returncode, out.read()

    def quiesce(self, deadline, terminate=True):
        if self.active is None:
            return
        process = self.active
        if terminate:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        process.wait(timeout=remaining(deadline))
        self.ledger["calls"][-1]["exit"] = process.returncode
        try:
            os.killpg(process.pid, 0)
        except ProcessLookupError:
            self.active = None
            self.ledger.pop("active_child", None)
            self.save()
            return
        raise Refused("Owned child group is still active; no kill escalation")

    def observe(self, argv, deadline, allowed=(0,)):
        code, output = self.call(argv, deadline)
        require(code in allowed, "OS identity observation failed")
        return output.strip()

    def stamp(self, pid, deadline):
        output = self.observe([self.tools.ps, "-ww", "-p", str(pid), "-o", "uid=,lstart=,command="], deadline)
        require(output.split(maxsplit=1)[0] == str(os.getuid()), "Process owner mismatch")
        return output

    def files(self, args, deadline):
        output = self.observe([self.tools.lsof, "-nP", "-Fpn"] + args, deadline, (0, 1))
        pid, rows = None, []
        for line in output.splitlines():
            if line.startswith("p"):
                pid = int(line[1:])
            elif line.startswith("n"):
                rows.append((pid, line[1:].removesuffix(" type=STREAM")))
        return rows

    def http(self, path, deadline):
        endpoint = self.ledger["endpoint"]
        request = urllib.request.Request(endpoint + path)
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args):
                raise Refused("CDP redirect refused")
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        with opener.open(request, timeout=min(3, remaining(deadline))) as response:
            return json.load(response)

    def browser_identity(self, deadline):
        self.require_directories()
        require(self.browser is not None and self.browser.poll() is None, "Owned browser process is not running")
        stamp = self.stamp(self.browser.pid, deadline)
        match = re.search(r"(?:^|\s)--user-data-dir=([^\s]+)(?:\s|$)", stamp)
        require(match and match[1] == self.ledger["profile"] and str(self.tools.chrome) in stamp, "Browser executable/profile mismatch")
        if "browser_stamp" in self.ledger:
            require(stamp == self.ledger["browser_stamp"], "Browser process identity changed")
        port_file = (Path(match[1]) / "DevToolsActivePort").read_text().splitlines()
        require(len(port_file) == 2 and port_file[0].isdigit() and 0 < int(port_file[0]) <= 65535 and re.fullmatch(r"/devtools/browser/[A-Za-z0-9-]+", port_file[1]), "Invalid owned DevToolsActivePort")
        endpoint = "http://127.0.0.1:" + port_file[0]
        require(endpoint == self.ledger["endpoint"], "Browser endpoint changed")
        listeners = self.files(["-iTCP:" + port_file[0], "-sTCP:LISTEN"], deadline)
        require(set(listeners) == {(self.browser.pid, "127.0.0.1:" + port_file[0])}, "Browser loopback listener ownership mismatch")
        version = self.http("/json/version", deadline)
        require(version.get("webSocketDebuggerUrl") == endpoint.replace("http:", "ws:") + port_file[1], "Browser endpoint identity mismatch")
        return dict(browser_pid=self.browser.pid, profile=match[1], endpoint=endpoint), stamp

    def doctor(self, alive, deadline):
        code, output = self.call([self.tools.harness, "doctor", "--json", "--require-existing-daemon"], deadline)
        report = json.loads(output)
        daemon = report.get("daemon", {})
        require(report.get("schema_version") == 1 and report.get("require_existing_daemon") is True and daemon.get("name") == self.ledger["name"] and daemon.get("alive") is alive, "Strict Doctor name/absence/health conflict")
        require((alive and code == 0 and report.get("healthy") is True and daemon.get("browser_ready") is True) or (not alive and code == 1 and report.get("healthy") is False and daemon.get("browser_ready") is False), "Strict Doctor health conflict")
        return daemon["name"]

    def daemon_identity(self, deadline, connected=True):
        socket_path = str(self.root / "runtime/bu.sock")
        rows = self.files([socket_path], deadline)
        pids = {pid for pid, name in rows if name == socket_path}
        require(len(pids) == 1, "Named daemon socket ownership uncertain")
        pid = pids.pop()
        stamp = self.stamp(pid, deadline)
        command = stamp.split(maxsplit=6)[6]
        suffix = " -m browser_harness.daemon"
        require(command.endswith(suffix) and Path(command.removesuffix(suffix)).resolve() == self.tools.interpreter_image, "Named daemon process mismatch")
        if connected:
            connections = self.files(["-a", "-p", str(pid), "-iTCP", "-sTCP:ESTABLISHED"], deadline)
            destination = "->" + self.ledger["endpoint"].removeprefix("http://")
            require(any(owner == pid and name.endswith(destination) for owner, name in connections), "Named daemon is not connected to the owned browser")
        return pid, stamp

    def identity(self, deadline):
        browser, browser_stamp = self.browser_identity(deadline)
        name = self.doctor(True, deadline)
        pid, daemon_stamp = self.daemon_identity(deadline)
        return dict(name=name, daemon_pid=pid, **browser), browser_stamp, daemon_stamp

    def no_unknown_pages(self, deadline):
        owned = set(self.ledger["targets"].values())
        pages = self.http("/json/list", deadline)
        require(isinstance(pages, list) and all(isinstance(page, dict) and page.get("id") for page in pages), "Invalid target inventory")
        require(not any(page.get("type") in {"page", "webview"} and page["id"] not in owned for page in pages), "Unknown pages retained with browser/profile")

    def launch(self):
        self.root = Path(tempfile.mkdtemp(prefix="bbv-", dir="/tmp")).resolve()
        self.resource("temporary_root", str(self.root))
        self.ledger["directories"] = {}
        self.record_directory(self.root)
        for directory in ("profile", "runtime", "tmp", "workspace", "home"):
            (self.root / directory).mkdir(mode=0o700)
            self.record_directory(self.root / directory)
        self.resource("profile", str(self.root / "profile"))
        self.resource("name", "verify-" + uuid.uuid4().hex[:16])
        self.env = dict(
            PATH=str(self.tools.browser_use.parent) + os.pathsep + os.defpath,
            HOME=str(self.root / "home"), LANG="C", LC_ALL="C",
            TMPDIR=str(self.root / "tmp"), BU_NAME=self.ledger["name"],
            BU_CDP_URL="", BU_CDP_WS="", BU_BROWSER_ID="", BU_AUTOSPAWN="",
            BROWSER_USE_API_KEY="", BH_REQUIRE_EXISTING_DAEMON="1",
            BH_HOME=str(self.root / "home"),
            BROWSER_HARNESS_HOME=str(self.root / "home"),
            BH_CONFIG_DIR=str(self.root / "home"),
            BH_RUNTIME_DIR=str(self.root / "runtime"), BH_RUNTIME_DIR_SHARED="0",
            BH_TMP_DIR=str(self.root / "tmp"), BH_TMP_DIR_SHARED="0",
            BH_AGENT_WORKSPACE=str(self.root / "workspace"),
            BH_RECORD="0", BH_TAB_MARKER="0", BH_DOMAIN_SKILLS="0",
            BH_DEBUG_CLICKS="", BH_OPEN_LIVE_URL="0", BH_UPDATE_CHECK="0",
            BH_TELEMETRY="0", BROWSER_HARNESS_TELEMETRY="0",
            ANONYMIZED_TELEMETRY="false",
            BB_SERVER_URL=self.ledger["bb_origin"], bb_url=self.ledger["bb_origin"],
            BB_OWNED_BROWSER_EVIDENCE=str(self.evidence),
            BB_OWNED_BROWSER_ALLOW_NEW_TABS="0",
        )
        argv = [
            str(self.tools.chrome), "--user-data-dir=" + self.ledger["profile"],
            "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
            "--no-first-run", "--no-default-browser-check", "--new-window", "about:blank",
        ]
        with (self.evidence / "chrome.log").open("w") as log:
            self.browser = subprocess.Popen(argv, env=self.env, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
        self.resource("browser_pid", self.browser.pid)
        deadline = time.monotonic() + 15
        port_path = Path(self.ledger["profile"]) / "DevToolsActivePort"
        while not port_path.exists():
            require(self.browser.poll() is None, "Chrome exited before endpoint discovery")
            remaining(deadline)
            time.sleep(.05)
        lines = port_path.read_text().splitlines()
        require(lines and lines[0].isdigit(), "Invalid Chrome port file")
        self.resource("endpoint", "http://127.0.0.1:" + lines[0])
        identity, stamp = self.browser_identity(deadline)
        self.resource("browser_stamp", stamp)
        pages = self.http("/json/list", deadline)
        require(isinstance(pages, list) and all(isinstance(page, dict) and page.get("id") for page in pages), "Invalid target inventory")
        pages = [page for page in pages if page.get("type") in {"page", "webview"}]
        require(len(pages) == 1, "Unexpected initial pages; ownership uncertain")
        initial = pages[0].get("id")
        require(pages[0].get("type") == "page" and pages[0].get("url") == "about:blank" and isinstance(initial, str) and initial and not any(c.isspace() for c in initial), "Unexpected initial page identity")
        self.ledger["targets"]["initial"] = pages[0]["id"]
        self.save()
        self.env["BU_CDP_URL"] = identity["endpoint"]
        self.doctor(False, deadline)
        self.ledger["provisioning"] = "sent_uncertain"
        self.save()
        code, output = self.call([self.tools.browser_use], time.monotonic() + 35, source='import json\nprint("OWNED_PROVISIONING=" + json.dumps(current_tab()["targetId"]), flush=True)\n', env=dict(self.env, BH_REQUIRE_EXISTING_DAEMON="0"))
        ids = re.findall(r"^OWNED_PROVISIONING=(.+)$", output, re.M)
        require(len(ids) == 1, "Missing provisioning target; ownership uncertain")
        target = json.loads(ids[0])
        require(isinstance(target, str) and target and not any(c.isspace() for c in target) and target != pages[0]["id"], "Invalid provisioning target")
        self.ledger["targets"]["provisioning"] = target
        self.ledger["provisioning"] = "recorded"
        self.save()
        require(code == 0, "Provisioning failed")
        current, browser_stamp, daemon_stamp = self.identity(time.monotonic() + 15)
        self.resource("identity", current)
        self.resource("daemon_stamp", daemon_stamp)
        self.ready = Ready(current, browser_stamp, daemon_stamp, pages[0]["id"], target)
        self.env.update(task_target=self.ready.initial, provisioning_target=target, task_created_targets=json.dumps(list(self.ledger["targets"].values())))
        self.ledger["status"] = "ready"
        self.save()

    def cleanup(self):
        hard_deadline = time.monotonic() + 45
        previous = signal.signal(signal.SIGALRM, cleanup_expired)
        signal.setitimer(signal.ITIMER_REAL, 45)
        try:
            self.clean_resources(hard_deadline - 2)
        except Exception:
            self.quiesce(hard_deadline)
            raise
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous)

    def clean_resources(self, deadline):
        self.quiesce(deadline)
        if self.root is None:
            self.ledger["status"] = "cleaned"
            self.save()
            return
        if self.ledger.get("provisioning"):
            require(self.ready is not None, "Incomplete provisioning; retain browser, profile, and daemon")
            current, browser_stamp, daemon_stamp = self.identity(deadline)
            require((current, browser_stamp, daemon_stamp) == (self.ready.identity, self.ready.browser_stamp, self.ready.daemon_stamp), "Current ownership conflicts with recorded identity")
            self.no_unknown_pages(deadline)
            ownership = dict(recorded=self.ready.identity, current=current)
            contract = Path(__file__).resolve().parents[1] / "references/browser-contract.md"
            section = contract.read_text().split("## Scoped cleanup\n", 1)[1]
            source = re.search(r"browser-use <<'PY'\n(.*?)\nPY", section, re.S)[1]
            source += '\ninfos = bounded("Target.getTargets")["targetInfos"]\nif any(info.get("type") in {"page", "webview"} for info in infos):\n    raise RuntimeError("Unknown pages retained with browser/profile")\n'
            self.ledger["cleanup"]["targets"] = "sent_uncertain"
            self.save()
            code, output = self.call([self.tools.browser_use], min(deadline, time.monotonic() + 6), source=source, env=dict(self.env, cleanup_ownership=json.dumps(ownership)))
            require(code == 0 and "All recorded task-created targets absent" in output, "Target cleanup failed or uncertain; no replay")
            self.ledger["cleanup"]["targets"] = "confirmed_absent"
            self.save()
            pid, stamp = self.daemon_identity(deadline, connected=False)
            require(pid == self.ready.identity["daemon_pid"] and stamp == self.ready.daemon_stamp, "Daemon ownership changed before stop")
            self.ledger["cleanup"]["daemon"] = "sent_uncertain"
            self.save()
            code, _ = self.call([self.tools.browser_use, "--reload"], min(deadline, time.monotonic() + 20))
            require(code == 0, "Named daemon stop uncertain")
            self.doctor(False, deadline)
            require(not self.files([str(self.root / "runtime/bu.sock")], deadline), "Named daemon socket remains owned")
            observed = self.observe([self.tools.ps, "-ww", "-p", str(pid), "-o", "uid=,lstart=,command="], deadline, (0, 1))
            require(not observed, "Named daemon process still present")
            self.ledger["cleanup"]["daemon"] = "confirmed_absent"
            self.save()
        if self.browser is not None and self.browser.poll() is None:
            if "endpoint" in self.ledger:
                self.browser_identity(deadline)
                self.no_unknown_pages(deadline)
            else:
                stamp = self.stamp(self.browser.pid, deadline)
                require(str(self.tools.chrome) in stamp and "--user-data-dir=" + self.ledger["profile"] in stamp, "Partial browser identity uncertain")
                require(not self.files(["-a", "-p", str(self.browser.pid), "-iTCP", "-sTCP:LISTEN"], deadline), "Undiscovered browser listener retained")
            self.ledger["cleanup"]["browser"] = "sent_uncertain"
            self.save()
            self.browser.terminate()
            self.browser.wait(timeout=remaining(deadline))
        if "endpoint" in self.ledger:
            port = urlsplit(self.ledger["endpoint"]).port
            require(not self.files(["-iTCP:" + str(port), "-sTCP:LISTEN"], deadline), "Browser listener remains")
        if "profile" in self.ledger:
            require(not self.files(["+D", self.ledger["profile"]], deadline), "Profile still has open files")
        self.ledger["cleanup"]["browser"] = "confirmed_absent"
        self.save()
        log = self.root / "tmp/bu.log"
        if log.exists():
            shutil.copyfile(log, self.evidence / "daemon.log")
        remaining(deadline)
        self.require_directories()
        shutil.rmtree(self.root)
        for key in self.ledger["resources"]:
            self.ledger["resources"][key] = "released"
        self.ledger["status"] = "cleaned"
        self.save()


def cleanup_expired(signum, frame):
    raise Refused("Overall cleanup deadline expired")


def cancelled(signum, frame):
    raise KeyboardInterrupt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check", "run"))
    parser.add_argument("--chrome", default="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    parser.add_argument("--browser-use", default=shutil.which("browser-use") or str(Path.home() / ".browser-use-env/bin/browser-use"))
    parser.add_argument("--harness", default=None)
    parser.add_argument("--ps", default="/bin/ps")
    parser.add_argument("--lsof", default="/usr/sbin/lsof")
    parser.add_argument("--approval")
    parser.add_argument("--signed-in", action="store_true")
    parser.add_argument("--evidence")
    parser.add_argument("--timeout", type=float, default=300)
    argv = sys.argv[1:]
    split = argv.index("--") if "--" in argv else len(argv)
    args = parser.parse_args(argv[:split])
    command = argv[split + 1:]
    args.harness = args.harness or str(Path(args.browser_use).expanduser().resolve().with_name("browser-harness"))
    invocation, result = None, 3
    try:
        origin = bb_origin() if args.action == "run" else None
        tools = inspect_tools(args)
        if args.action == "check":
            print(json.dumps(dict(status="available", versions=tools.versions, browser_use=str(tools.browser_use), harness=str(tools.harness), browser=str(tools.chrome), started_nothing=True)))
            return 0
        approval = approval_for(args, tools)
        require(command and args.evidence and math.isfinite(args.timeout) and args.timeout > 0, "New evidence directory, positive timeout, and trusted verifier command required")
        os.umask(0o077)
        invocation = Invocation(args, tools, origin, approval)
        signal.signal(signal.SIGTERM, cancelled)
        signal.signal(signal.SIGINT, cancelled)
        invocation.launch()
        result, _ = invocation.call(command, time.monotonic() + args.timeout)
        invocation.ledger["verifier_exit"] = result
    except KeyboardInterrupt:
        result = 130
        if invocation:
            invocation.ledger["failure"] = "Cancelled"
    except (OSError, ValueError, KeyError, IndexError, TypeError, SyntaxError, Refused, subprocess.TimeoutExpired) as error:
        print(type(error).__name__ + ": " + str(error), file=sys.stderr)
        if invocation:
            invocation.ledger["failure"] = type(error).__name__
    finally:
        if invocation:
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            signal.signal(signal.SIGINT, signal.SIG_IGN)
            try:
                invocation.cleanup()
            except (OSError, ValueError, KeyError, IndexError, TypeError, SyntaxError, Refused, subprocess.TimeoutExpired) as error:
                invocation.ledger["status"] = "cleanup_pending"
                invocation.ledger["cleanup_pending"] = str(error)
                for key, state in invocation.ledger["resources"].items():
                    if state == "acquired":
                        invocation.ledger["resources"][key] = "retained"
                print("Cleanup pending: " + str(error), file=sys.stderr)
                result = 3
            invocation.save()
            print(json.dumps(dict(status=invocation.ledger["status"], evidence=str(invocation.evidence), verifier_exit=invocation.ledger.get("verifier_exit"))))
    return result


if __name__ == "__main__":
    sys.exit(main())
