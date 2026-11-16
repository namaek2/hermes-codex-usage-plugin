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
        expect(summary).to_contain_text("관찰된 요청: 3")
        expect(summary).to_contain_text("보고된 토큰 소계: 40")
        expect(summary).to_contain_text("알려진 프롬프트: 30")
        expect(summary).to_contain_text("알려진 출력: 10")

        # Focus becomes temporarily absent, then resolves to a durable session.
        page.evaluate("window.__usageQA.focus('', null, null)")
        expect(summary).to_contain_text("현재 대화 식별 정보를 확인할 수 없습니다")
        page.evaluate("window.__usageQA.focus('synthetic-session-a')")
        expect(summary).to_contain_text("관찰된 요청: 3", timeout=10000)
        assert not errors, errors

        # Focus ownership may differ from the pane's selected profile.
        page.evaluate("window.__usageQA.focus('synthetic-session-a', 'fixture-profile-b', 'fixture-connection-b')")
        expect(summary).to_contain_text("관찰된 대화 사용량이 없습니다", timeout=10000)
        assert page.evaluate("window.__usageQA.mainScope()") == {"profile":"fixture-profile-a","connection":"fixture-connection-a"}
        page.evaluate("window.__usageQA.focus('synthetic-session-a')")
        expect(summary).to_contain_text("관찰된 요청: 3", timeout=10000)

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
        expect(summary).to_contain_text("보고된 토큰 소계: 40", timeout=10000)
        before_missing = len(page.evaluate("window.__usageRpcCalls || []"))
        page.evaluate("window.__usageQA.focus('', null, null)")
        expect(summary).to_contain_text("현재 대화 식별 정보를 확인할 수 없습니다")
        before_disabled = len(page.evaluate("window.__usageRpcCalls || []"))
        assert before_disabled == before_missing, (before_missing, before_disabled)
        page.evaluate("window.__usageQA.focus('synthetic-session-a')")
        expect(summary).to_contain_text("보고된 토큰 소계: 40", timeout=10000)
        before_offline = len(page.evaluate("window.__usageRpcCalls || []"))
        page.evaluate("window.__usageQA.disconnect()")
        expect(summary).to_contain_text("Hermes 연결 중에만", timeout=5000)
        assert len(page.evaluate("window.__usageRpcCalls || []")) == before_offline
        page.evaluate("window.__usageQA.reconnect()")
        page.wait_for_function("(n) => (window.__usageRpcCalls || []).length > n", arg=before_offline)
        expect(summary).to_contain_text("보고된 토큰 소계: 40", timeout=10000)
        after = page.evaluate("window.__usageRpcCalls || []")
        assert len(after) > before_offline, (before_offline, after)
        assert len(calls_after_close) > 0
        assert not errors, errors
        print(json.dumps({"passed": ["real Radix popover and filtered totals", "focus ID transition", "owner route isolation", "closed/offline/unknown owner do not query"]}, ensure_ascii=False))
    finally:
        page.screenshot(path=str(OUT / "current-chat-final.png"), full_page=True)
        browser.close()
