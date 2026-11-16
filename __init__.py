"""Privacy-bounded conversation usage collection for Limits Monitor."""
from .usage import UsageCollector


def register(ctx):
    # Capture ownership now, but resolve plugin storage on each invocation.
    owner_dir = _owner_data_dir()
    collector = UsageCollector(ctx, owner_dir)
    for name in ("pre_api_request", "post_api_request", "api_request_error", "subagent_start", "on_session_reset"):
        ctx.register_hook(name, getattr(collector, name))
    ctx.register_rpc("usage.list", collector.list_usage)


def _owner_data_dir():
    from hermes_constants import get_hermes_home
    return (get_hermes_home() / "plugin-data" / "limits-monitor").resolve()
