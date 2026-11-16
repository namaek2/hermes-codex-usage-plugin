"""Loopback bridge to the real Limits Monitor plugin manager and usage RPC."""
import asyncio, json, os, shutil, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[2]
PROFILES = ("fixture-profile-a", "fixture-profile-b")
CONNECTIONS = {PROFILES[0]: "fixture-connection-a", PROFILES[1]: "fixture-connection-b"}
SYNTHETIC_SESSIONS = frozenset(("synthetic-session-a", "synthetic-child-session"))
LOCK = threading.RLock()
CONTROL = {"delay_ms": 0, "fail_usage": False}
DATA_ROOT = Path(os.environ["HERMES_HOME"])
DATA_ROOT.mkdir(parents=True, exist_ok=True)
ROOT = Path(tempfile.mkdtemp(prefix="usage-ui-", dir=DATA_ROOT))


def fixture_authority(profile):
    from hermes_state_runtime import RuntimeStoreError

    def authorize(actor, ref, capability):
        if (actor.profile_id != profile or ref.profile_id != profile
                or capability not in actor.capabilities or ref.session_id not in SYNTHETIC_SESSIONS):
            raise RuntimeStoreError("permission_denied")

    return authorize


def probe_fixture_authority():
    from hermes_state_runtime import RuntimeStoreError
    from gateway.session_controls import SessionRef

    actor = SimpleNamespace(profile_id=PROFILES[0], capabilities={"session:control"})
    authorize = fixture_authority(PROFILES[0])
    authorize(actor, SessionRef(PROFILES[0], "synthetic-session-a"), "session:control")
    for bad_actor, ref, capability in (
        (SimpleNamespace(profile_id=PROFILES[0], capabilities={"session:read"}),
         SessionRef(PROFILES[0], "synthetic-session-a"), "session:control"),
        (SimpleNamespace(profile_id=PROFILES[0], capabilities={"session:control"}),
         SessionRef(PROFILES[1], "synthetic-session-a"), "session:control"),
    ):
        try:
            authorize(bad_actor, ref, capability)
        except RuntimeStoreError as exc:
            assert exc.reason == "permission_denied"
        else:
            raise AssertionError("fixture authority accepted an unauthorized session query")


probe_fixture_authority()


def activate(profile):
    from hermes_constants import reset_hermes_home_override, set_hermes_home_override
    from hermes_cli import plugins
    token = set_hermes_home_override(ROOT / profile)
    try:
        home = ROOT / profile
        (home / "plugins" / "limits-monitor").mkdir(parents=True, exist_ok=True)
        target = home / "plugins" / "limits-monitor"
        for name in ("__init__.py", "usage.py", "plugin.yaml"):
            shutil.copy2(REPO / name, target / name)
        import hermes_yaml as yaml
        (home / "config.yaml").write_text(yaml.safe_dump({"plugins": {"enabled": ["limits-monitor"]}}))
        manager = plugins.PluginManager(str(home))
        plugins._plugin_manager = manager
        manager.discover_and_load()
        return manager, plugins, set_hermes_home_override, reset_hermes_home_override, token
    except BaseException:
        reset_hermes_home_override(token)
        raise


