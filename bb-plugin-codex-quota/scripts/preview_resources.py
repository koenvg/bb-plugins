"""Fresh synthetic preview resources and decoded PNG receipts. Never installs a plugin."""
import argparse
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from threading import Thread
from urllib.request import urlopen
import uuid


class OwnedRun:
    def __init__(self, parent):
        self.token = uuid.uuid4().hex
        self.root = Path(tempfile.mkdtemp(prefix="bbp131-", dir=parent)).resolve()
        self.preview = self.root / "preview"
        self.preview.mkdir()
        (self.preview / "owner.json").write_text(json.dumps({"token": self.token}))
        (self.root / "owner.json").write_text(json.dumps({"token": self.token}))

    def cleanup_preview(self):
        if (self.preview.is_symlink() or self.preview.parent != self.root
                or json.loads((self.preview / "owner.json").read_text()) != {"token": self.token}
                or json.loads((self.root / "owner.json").read_text()) != {"token": self.token}):
            raise RuntimeError("Refusing cleanup without matching resource ownership")
        shutil.rmtree(self.preview)


def validate_png(path):
    from PIL import Image
    with Image.open(path) as image:
        if image.format != "PNG":
            raise RuntimeError("Capture is not a PNG")
        image.load()
        if image.width < 300 or image.height < 200:
            raise RuntimeError("Capture is too small")
        extrema = image.convert("RGB").getextrema()
        if all(low == high for low, high in extrema):
            raise RuntimeError("Capture has no visible content")
        return {"file": path.name, "width": image.width, "height": image.height,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


class LocalPreview(SimpleHTTPRequestHandler):
    def end_headers(self):
        # The official usage link is inspected, never followed. Fixture traffic is local only.
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'")
        super().end_headers()

    def log_message(self, *_args):
        pass


def run(suite):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-parent", type=Path, default=Path(tempfile.gettempdir()),
                        help="Existing parent for a fresh owned receipt directory. Never reused.")
    parser.add_argument("--port", type=int, default=0, help="Owned localhost server port; 0 selects a free port.")
    parser.add_argument("--css", type=Path, help="Current checkout's built app.css; default: ../dist/app.css")
    parser.add_argument("--browser-use", default="browser-use", help="Approved Browser Use CLI executable")
    parser.add_argument("--states", help="Comma-separated subset of this suite for diagnosis")
    args = parser.parse_args()
    scripts = Path(__file__).resolve().parent
    package = scripts.parent
    css = args.css or package / "dist/app.css"
    defaults = {
        "calendar": ["partial", "unknown", "inactive", "expired", "huge", "stale", "unavailable", "loading", "retry", "latest", "selection", "cancel", "settings"],
        "money": ["partial", "no-prices", "tiny", "huge", "expired", "unknown", "inactive", "stale", "unavailable", "loading"],
    }
    states = args.states.split(",") if args.states else defaults[suite]
    if not states or any(state not in defaults[suite] for state in states):
        parser.error("States must be a subset of " + ",".join(defaults[suite]))
    if not css.is_file() or not args.output_parent.is_dir() or not 0 <= args.port <= 65535:
        parser.error("Need current built CSS, an existing output parent and a valid port")
    owned = OwnedRun(args.output_parent)
    print(f"Fresh receipts: {owned.root}", flush=True)
    server = None
    outcome = {"suite": suite, "states": states, "status": "failed", "native": "Not run. No installed BB, native keyboard/touch, screen reader speech, live capture or billing proof."}
    try:
        build = subprocess.run(["bun", "build", str(scripts / "calendar-preview.tsx"), "--target", "browser", "--outfile", str(owned.preview / "activity-preview.js")], cwd=package, text=True, capture_output=True)
        (owned.root / "build.log").write_text(build.stdout + build.stderr)
        build.check_returncode()
        shutil.copyfile(css, owned.preview / "app.css")
        html = (scripts / "activity-preview.html").read_text().replace("BBP-24 synthetic activity preview", "BBP-131 synthetic calendar preview")
        (owned.preview / "index.html").write_text(html)
        server = ThreadingHTTPServer(("127.0.0.1", args.port), lambda *a, **k: LocalPreview(*a, directory=str(owned.preview), **k))
        Thread(target=server.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{server.server_port}/"
        with urlopen(base, timeout=5) as response:
            if response.status != 200:
                raise RuntimeError("Preview server is not ready")
        config = {"base": base, "out": str(owned.root), "token": owned.token, "suite": suite, "states": states}
        (owned.root / "config.json").write_text(json.dumps(config, indent=2))
        # Fresh default-browser connection. Never inherit an Arc/cloud endpoint or reuse a named daemon.
        env = os.environ.copy()
        for key in ["BU_CDP_URL", "BU_CDP_WS"]:
            env.pop(key, None)
        env.update(BU_NAME="bbp131-" + owned.token, BH_RECORD="0", BH_TAB_MARKER="0", BH_REQUIRE_EXISTING_DAEMON="0")
        code = f"import sys\nsys.path.insert(0, {str(scripts)!r})\nfrom preview_browser import check\ncheck(globals(), {config!r})\n"
        result = subprocess.run([args.browser_use], input=code, text=True, capture_output=True, env=env)
        (owned.root / "browser.log").write_text(result.stdout + result.stderr)
        result.check_returncode()
        outcome["captures"] = [validate_png(path) for path in sorted(owned.root.glob("*.png"))]
        if len(outcome["captures"]) != len(states) * 4:
            raise RuntimeError("Missing token/cost captures at one or both widths")
        outcome["status"] = "passed"
    finally:
        if server:
            server.shutdown()
            server.server_close()
        owned.cleanup_preview()
        (owned.root / "result.json").write_text(json.dumps(outcome, indent=2))
    print(f"{suite}: {len(states) * 2} desktop/375px states passed. Synthetic SDK fixture only.")
