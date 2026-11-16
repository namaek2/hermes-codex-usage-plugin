"""End-to-end backend registration, persistence and protected gateway RPC coverage."""
import asyncio
import os
import shutil
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

import hermes_yaml as yaml

PLUGIN = Path(__file__).resolve().parents[1]


class TrackingIntegrationTest(unittest.IsolatedAsyncioTestCase):
    async def test_registration_dispatch_reload_and_protected_query(self):
        from hermes_constants import reset_hermes_home_override, set_hermes_home_override
        from hermes_cli import plugins
        from gateway.session_controls import AuthorityConnection
        from types import SimpleNamespace

        with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR")) as td:
            home = Path(td) / "home"; home.mkdir()
            token = set_hermes_home_override(home)
            try:
                target = home / "plugins" / "limits-monitor"; target.mkdir(parents=True)
                shutil.copy2(PLUGIN / "__init__.py", target / "__init__.py")
                shutil.copy2(PLUGIN / "usage.py", target / "usage.py")
                shutil.copy2(PLUGIN / "plugin.yaml", target / "plugin.yaml")
                (home / "config.yaml").write_text(yaml.safe_dump({"plugins": {"enabled": ["limits-monitor"]}}))
                manager = plugins.PluginManager(str(home)); plugins._plugin_manager = manager; manager.discover_and_load()
                self.assertIn("limits-monitor", manager._plugins)
                manager.invoke_hook("post_api_request", api_request_id="integration-r", session_id="integration-s",
                                    usage={"input_tokens": 2,"cache_read_tokens": 1,"cache_write_tokens": 0,"output_tokens": 4})
                manager.discover_and_load(force=True)
                manager.invoke_hook("post_api_request", api_request_id="integration-r2", session_id="integration-s",
                                    usage={"input_tokens": 1,"cache_read_tokens": 0,"cache_write_tokens": 0,"output_tokens": 2})
                manager.invoke_hook("post_api_request", api_request_id="integration-r", session_id="integration-s",
                                    usage={"input_tokens": 99,"cache_read_tokens": 0,"cache_write_tokens": 0,"output_tokens": 99})

                class Runner:
                    pass
                runner = Runner()
                # Reuse the host's isolated authority fixture; only its session store/database are needed.
                # AuthorityConnection is the production dispatch boundary. This narrowly scoped authority
                # avoids the unrelated boot-time recovery/background workers of full gateway startup.
                authority=SimpleNamespace(retired=False, instance_id="owner", profile_id="isolated", runner=SimpleNamespace(), events={})
                owner = AuthorityConnection(authority, object(), {"user_id":"owner"})
                reader = AuthorityConnection(authority, object(), {"user_id":"owner","capabilities":["session:read"]})
                async def inline_off_loop(connection, func):
                    result=func()
                    return await result if asyncio.iscoroutine(result) else result
                with patch("gateway.session_plugin_rpc._off_loop", inline_off_loop):
                    denied = await reader.dispatch({"id":1,"method":"plugin.limits-monitor.usage.list","params":{}})
                    self.assertEqual(denied["error"]["data"]["reason"], "permission_denied")
                    allowed = await owner.dispatch({"id":2,"method":"plugin.limits-monitor.usage.list","params":{}})
                    self.assertEqual(allowed["result"]["rows"][0]["reported_total_tokens"],10)
                    self.assertEqual(allowed["result"]["rows"][0]["calls"],2)
            finally:
                reset_hermes_home_override(token)


if __name__ == "__main__":
    unittest.main()
