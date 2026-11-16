# Hermes Limits Monitor

A Hermes Desktop plugin for provider allowances and observed conversation usage, with guarded stale Codex cooldown recovery. This independent beta fork preserves the `limits-monitor` plugin ID. It replaces the upstream catalog edition rather than installing alongside it. The code is based on upstream [`zzhan1q/hermes-limits-monitor`](https://github.com/zzhan1q/hermes-limits-monitor) at commit `bd6810701442e2b2a91a4be2ea9811a88e1236aa`; original MIT copyright and attribution are retained.

## Beta installation

This Git installation is an unreviewed beta, separate from the existing upstream catalog entry. It requires Hermes **0.23.1 or newer**. Git installation checks out the branch tip at install time; only `--ref` with a full 40-character commit SHA selects an immutable revision.

```sh
hermes plugins install namaek2/hermes-codex-usage-plugin --enable
```

Then check **Agent** and **Desktop** toggles separately under **Capabilities → Plugins**. UI enablement is not universal or automatic. Since this fork and upstream use the same plugin ID, they cannot coexist in one Hermes installation. Do not force-overwrite a different source. Disable or remove through Hermes:

```sh
hermes plugins disable limits-monitor
hermes plugins remove limits-monitor
```

Uninstalling the plugin and deleting its separately retained local plugin data are distinct actions. Data is retained unless deliberately deleted; back it up before any deliberate deletion. The plugin does not automatically clean it up.

## What it does

- Shows account-separated provider allowances and reset details from Hermes catalog data. Provider coverage and reset information vary; unavailable values stay unavailable. The compact chip shows the smallest remaining account-scope window, without adding accounts together.
- The chip's selected account does **not** identify the credential used by the focused chat. Unknown or stale values are unavailable, never zero.
- Shows observed conversation usage totals and subtotals collected after activation. Account quota/allocation and per-chat quota usage are **not measured**; no quota percentage is inferred for a conversation. No history is backfilled; auxiliary/external calls are excluded and explicit conversation IDs may be needed to join continuations.
- Optionally repairs a narrowly verified stale Codex cooldown for the local/default profile only, while enabled, mounted, and connected. It does not scan arbitrary sibling or remote profiles. The backend reads the owner profile's Codex credential pool through **private Hermes helpers**, makes authenticated native provider usage requests, and can clear verified stale account-status fields under a lock and compare-and-swap check. It preserves tokens, other account rows, priorities, and model cooldowns. It does not refresh OAuth, log in, redeem quota, or issue inference requests. Query/catalog refresh is not a forced provider or token refresh; HTTP 401 requires native reauthentication.

The renderer does not read session transcripts or credential files. The recovery backend does access credentials as described above; this plugin does not claim to have no credential access. The collector stores identifiers, numeric usage, and bounded relationship metadata only—not conversation bodies, credentials, raw account IDs, or URLs. Its local database is `<profile-home>/plugin-data/limits-monitor/usage.db`; retention is indefinite until deliberate deletion. Disable both the Agent and Desktop halves before a deliberate backup or deletion. Plugin removal is not permission to lose this data. The collector does not include auxiliary/external calls, backfill history, or attribute quota percentages to conversations.

There is no daemon, cron job, telemetry, or automatic cleanup. The beta has not received upstream catalog approval or a security audit. Actual installation/runtime verification so far is Linux-only; other platforms are unverified. Plugin validation may flag private Hermes helper imports, and Hermes changes may require adapting recovery. Failed checks leave existing limits unchanged.

## Development and optional UI harness

Requires Node.js 22 or newer and an already-installed Hermes Python environment for backend tests; backend dependencies are not bundled. Frontend and backend tests use synthetic data and isolated stores; these commands are for maintainers:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
node --check desktop/plugin.js
python -m unittest discover -s tests -p 'test_reconcile.py' -v
```

The optional browser harness uses an isolated scratch Hermes home, already-installed Hermes Desktop dependencies, and already-installed Playwright/Chromium; none of these are bundled or installed by this repository. Set `USAGE_UI_BROWSER` only to select a specific installed browser executable.

Terminal 1:

```sh
SCRATCH="${TMPDIR:-/tmp}/limits-usage-ui"
mkdir -p "$SCRATCH/home" "$SCRATCH/hermes" "$SCRATCH/tmp"
HOME="$SCRATCH/home" HERMES_HOME="$SCRATCH/hermes" TMPDIR="$SCRATCH/tmp" python tests/usage_ui_harness/server.py
```

Terminal 2 (set the variable to the installed Hermes Desktop `node_modules` directory):

```sh
export HERMES_DESKTOP_NODE_MODULES="/path/to/hermes-desktop/node_modules"
USAGE_BRIDGE=http://127.0.0.1:<bridge-port> \
node "$HERMES_DESKTOP_NODE_MODULES/vite/bin/vite.js" --config tests/usage_ui_harness/vite.config.mjs --port 5173 --strictPort
```

Open `http://127.0.0.1:5173`, or run the browser checks in another terminal:

```sh
USAGE_UI_URL=http://127.0.0.1:5173 python tests/usage_ui_harness/browser_qa.py
USAGE_UI_URL=http://127.0.0.1:5173 python tests/usage_ui_harness/current_chat_qa.py
```

## Screenshot

![Upstream Hermes Limits panel](https://raw.githubusercontent.com/zzhan1q/hermes-limits-monitor/main/screenshots/limits-monitor.png)

_Upstream screenshot; profile label, quota percentages, and reset times are visible._

## License

MIT License; see [LICENSE](LICENSE). Original copyright and attribution are retained.
