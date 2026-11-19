"""Fast current-chat popover checks against the running isolated fixture."""
import json
import os
from pathlib import Path
from tempfile import gettempdir
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get("USAGE_UI_URL", "http://127.0.0.1:5173")
BROWSER = os.environ.get("USAGE_UI_BROWSER")

OUT = Path(os.environ.get("USAGE_UI_OUTPUT", str(Path(os.environ.get("TMPDIR") or gettempdir()) / "limits-current-chat")))
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=BROWSER, headless=True)
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        page.goto(URL, wait_until="networkidle")
        expect(page.get_by_text("SYNTHETIC FIXTURE")).to_be_visible()
        main_profile = page.locator("[data-usage-section]")
        expect(main_profile).to_be_visible()
        chip = page.locator('[data-limits-monitor="statusbar"]')
        assert page.evaluate("window.__usageRpcCalls || []") == []
        chip.click()
        summary = page.locator("[data-current-chat-usage]")
        expect(summary).to_be_visible()
        for label, value in [("API 요청 수", "3"), ("보고된 토큰 소계", "40"),
                             ("확인된 입력 / 프롬프트 토큰", "30"), ("확인된 출력 토큰", "10")]:
            metric = summary.locator(f'[data-usage-metric="{label}"]')
            expect(metric).to_be_visible()
            expect(metric.locator("strong")).to_have_text(value)

        # Focus becomes temporarily absent, then resolves to a durable session.
        page.evaluate("window.__usageQA.focus('', null, null)")
        expect(summary).to_contain_text("선택된 대화를 확인할 수 없습니다")
        page.evaluate("window.__usageQA.focus('synthetic-session-a')")
        expect(summary.locator('[data-usage-metric="API 요청 수"] strong')).to_have_text("3", timeout=10000)
        assert not errors, errors

        # Focus ownership may differ from the pane's selected profile.
        page.evaluate("window.__usageQA.focus('synthetic-session-a', 'fixture-profile-b', 'fixture-connection-b')")
        expect(summary).to_contain_text("이 대화에 보고된 사용량이 아직 없습니다", timeout=10000)
        assert page.evaluate("window.__usageQA.mainScope()") == {"profile":"fixture-profile-a","connection":"fixture-connection-a"}
        page.evaluate("window.__usageQA.focus('synthetic-session-a')")
        expect(summary.locator('[data-usage-metric="API 요청 수"] strong')).to_have_text("3", timeout=10000)

        calls = page.evaluate("window.__usageRpcCalls || []")
        assert calls and all(call.get("session_id") == "synthetic-session-a" for call in calls), calls
        assert any(call.get("profile") == "fixture-profile-b" and call.get("connection") == "fixture-connection-b" for call in calls), calls

        # Close/reopen the real controlled popover, then verify disabled scopes.
        calls_before_close = page.evaluate("window.__usageRpcCalls || []")
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        expect(summary).to_have_count(0)
        calls_after_close = page.evaluate("window.__usageRpcCalls || []")
        assert len(calls_after_close) == len(calls_before_close), (calls_before_close, calls_after_close)
        page.locator('[data-limits-monitor="statusbar"]').click()
        expect(summary.locator('[data-usage-metric="보고된 토큰 소계"] strong')).to_have_text("40", timeout=10000)
        before_missing = len(page.evaluate("window.__usageRpcCalls || []"))
        page.evaluate("window.__usageQA.focus('', null, null)")
        expect(summary).to_contain_text("선택된 대화를 확인할 수 없습니다")
        before_disabled = len(page.evaluate("window.__usageRpcCalls || []"))
        assert before_disabled == before_missing, (before_missing, before_disabled)
        page.evaluate("window.__usageQA.focus('synthetic-session-a')")
        expect(summary.locator('[data-usage-metric="보고된 토큰 소계"] strong')).to_have_text("40", timeout=10000)
        before_offline = len(page.evaluate("window.__usageRpcCalls || []"))
        page.evaluate("window.__usageQA.disconnect()")
        expect(summary).to_contain_text("Hermes 연결 중에만", timeout=5000)
        assert len(page.evaluate("window.__usageRpcCalls || []")) == before_offline
        page.evaluate("window.__usageQA.reconnect()")
        page.wait_for_function("(n) => (window.__usageRpcCalls || []).length > n", arg=before_offline)
        expect(summary.locator('[data-usage-metric="보고된 토큰 소계"] strong')).to_have_text("40", timeout=10000)
        after = page.evaluate("window.__usageRpcCalls || []")
        assert len(after) > before_offline, (before_offline, after)
        assert len(calls_after_close) > 0
        assert not errors, errors
        print(json.dumps({"passed": ["real Radix popover and filtered totals", "focus ID transition", "owner route isolation", "closed/offline/unknown owner do not query"]}, ensure_ascii=False))
    finally:
        try:
            page.evaluate("window.__usageQA.reconnect(); window.__usageQA.control({fail_usage:false, delay_ms:0})")
        except Exception:
            pass
        try: page.screenshot(path=str(OUT / "current-chat-final.png"), full_page=True)
        except Exception: pass
        browser.close()