def populate(profile):
    manager, plugins, _, reset, token = activate(profile)
    try:
        if profile == PROFILES[0]:
            manager.invoke_hook("pre_api_request", api_request_id="synthetic-complete", session_id="synthetic-session-a",
                                conversation_id="synthetic-conversation-a", provider="openai-codex", model="gpt-fixture",
                                started_at=1784000000)
            manager.discover_and_load(force=True)
            plugins._plugin_manager = manager
            manager.invoke_hook("post_api_request", api_request_id="synthetic-complete", session_id="synthetic-session-a",
                                conversation_id="synthetic-conversation-a", provider="openai-codex", model="gpt-fixture",
                                usage={"input_tokens": 24, "cache_read_tokens": 6, "cache_write_tokens": 0, "output_tokens": 10})
            # Repeated observer delivery updates the same request row; it must not add another call.
            manager.invoke_hook("post_api_request", api_request_id="synthetic-complete", session_id="synthetic-session-a",
                                conversation_id="synthetic-conversation-a", provider="openai-codex", model="gpt-fixture",
                                usage={"input_tokens": 24, "cache_read_tokens": 6, "cache_write_tokens": 0, "output_tokens": 10})
            manager.invoke_hook("api_request_error", api_request_id="synthetic-failed", session_id="synthetic-session-a",
                                conversation_id="synthetic-conversation-a", provider="openai-codex", model="gpt-fixture", status_code=500)
            manager.invoke_hook("pre_api_request", api_request_id="synthetic-pending", session_id="synthetic-session-a",
                                conversation_id="synthetic-conversation-a", provider="openai-codex", model="gpt-fixture")
            manager.invoke_hook("subagent_start", parent_session_id="synthetic-session-a", child_session_id="synthetic-child-session")
            manager.invoke_hook("post_api_request", api_request_id="synthetic-child-request", session_id="synthetic-child-session",
                                provider="openai-codex", model="gpt-fixture",
                                usage={"input_tokens": 5, "cache_read_tokens": 0, "cache_write_tokens": 0, "output_tokens": 2})
        # Reopen the actual plugin and then leave the current manager active for the RPC boundary.
        manager.discover_and_load(force=True)
        plugins._plugin_manager = manager
    finally:
        reset(token)
    return manager


MANAGERS = {name: populate(name) for name in PROFILES}


async def dispatch(profile, params):
    from gateway.session_controls import AuthorityConnection
    from hermes_constants import reset_hermes_home_override, set_hermes_home_override
    from hermes_cli import plugins
    token = set_hermes_home_override(ROOT / profile)
    try:
        manager = MANAGERS[profile]
        plugins._plugin_manager = manager
        authority = SimpleNamespace(retired=False, instance_id="fixture-owner", profile_id=profile,
                                    runner=SimpleNamespace(), events={}, authorize=fixture_authority(profile))
        owner = AuthorityConnection(authority, object(), {"user_id": "fixture-owner"})
        async def inline_off_loop(connection, fn):
            result = fn()
            return await result if asyncio.iscoroutine(result) else result
        with patch("gateway.session_plugin_rpc._off_loop", inline_off_loop):
            return await owner.dispatch({"id": 1, "method": "plugin.limits-monitor.usage.list", "params": params})
    finally:
        reset_hermes_home_override(token)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def send_json(self, code, payload):
        raw = json.dumps(payload).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def do_OPTIONS(self):
        self.send_response(204); self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Access-Control-Allow-Headers", "Content-Type"); self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS"); self.end_headers()
    def do_POST(self):
        try: body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
        except Exception: return self.send_json(400, {"error": "invalid json"})
        if self.path == "/control":
            with LOCK:
                CONTROL.update({key: body[key] for key in ("delay_ms", "fail_usage") if key in body})
            return self.send_json(200, {"ok": True, "control": CONTROL})
        if self.path != "/rpc": return self.send_json(404, {"error": "not found"})
        profile, connection = body.get("profile"), body.get("connection")
        if profile not in PROFILES or CONNECTIONS[profile] != connection:
            return self.send_json(403, {"error": "fixture profile/connection mismatch"})
        method, params = body.get("method"), body.get("params") or {}
        if method == "profiles.list": return self.send_json(200, {"profiles": [{"name": profile}]})
        if method == "model.options": return self.send_json(200, {"providers": []})
        if method != "plugin.limits-monitor.usage.list": return self.send_json(404, {"error": "unknown fixture RPC"})
        with LOCK: control = dict(CONTROL)
        if control["delay_ms"]: time.sleep(min(10, control["delay_ms"] / 1000))
        if control["fail_usage"]: return self.send_json(503, {"error": "synthetic fixture query failure"})
        try:
            with LOCK: result = asyncio.run(dispatch(profile, params))
        except Exception as exc: return self.send_json(500, {"error": type(exc).__name__})
        if result.get("error"): return self.send_json(500, {"error": result["error"].get("message", "RPC failed")})
        return self.send_json(200, result.get("result", {}))


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
print(json.dumps({"fixture": "SYNTHETIC FIXTURE", "bridge": f"http://127.0.0.1:{server.server_port}", "profiles": CONNECTIONS}), flush=True)
try: server.serve_forever()
except KeyboardInterrupt: pass
finally:
    server.shutdown(); server.server_close()
    shutil.rmtree(ROOT, ignore_errors=True)
