"""Reconcile stale Codex account cooldowns; never redeem quota or refresh tokens."""
from copy import deepcopy
import math
from pathlib import Path
import threading
import time

from fastapi import APIRouter, HTTPException
from agent.account_usage import _codex_snapshot_identity, _fetch_codex_account_usage_read_only
from agent.credential_pool import PooledCredential, _CLEAR_STATUS
from hermes_cli.auth import _auth_store_lock, _load_auth_store, _save_auth_store
from hermes_cli.auth_codex import _codex_pool_route_base_url
from hermes_constants import get_hermes_home

PROVIDER = "openai-codex"
INTERVAL = 120
OWNER_HOME = Path(__file__).resolve().parents[3]
router = APIRouter()
_run_lock = threading.Lock()
_last_try = float("-inf")
_status = {"interval_seconds": INTERVAL, "checks": 0, "last_checked_at": None, "last_result": None}


def _candidate(row):
    if not (isinstance(row, dict) and bool(row.get("id")) and bool(row.get("access_token"))
            and row.get("last_status") == "exhausted" and row.get("last_error_code") == 429
            and row.get("last_error_reason") in (None, "usage_limit_reached")):
        return False
    stamp = PooledCredential.from_dict(PROVIDER, row).last_status_at
    return (isinstance(stamp, (int, float)) and not isinstance(stamp, bool)
            and math.isfinite(stamp) and time.time() - stamp >= INTERVAL)


def _positive(value):
    return type(value) in (int, float) and math.isfinite(value) and 0 <= value < 100


def _limit_allows(limit):
    if not isinstance(limit, dict) or limit.get("allowed") is not True or limit.get("limit_reached") is not False:
        return False
    windows = [limit[k] for k in ("primary_window", "secondary_window") if limit.get(k) is not None]
    return bool(windows) and all(isinstance(w, dict) and _positive(w.get("used_percent")) for w in windows)


def _usable(snapshot, token, started):
    now = time.time()
    if (snapshot is None or not snapshot.available or snapshot.provider != PROVIDER
            or snapshot.source != "usage_api" or not started <= snapshot.fetched_at.timestamp() <= now
            or now - started > 30):
        return False
    identity = _codex_snapshot_identity(token)
    if not identity or snapshot.identity != identity:
        return False
    raw = snapshot.raw
    if not isinstance(raw, dict) or not _limit_allows(raw.get("rate_limit")):
        return False
    additional = raw.get("additional_rate_limits")
    if additional is None:
        additional = []
    if not isinstance(additional, list) or any(
            not isinstance(item, dict) or not _limit_allows(item.get("rate_limit")) for item in additional):
        return False
    return any(w.scope == "account" for w in snapshot.windows) and all(
        _positive(w.used_percent) and (w.reset_at is None or w.reset_at.timestamp() > now)
        for w in snapshot.windows)


def reconcile():
    result = {"status": "checked", "checked": 0, "cleared": 0, "errors": 0}
    with _auth_store_lock():
        rows = deepcopy(_load_auth_store().get("credential_pool", {}).get(PROVIDER, []))
    for row in rows:
        if not _candidate(row):
            continue
        result["checked"] += 1
        try:
            entry = PooledCredential.from_dict(PROVIDER, row)
            started = time.time()
            snapshot = _fetch_codex_account_usage_read_only(
                base_url=_codex_pool_route_base_url(entry.base_url), api_key=entry.access_token)
            if not _usable(snapshot, entry.access_token, started):
                continue
            with _auth_store_lock():
                store = _load_auth_store()
                matches = [r for r in store.get("credential_pool", {}).get(PROVIDER, [])
                           if r.get("id") == row["id"]]
                # Compare under the native lock: never erase a newer failure or token rotation.
                if len(matches) != 1 or matches[0] != row:
                    continue
                current = matches[0]
                current.update(_CLEAR_STATUS)
                current.pop("failure_reason", None)
                current["status_cleared_at"] = time.time()
                _save_auth_store(store)
                result["cleared"] += 1
        except Exception:
            # Exception text can contain credentials or provider bodies; expose counts only.
            result["errors"] += 1
    return result


@router.post("/reconcile")
def reconcile_route():
    global _last_try
    # The host authenticates this namespace; additionally forbid borrowed/sibling profile writes.
    if get_hermes_home().resolve() != OWNER_HOME:
        raise HTTPException(403, "Recovery is limited to the plugin owner's profile")
    if not _run_lock.acquire(blocking=False):
        return {"status": "busy"}
    try:
        now = time.monotonic()
        if now - _last_try < INTERVAL:
            return {"status": "throttled"}
        _last_try = now
        result = reconcile()
        _status.update(checks=_status["checks"] + 1, last_checked_at=time.time(), last_result=result)
        return result
    except Exception:
        _status.update(last_checked_at=time.time(), last_result={"status": "unavailable"})
        raise HTTPException(503, "Recovery check unavailable") from None
    finally:
        _run_lock.release()


@router.get("/recovery-status")
def recovery_status():
    if get_hermes_home().resolve() != OWNER_HOME:
        raise HTTPException(403, "Recovery is limited to the plugin owner's profile")
    return dict(_status)
