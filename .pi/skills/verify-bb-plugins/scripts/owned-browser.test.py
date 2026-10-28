#!/usr/bin/env python3
import json
import os
from pathlib import Path
import signal
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest

HELPER = Path(__file__).with_name("owned-browser.py")

FAKE = r'''#!PYTHON
import http.server, json, os, pathlib, signal, socket, subprocess, sys, time
root = pathlib.Path(__file__).resolve().parents[1]
role = pathlib.Path(sys.argv[0]).name
mode = (root / 'mode').read_text()
def log(kind, **kw):
    with (root / 'calls').open('a') as f:
        f.write(json.dumps(dict(kind=kind, pid=os.getpid(), argv=sys.argv[1:], env=dict(os.environ), **kw))+'\n')
def targets(): return json.loads((root/'targets').read_text())
def save(t): (root/'targets').write_text(json.dumps(t))
def alive(pid):
    try: os.kill(pid,0); return True
    except ProcessLookupError: return False
if role == 'sentinel-process':
    import select
    tcp=socket.socket(); tcp.bind(('127.0.0.1',0)); tcp.listen()
    unix=socket.socket(socket.AF_UNIX); unix.bind(str(root/'default.sock')); unix.listen()
    (root/'sentinel-state').write_text(json.dumps(dict(pid=os.getpid(),port=tcp.getsockname()[1])))
    while True:
        for listener in select.select([tcp,unix],[],[],.1)[0]: listener.accept()[0].close()
elif role == 'chrome':
    profile = pathlib.Path(next(a.split('=',1)[1] for a in sys.argv if a.startswith('--user-data-dir=')))
    log('chrome', profile_mode=profile.stat().st_mode & 0o777)
    save([dict(id='initial', type='page', url='about:blank')])
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            data = dict(webSocketDebuggerUrl=f'ws://127.0.0.1:{self.server.server_port}/devtools/browser/owned') if self.path == '/json/version' else targets()
            self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(data).encode())
        def log_message(self, *a): pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1',0), Handler)
    (root/'browser').write_text(json.dumps(dict(pid=os.getpid(),profile=str(profile),port=server.server_port)))
    if mode=='partial': sys.exit(9)
    (profile/'DevToolsActivePort').write_text(f'{server.server_port}\n/devtools/browser/owned\n')
    server.serve_forever()
elif role == 'daemon':
    runtime = pathlib.Path(os.environ['BH_RUNTIME_DIR'])
    sock = socket.socket(socket.AF_UNIX); sock.bind(str(runtime/'bu.sock')); sock.listen()
    peer = socket.create_connection(('127.0.0.1',json.loads((root/'browser').read_text())['port']))
    (root/'daemon').write_text(str(os.getpid()))
    def stop(*a):
        sock.close(); peer.close(); (runtime/'bu.sock').unlink(missing_ok=True); sys.exit(0)
    signal.signal(signal.SIGTERM,stop)
    while True: time.sleep(.1)
elif role == 'ps':
    pid=int(sys.argv[sys.argv.index('-p')+1]); data=json.loads((root/'browser').read_text())
    if not alive(pid): sys.exit(1)
    if subprocess.run(['/bin/ps','-p',str(pid),'-o','stat='],capture_output=True,text=True).stdout.strip().startswith('Z'): sys.exit(1)
    if pid == data['pid']:
        profile = data['profile'] if not (mode == 'identity' and (root/'verified').exists()) else '/unrelated'
        command=f"{root}/bin/chrome --user-data-dir={profile} --remote-debugging-port=0"
    else: command=f"{(root/'daemon-image').read_text()} -m browser_harness.daemon"
    print(f'{os.getuid()} Mon Jan 1 00:00:00 2024 {command}')
elif role == 'lsof':
    data=json.loads((root/'browser').read_text())
    args=sys.argv[1:]
    if '+D' in args: sys.exit(1)
    if any(a.startswith('-iTCP:') for a in args):
        if mode=='nonloopback' and (root/'verified').exists(): print(f"p{data['pid']}\nn0.0.0.0:{data['port']}"); sys.exit(0)
        if alive(data['pid']): print(f"p{data['pid']}\nn127.0.0.1:{data['port']}")
        else: sys.exit(1)
    elif '-sTCP:ESTABLISHED' in args:
        print(f"p{sys.argv[sys.argv.index('-p')+1]}\nn127.0.0.1:40000->127.0.0.1:{data['port']}")
    else:
        path=pathlib.Path(args[-1])
        if not path.exists(): sys.exit(1)
        if mode=='socket-mismatch' and (root/'verified').exists(): print(f"p{os.getpid()}\nn{path}"); sys.exit(0)
        print(f"p{(root/'daemon').read_text()}\nn{path}")
elif role in ('browser-use','browser-harness'):
    env_file=root/'lib/python3.11/.env'
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if '=' in line and not line.startswith('#'):
                key,value=line.split('=',1); os.environ.setdefault(key.strip(),value.strip())
    source = '' if len(sys.argv)>1 else sys.stdin.read()
    log(role, source=source)
    runtime=pathlib.Path(os.environ['BH_RUNTIME_DIR'])
    if 'doctor' in sys.argv:
        if mode=='invalid-doctor': print('not JSON'); sys.exit(1)
        running=(runtime/'bu.sock').exists()
        if running:
            ledger=json.loads((pathlib.Path(os.environ['BB_OWNED_BROWSER_EVIDENCE'])/'ledger.json').read_text())
            assert ledger['targets']=={'initial':'initial','provisioning':'provisioning'}
        name=os.environ['BU_NAME'] if not (mode == 'doctor-name' and (root/'verified').exists()) else 'default'
        print(json.dumps(dict(schema_version=1,require_existing_daemon=True,healthy=running,daemon=dict(name=name,alive=running,browser_ready=running))))
        sys.exit(0 if running else 1)
    if '--reload' in sys.argv:
        os.kill(int((root/'daemon').read_text()),signal.SIGTERM)
        for _ in range(100):
            if not (runtime/'bu.sock').exists(): break
            time.sleep(.01)
        sys.exit(0)
    if os.environ['BH_REQUIRE_EXISTING_DAEMON']=='0':
        ledger=json.loads((pathlib.Path(os.environ['BB_OWNED_BROWSER_EVIDENCE'])/'ledger.json').read_text())
        assert ledger['targets']=={'initial':'initial'}
        subprocess.Popen([str(root/'bin/daemon'),'-m','browser_harness.daemon'],env=os.environ,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
        for _ in range(100):
            if (runtime/'bu.sock').exists(): break
            time.sleep(.01)
        save(targets()+[dict(id='provisioning',type='page',url='about:blank')])
        if mode=='missing-id': sys.exit(1)
    def cdp(method, **params):
        log('cdp', method=method, params=params)
        if method=='Target.getTargets':
            return dict(targetInfos=[dict(targetId=t['id'],type=t['type']) for t in targets()])
        if method=='Target.closeTarget':
            if mode=='ipc-hang': signal.signal(signal.SIGALRM,signal.SIG_IGN); time.sleep(20)
            if mode=='timeout': time.sleep(10)
            if mode=='false-ack': return dict(success=False)
            if mode=='failed-ack': raise RuntimeError('transport failed after send')
            if mode!='no-absence': save([t for t in targets() if t['id']!=params['targetId']])
            return dict(success=True)
        raise RuntimeError(method)
    exec(compile(source,'<fake public CLI>','exec'),dict(cdp=cdp,current_tab=lambda:dict(targetId='provisioning')))
elif role == 'verifier':
    log('verifier'); (root/'verified').touch()
    if mode=='unknown': save(targets()+[dict(id='unowned',type='page',url='https://example.test')])
    if mode=='cancel':
        (root/'waiting').touch()
        while True: time.sleep(.1)
    if mode=='failure': sys.exit(7)
'''


