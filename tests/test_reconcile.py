"""Automatic cooldown recovery: synthetic upstream, real isolated auth store."""
import copy
import importlib.util
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from hermes_constants import set_hermes_home_override, reset_hermes_home_override
from hermes_cli.auth import _load_auth_store, _save_auth_store
from agent.account_usage import AccountUsageSnapshot, AccountUsageWindow
from datetime import datetime, UTC, timedelta
from typing import Any

BACKEND = Path(__file__).resolve().parents[1] / "dashboard" / "plugin_api.py"


class ReconcileTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR"))
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        token = set_hermes_home_override(self.home)
        self.addCleanup(reset_hermes_home_override, token)
        self.now = time.time()
        self.row = dict(id="synthetic-main", label="Main", auth_type="oauth", priority=0,
                        source="manual:test", access_token="synthetic-access", refresh_token="synthetic-refresh",
                        last_status="exhausted", last_status_at=self.now - 600,
                        last_error_code=429, last_error_reason="usage_limit_reached",
                        last_error_reset_at=self.now + 86400,
                        model_cooldowns={"protected-model": self.now + 3600})
        self.sibling = dict(self.row, id="synthetic-other", label="Other", priority=1, last_error_code=401)
        self.store = {"version": 1, "providers": {"preserved": {"opaque": "synthetic"}},
                      "credential_pool": {"openai-codex": [self.row, self.sibling]}}
        _save_auth_store(copy.deepcopy(self.store))
        self.assertTrue(BACKEND.is_file(), "automatic recovery backend is missing")
        spec = importlib.util.spec_from_file_location("limits_reconcile_test", BACKEND)
        assert spec is not None and spec.loader is not None
        self.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.mod)
        self.fetch = patch.object(self.mod, "_fetch_codex_account_usage_read_only", side_effect=lambda **_: self.snapshot()).start()
        self.addCleanup(patch.stopall)
        patch.object(self.mod, "_codex_snapshot_identity", return_value="synthetic-identity").start()

    def snapshot(self, used: Any = 14, **changes):
        values: dict[str, Any] = dict(provider="openai-codex", source="usage_api", fetched_at=datetime.now(UTC),
                      identity="synthetic-identity", windows=(AccountUsageWindow("Weekly", used),),
                      raw={"rate_limit": {"allowed": True, "limit_reached": False,
                           "primary_window": {"used_percent": used}}})
        values.update(changes)
        return AccountUsageSnapshot(**values)

    def test_fresh_allowed_quota_clears_only_account_status(self):
        result = self.mod.reconcile()
        self.assertEqual(result, {"status": "checked", "checked": 1, "cleared": 1, "errors": 0})
        after = _load_auth_store()
        main, other = after["credential_pool"]["openai-codex"]
        self.assertEqual(other, self.sibling)
        self.assertEqual(after["providers"], self.store["providers"])
        for key, value in self.row.items():
            if key not in self.mod._CLEAR_STATUS:
                self.assertEqual(main[key], value, key)
        for key in self.mod._CLEAR_STATUS:
            self.assertIsNone(main.get(key), key)
        self.assertGreater(main["status_cleared_at"], self.row["last_status_at"])
        self.fetch.assert_called_once()
        self.assertEqual(self.fetch.call_args.kwargs["api_key"], "synthetic-access")
        self.assertNotIn("synthetic", str(result))
        self.assertEqual((self.home / "auth.json").stat().st_mode & 0o777, 0o600)

    def test_native_null_reason_exhaustion_can_clear_only_with_fresh_positive_upstream(self):
        from agent.credential_pool import PooledCredential
        PooledCredential.from_dict("openai-codex", self.row)
        stored = copy.deepcopy(self.store)
        stored["credential_pool"]["openai-codex"][0]["last_error_reason"] = None
        _save_auth_store(stored)
        self.assertEqual(self.mod.reconcile()["cleared"], 1)
        self.assertEqual(PooledCredential.from_dict("openai-codex", _load_auth_store()["credential_pool"]["openai-codex"][0]).last_status, None)

        for changes in [{"used": 100}, {"raw": {"rate_limit": {"allowed": False, "limit_reached": False, "primary_window": {"used_percent": 20}}}}]:
            with self.subTest(changes=changes):
                _save_auth_store(stored)
                self.fetch.side_effect = lambda **_: self.snapshot(**changes)
                before = (self.home / "auth.json").read_bytes()
                self.assertEqual(self.mod.reconcile()["cleared"], 0)
                self.assertEqual((self.home / "auth.json").read_bytes(), before)
        _save_auth_store(copy.deepcopy(self.store))
        self.row["last_error_reason"] = "rate_limit_exceeded"
        _save_auth_store(copy.deepcopy(self.store))
        self.assertEqual(self.mod.reconcile()["checked"], 0)

    def test_unverified_or_exhausted_quota_never_writes(self):
        raw = self.snapshot().raw
        assert raw is not None
        valid = raw["rate_limit"]
        cases = [
            {"used": 100}, {"used": float("nan")}, {"used": -1}, {"used": True},
            {"raw": {}}, {"raw": {"rate_limit": dict(valid, allowed=False)}},
            {"raw": {"rate_limit": dict(valid, limit_reached=True)}},
            {"raw": {"rate_limit": dict(valid, allowed=1)}},
            {"unavailable_reason": "synthetic failure"}, {"identity": "other-account"},
            {"windows": ()}, {"fetched_at": datetime.now(UTC) - timedelta(minutes=20)},
            {"fetched_at": datetime.now(UTC) + timedelta(minutes=1)},
            {"windows": (AccountUsageWindow("Weekly", 10, datetime.now(UTC) - timedelta(seconds=1)),)},
            {"raw": {"rate_limit": dict(valid, secondary_window={"used_percent": 100})}},
            {"raw": {"rate_limit": dict(valid, primary_window={"used_percent": None})}},
            {"raw": {"rate_limit": valid, "additional_rate_limits": [
                {"limit_name": "protected-model", "rate_limit": dict(valid, allowed=False)}]}},
            {"raw": {"rate_limit": valid, "additional_rate_limits": "invalid"}},
            {"raw": {"rate_limit": valid, "additional_rate_limits": {}}},
            {"raw": {"rate_limit": valid, "additional_rate_limits": 0}},
        ]
        for changes in cases:
            with self.subTest(changes=changes):
                _save_auth_store(copy.deepcopy(self.store))
                self.fetch.side_effect = lambda **_: self.snapshot(**changes)
                before = (self.home / "auth.json").read_bytes()
                self.assertEqual(self.mod.reconcile()["cleared"], 0)
                self.assertEqual((self.home / "auth.json").read_bytes(), before)

    def test_live_native_pool_adopts_reset_marker_without_losing_model_limits(self):
        from agent.credential_pool import CredentialPool, PooledCredential
        entry = PooledCredential.from_dict("openai-codex", self.row)
        pool = CredentialPool("openai-codex", [entry])
        self.assertEqual(self.mod.reconcile()["cleared"], 1)
        recovered = pool._resync_stale_entry(entry)
        self.assertEqual(recovered.last_status, "ok")
        self.assertEqual(recovered.model_cooldowns, self.row["model_cooldowns"])
        self.assertEqual(recovered.access_token, entry.access_token)
        self.assertEqual(recovered.refresh_token, entry.refresh_token)

    def test_tiny_positive_quota_is_eligible(self):
        self.fetch.side_effect = lambda **_: self.snapshot(used=99.99)
        self.assertEqual(self.mod.reconcile()["cleared"], 1)

    def test_recent_or_non_usage_failure_is_not_queried(self):
        for change in [dict(last_status_at=time.time()), dict(last_error_code=401),
                       dict(last_error_reason="rate_limit_exceeded"), dict(last_status="dead"),
                       dict(last_status_at=None), dict(last_status_at="invalid")]:
            with self.subTest(change=change):
                store = copy.deepcopy(self.store)
                store["credential_pool"]["openai-codex"][0].update(change)
                _save_auth_store(store)
                before = (self.home / "auth.json").read_bytes()
                self.fetch.reset_mock()
                self.assertEqual(self.mod.reconcile()["checked"], 0)
                self.fetch.assert_not_called()
                self.assertEqual((self.home / "auth.json").read_bytes(), before)

    def test_concurrent_token_or_failure_change_is_preserved(self):
        for change in [dict(access_token="new-synthetic-token"), dict(last_status_at=time.time()),
                       dict(model_cooldowns={"new-model": time.time() + 1000})]:
            with self.subTest(change=change):
                _save_auth_store(copy.deepcopy(self.store))
                def fetch(**_):
                    changed = _load_auth_store()
                    changed["credential_pool"]["openai-codex"][0].update(change)
                    _save_auth_store(changed)
                    return self.snapshot()
                self.fetch.side_effect = fetch
                self.assertEqual(self.mod.reconcile()["cleared"], 0)
                current = _load_auth_store()["credential_pool"]["openai-codex"][0]
                for key, value in change.items():
                    self.assertEqual(current[key], value)

    def test_fetch_failure_is_redacted_and_does_not_write(self):
        self.fetch.side_effect = RuntimeError("synthetic-secret-must-not-leak")
        before = (self.home / "auth.json").read_bytes()
        result = self.mod.reconcile()
        self.assertEqual(result["errors"], 1)
        self.assertNotIn("synthetic", str(result))
        self.assertEqual((self.home / "auth.json").read_bytes(), before)

    def client(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        self.assertTrue(hasattr(self.mod, "router"), "scoped recovery route is missing")
        app = FastAPI()
        app.include_router(self.mod.router)
        return TestClient(app)

    def test_route_rechecks_on_interval_and_deduplicates(self):
        client = self.client()
        with patch.object(self.mod, "OWNER_HOME", self.home):
            first = client.post("/reconcile")
            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.json()["cleared"], 1)
            second = client.post("/reconcile")
            self.assertEqual(second.json()["status"], "throttled")
            self.fetch.assert_called_once()
            _save_auth_store(copy.deepcopy(self.store))
            with patch.object(self.mod.time, "monotonic", return_value=self.mod._last_try + 121):
                third = client.post("/reconcile")
            self.assertEqual(third.json()["cleared"], 1)
            self.assertEqual(self.fetch.call_count, 2)

    def test_route_fails_closed_across_profiles_and_on_get(self):
        client = self.client()
        before = (self.home / "auth.json").read_bytes()
        self.assertEqual(client.post("/reconcile").status_code, 403)
        with patch.object(self.mod, "OWNER_HOME", self.home):
            self.assertEqual(client.get("/reconcile").status_code, 405)
        self.fetch.assert_not_called()
        self.assertEqual((self.home / "auth.json").read_bytes(), before)

    def test_status_is_read_only_and_reports_completed_automatic_checks(self):
        client = self.client()
        with patch.object(self.mod, "OWNER_HOME", self.home):
            before = client.get("/recovery-status")
            self.assertEqual(before.status_code, 200)
            self.assertEqual(before.json()["checks"], 0)
            self.fetch.assert_not_called()
            client.post("/reconcile")
            status = client.get("/recovery-status").json()
            self.assertEqual(status["checks"], 1)
            self.assertEqual(status["last_result"]["cleared"], 1)
            self.assertEqual(status["interval_seconds"], 120)
            self.assertGreater(status["last_checked_at"], self.now)
            self.assertNotIn("synthetic", str(status))
        self.assertEqual(client.get("/recovery-status").status_code, 403)

    def test_overlapping_poll_does_not_start_second_fetch(self):
        client = self.client()
        with patch.object(self.mod, "OWNER_HOME", self.home), self.mod._run_lock:
            self.assertEqual(client.post("/reconcile").json()["status"], "busy")
        self.fetch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