class OwnerCLI(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="owner-test-", dir="/tmp")
        self.root = Path(self.temp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        interpreter = Path(sys.executable).resolve()
        framework_image = interpreter.parent.parent / "Resources/Python.app/Contents/MacOS/Python"
        self.framework_image = framework_image if sys.platform == "darwin" and interpreter.parent.name == "bin" and framework_image.is_file() else None
        (self.root / "daemon-image").write_text(str(self.framework_image or interpreter))
        for name in ("sentinel-process", "chrome", "daemon", "ps", "lsof", "browser-use", "browser-harness", "verifier"):
            path = self.bin / name
            path.write_text(FAKE.replace("#!PYTHON", "#!" + sys.executable))
            path.chmod(0o700)
        site = self.root / "lib/python3.11/site-packages"
        for package, version in (("browser_use", "0.13.11"), ("browser_harness", "0.1.13")):
            meta = site / f"{package}-{version}.dist-info/METADATA"
            meta.parent.mkdir(parents=True)
            meta.write_text(f"Name: {package.replace('_','-')}\nVersion: {version}\n")
        core = site / "browser_harness"
        core.mkdir()
        (core / "helpers.py").write_text("def cdp(method, session_id=None, _response_timeout=5, **params): pass\ndef current_tab(): pass\ndef list_tabs(): pass\ndef new_tab(): pass\ndef close_tab(): pass\n")
        (self.root / "mode").write_text("ok")
        (self.root / "sentinel").write_text("unrelated browser/profile/default daemon")
        self.env = dict(os.environ, BB_SERVER_URL="http://127.0.0.1:43210/project/path", BU_CDP_WS="ws://unrelated", BU_NAME="default", BU_AUTOSPAWN="1", BROWSER_USE_API_KEY="secret", BH_RECORD="1")
        self.options = ["--chrome", str(self.bin / "chrome"), "--browser-use", str(self.bin / "browser-use"), "--harness", str(self.bin / "browser-harness"), "--ps", str(self.bin / "ps"), "--lsof", str(self.bin / "lsof")]
        self.approval = self.root / "approval.json"
        self.approval.write_text(json.dumps(dict(reference="test approval", chrome=str(self.bin / "chrome"), launch=True, foreground=True, cleanup=True)))
        self.sentinel = subprocess.Popen([str(self.bin/'sentinel-process')], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline=time.monotonic()+5
        while not (self.root/'sentinel-state').exists() and self.sentinel.poll() is None and time.monotonic()<deadline: time.sleep(.01)
        self.assertTrue((self.root/'sentinel-state').exists())

    def tearDown(self):
        for file in ("daemon", "browser"):
            if (self.root / file).exists():
                value = (self.root / file).read_text()
                pid = json.loads(value)["pid"] if file == "browser" else int(value)
                try: os.kill(pid, signal.SIGTERM)
                except ProcessLookupError: pass
        self.sentinel.terminate()
        self.sentinel.wait(timeout=3)
        if (self.root/'evidence/ledger.json').exists() and (self.root/'browser').exists():
            ledger=self.ledger()
            browser=json.loads((self.root/'browser').read_text())
            owned=Path(ledger['temporary_root'])
            self.assertEqual(ledger['profile'],browser['profile'])
            deadline=time.monotonic()+3
            while time.monotonic()<deadline:
                try:
                    with socket.create_connection(('127.0.0.1',browser['port']),timeout=.1): pass
                except OSError: break
                time.sleep(.02)
            else: self.fail('Fake browser listener survived test teardown')
            if owned.exists(): shutil.rmtree(owned)
        self.temp.cleanup()

    def command(self, action="run", approved=True):
        args = [sys.executable, str(HELPER), action] + self.options
        if action == "run":
            args += ["--evidence", str(self.root / "evidence")]
            if approved: args += ["--approval", str(self.approval)]
            args += ["--", str(self.bin / "verifier")]
        return args

    def run_cli(self, mode="ok", approved=True, action="run", env=None):
        (self.root / "mode").write_text(mode)
        result = subprocess.run(self.command(action, approved), env=env or self.env, capture_output=True, text=True, timeout=25)
        self.assertEqual((self.root / "sentinel").read_text(), "unrelated browser/profile/default daemon")
        self.assertIsNone(self.sentinel.poll())
        sentinel=json.loads((self.root/'sentinel-state').read_text())
        with socket.create_connection(('127.0.0.1',sentinel['port']),timeout=1): pass
        with socket.socket(socket.AF_UNIX) as peer: peer.connect(str(self.root/'default.sock'))
        return result

    def ledger(self):
        return json.loads((self.root / "evidence/ledger.json").read_text())

    def calls(self):
        return [json.loads(line) for line in (self.root / "calls").read_text().splitlines()] if (self.root / "calls").exists() else []

    def test_check_starts_nothing(self):
        result = self.run_cli(action="check")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.root / "calls").exists())
        self.assertFalse((self.root / "evidence").exists())

    def test_selected_framework_process_image(self):
        if self.framework_image is None:
            self.skipTest("Requires a macOS framework launcher")
        result = self.run_cli()
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual(self.ledger()['status'], 'cleaned')
        self.assertEqual(self.ledger()['cleanup'], dict(targets='confirmed_absent', daemon='confirmed_absent', browser='confirmed_absent'))
        verifier = next(call for call in self.calls() if call['kind'] == 'verifier')
        self.assertEqual(verifier['env']['task_target'], 'initial')

    def test_unrelated_framework_process_image_refused(self):
        if self.framework_image is None:
            self.skipTest("Requires a macOS framework launcher")
        interpreter = Path(sys.executable).resolve()
        unrelated = self.root / 'other/Python.framework/Versions' / interpreter.parent.parent.name / 'Resources/Python.app/Contents/MacOS/Python'
        unrelated.parent.mkdir(parents=True)
        unrelated.write_text(FAKE.replace('#!PYTHON', '#!' + sys.executable))
        unrelated.chmod(0o700)
        images = (unrelated, interpreter.parent.parent.parent / '9.99/Resources/Python.app/Contents/MacOS/Python', interpreter)
        for image in images:
            with self.subTest(image=str(image)):
                if (self.root / 'evidence').exists():
                    self.tearDown(); self.setUp()
                (self.root / 'daemon-image').write_text(str(image))
                result = self.run_cli()
                self.assertEqual(result.returncode, 3, result.stderr + result.stdout)
                self.assertIn('Named daemon process mismatch', result.stderr)
                self.assertEqual(self.ledger()['status'], 'cleanup_pending')
                self.assertTrue(Path(self.ledger()['profile']).exists())
                self.assertFalse(any(call['kind'] == 'verifier' or '--reload' in call['argv'] or call['kind'] == 'cdp' for call in self.calls()))

    def test_refuses_before_allocation(self):
        for approved, env in ((False, self.env), (True, {k:v for k,v in self.env.items() if k != 'BB_SERVER_URL'}), (True, dict(self.env, BB_SERVER_URL='http://secret@host/'))):
            result = self.run_cli(approved=approved, env=env)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(self.calls(), [])
            self.assertFalse((self.root / "evidence").exists())

    def test_launch_foreground_and_cleanup_permissions_are_all_required(self):
        for field in ('launch','foreground','cleanup'):
            approval=json.loads(self.approval.read_text())
            approval[field]=False
            self.approval.write_text(json.dumps(approval))
            result=self.run_cli()
            self.assertEqual(result.returncode,3)
            self.assertEqual(self.calls(),[])
            self.assertFalse((self.root/'evidence').exists())
            approval[field]=True
            self.approval.write_text(json.dumps(approval))

    def test_signed_in_requires_separate_approval(self):
        args = self.command()
        args.insert(args.index('--'), '--signed-in')
        result = subprocess.run(args, env=self.env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_installation_env_conflict_refused(self):
        (self.root / 'lib/python3.11/.env').write_text('BU_CDP_WS=ws://secret-route\n')
        result = self.run_cli()
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('secret-route', result.stdout + result.stderr)
        self.assertEqual(self.calls(), [])
        self.assertFalse((self.root / 'evidence').exists())

    def test_success_scoped_environment_and_ids(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        ledger = self.ledger()
        self.assertEqual(ledger['status'], 'cleaned')
        self.assertEqual(ledger['targets'], {'initial':'initial','provisioning':'provisioning'})
        self.assertEqual(ledger['bb_origin'], 'http://127.0.0.1:43210')
        self.assertFalse(Path(ledger['profile']).exists())
        self.assertEqual((self.root/'evidence').stat().st_mode & 0o777,0o700)
        self.assertEqual((self.root/'evidence/ledger.json').stat().st_mode & 0o777,0o600)
        self.assertEqual(ledger['cleanup'],dict(targets='confirmed_absent',daemon='confirmed_absent',browser='confirmed_absent'))
        self.assertNotIn('active_child',ledger)
        calls = self.calls()
        chrome = next(c for c in calls if c['kind']=='chrome')
        self.assertEqual(chrome['profile_mode'],0o700)
        self.assertIn('--remote-debugging-port=0', chrome['argv'])
        self.assertIn('--remote-debugging-address=127.0.0.1', chrome['argv'])
        provisioning = [c for c in calls if c['kind']=='browser-use' and c['env']['BH_REQUIRE_EXISTING_DAEMON']=='0']
        self.assertEqual(len(provisioning), 1)
        verifier = next(c for c in calls if c['kind']=='verifier')
        self.assertEqual(verifier['env']['task_target'], 'initial')
        self.assertEqual(json.loads(verifier['env']['task_created_targets']), ['initial','provisioning'])
        for c in calls:
            if c['kind'] in ('browser-use','browser-harness','verifier'):
                env=c['env']
                self.assertNotEqual(env['BU_NAME'],'default')
                self.assertEqual(env['BU_CDP_WS'],'')
                self.assertEqual(env['BU_AUTOSPAWN'],'')
                self.assertEqual(env['BU_BROWSER_ID'],'')
                self.assertEqual(env['BH_RECORD'],'0')
                self.assertEqual(env['BH_TAB_MARKER'],'0')
                self.assertEqual(env['BROWSER_USE_API_KEY'],'')
                if c not in provisioning: self.assertEqual(env['BH_REQUIRE_EXISTING_DAEMON'],'1')
        self.assertEqual([c['params']['targetId'] for c in calls if c['kind']=='cdp' and c['method']=='Target.closeTarget'], ['initial','provisioning'])

    def test_installed_env_cannot_restore_recording_or_cloud(self):
        (self.root/'lib/python3.11/.env').write_text('BH_RECORD=1\nBH_TAB_MARKER=1\nBH_DOMAIN_SKILLS=1\nBH_RUNTIME_DIR=/unrelated\nBROWSER_USE_API_KEY=dotenv-secret\n')
        result=self.run_cli()
        self.assertEqual(result.returncode,0,result.stderr)
        for call in self.calls():
            if call['kind'] in ('browser-use','browser-harness','verifier'):
                self.assertEqual(call['env']['BH_RECORD'],'0')
                self.assertEqual(call['env']['BH_TAB_MARKER'],'0')
                self.assertEqual(call['env']['BH_DOMAIN_SKILLS'],'0')
                self.assertNotEqual(call['env']['BH_RUNTIME_DIR'],'/unrelated')
                self.assertEqual(call['env']['BROWSER_USE_API_KEY'],'')

    def test_partial_launch_can_clean_proven_owned_resources(self):
        result=self.run_cli('partial')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual(self.ledger()['status'],'cleaned')
        self.assertFalse(any(call['kind'] in ('browser-use','browser-harness') for call in self.calls()))

    def test_invalid_absence_diagnostic_never_provisions(self):
        result=self.run_cli('invalid-doctor')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual(self.ledger()['status'],'cleaned')
        self.assertFalse(any(call['kind']=='browser-use' for call in self.calls()))

    def test_verifier_failure_still_cleans(self):
        result = self.run_cli('failure')
        self.assertEqual(result.returncode, 7, result.stderr)
        self.assertEqual(self.ledger()['status'],'cleaned')

    def test_uncertainty_preserves_resources(self):
        for mode in ('missing-id','false-ack','failed-ack','timeout','no-absence','identity','unknown','doctor-name','ipc-hang','nonloopback','socket-mismatch'):
            with self.subTest(mode=mode):
                if (self.root/'evidence').exists():
                    self.tearDown(); self.setUp()
                result=self.run_cli(mode)
                self.assertEqual(result.returncode,3, result.stderr + result.stdout)
                ledger=self.ledger()
                self.assertEqual(ledger['status'],'cleanup_pending')
                self.assertTrue(Path(ledger['profile']).exists())
                self.assertFalse(any('--reload' in c['argv'] for c in self.calls()))
                if mode in ('identity','unknown','missing-id','doctor-name','nonloopback','socket-mismatch'):
                    self.assertFalse(any(c['kind']=='cdp' and c['method']=='Target.closeTarget' for c in self.calls()))
                if mode in ('failed-ack','timeout','false-ack','ipc-hang'):
                    self.assertEqual(sum(c['kind']=='cdp' and c['method']=='Target.closeTarget' for c in self.calls()),1)

    def test_cancellation_quiesces_verifier_before_cleanup(self):
        (self.root/'mode').write_text('cancel')
        process=subprocess.Popen(self.command(),env=self.env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        deadline=time.monotonic()+10
        while not (self.root/'waiting').exists() and process.poll() is None and time.monotonic()<deadline: time.sleep(.02)
        self.assertTrue((self.root/'waiting').exists())
        process.send_signal(signal.SIGTERM)
        stdout,stderr=process.communicate(timeout=15)
        self.assertEqual(process.returncode,130,stdout+stderr)
        self.assertEqual(self.ledger()['status'],'cleaned')
        verifier=next(call for call in self.calls() if call['kind']=='verifier')
        with self.assertRaises(ProcessLookupError): os.kill(verifier['pid'],0)


if __name__ == '__main__':
    unittest.main()
