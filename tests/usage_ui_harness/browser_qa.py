"""Optional real-browser checks against the isolated fixture RPC; never starts servers."""
import json
import os
from pathlib import Path
from tempfile import gettempdir
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get("USAGE_UI_URL", "http://127.0.0.1:5173")
BROWSER = os.environ.get("USAGE_UI_BROWSER")
OUTPUT = Path(os.environ.get("USAGE_UI_OUTPUT", str(Path(os.environ.get("TMPDIR") or gettempdir()) / "limits-usage-ui")))
OUTPUT.mkdir(parents=True, exist_ok=True)
CASES = []
def passed(name): CASES.append({"name": name, "passed": True})

def open_details_if_closed(summary):
    """Open the containing disclosure only when a remount left it closed."""
    details = summary.locator("xpath=ancestor::details[1]")
    if not details.evaluate("element => element.open"):
        summary.click()

with sync_playwright() as p:
    context = p.chromium.launch_persistent_context(str(OUTPUT / "chromium-profile"), executable_path=BROWSER, headless=True)
    page = context.new_page()
    try:
        page.goto(URL, wait_until="networkidle")
        expect(page.get_by_text("SYNTHETIC FIXTURE")).to_be_visible()
        section = page.locator('[data-usage-section]')
        expect(section).to_be_visible()
        section.locator(':scope > details > summary').click()
        parent_summary = section.locator('details details summary').filter(has_text="synthetic-conversation-a")
        expect(parent_summary).to_be_visible(timeout=10000)
        open_details_if_closed(parent_summary)
        body = section.inner_text()
        assert "보고된 토큰 소계: 40" in body, body
        assert "알려진 프롬프트: 30" in body and "알려진 출력: 10" in body, body
        assert "성공: 1" in body and "실패: 1" in body and "대기 중: 1" in body, body
        assert "완료" in body and "미측정" in body and "요청별 계정" in body, body
        assert "gpt-fixture" in body and "openai-codex" in body
        assert "synthetic-child-session" in body and "synthetic-child-request" not in body
        page.screenshot(path=str(OUTPUT / "usage-expanded.png"), full_page=True)
        passed("expanded usage content and privacy-bounded totals")
        relationship_summary = section.locator('details > summary').filter(has_text="세션 연결(메타데이터만)")
        open_details_if_closed(relationship_summary)
        relationship_details = relationship_summary.locator("xpath=..")
        expect(relationship_details.get_by_text("synthetic-session-a → synthetic-child-session (metadata only)")).to_be_visible()
        passed("relationship metadata")

        page.get_by_role("button", name="사용량 새로고침").click()
        expect(section.get_by_text("보고된 토큰 소계: 40")).to_be_visible(timeout=10000)
        page.get_by_role("button", name="Profile B (empty)").click()
        expect(section.get_by_text("관찰된 대화 사용량이 없습니다.")).to_be_visible(timeout=10000)
        assert "synthetic-conversation-a" not in section.inner_text()
        page.get_by_role("button", name="Profile A").click()
        expect(parent_summary).to_be_visible(timeout=10000)
        open_details_if_closed(parent_summary)
        page.get_by_role("button", name="Connection mismatch").click()
        expect(section.get_by_role("alert")).to_be_visible(timeout=10000)
        assert "synthetic-conversation-a" not in section.inner_text()
        passed("profile isolation and connection mismatch")

        page.get_by_role("button", name="Profile A").click()
        parent_summary = section.locator('details details summary').filter(has_text="synthetic-conversation-a")
        expect(parent_summary).to_be_visible(timeout=10000)
        open_details_if_closed(parent_summary)
        page.evaluate("window.__usageQA.control({delay_ms:3500,fail_usage:false})")
        page.get_by_role("button", name="사용량 새로고침").click()
        expect(section.get_by_role("status").filter(has_text="이전 조회 결과")).to_be_visible(timeout=4000)
        open_details_if_closed(parent_summary)
        expect(section.get_by_text("보고된 토큰 소계: 40")).to_be_visible(timeout=6000)
        page.evaluate("window.__usageQA.control({delay_ms:0,fail_usage:true})")
        page.wait_for_timeout(30500)
        expect(section.get_by_role("alert")).to_be_visible(timeout=5000)
        assert "보고된 토큰 소계: 40" not in section.inner_text()
        page.evaluate("window.__usageQA.control({delay_ms:0,fail_usage:false})")
        page.wait_for_timeout(30500)
        expect(section.get_by_role("alert")).to_have_count(0, timeout=5000)
        parent_summary = section.locator('details details summary').filter(has_text="synthetic-conversation-a")
        open_details_if_closed(parent_summary)
        expect(section.get_by_text("보고된 토큰 소계: 40")).to_be_visible()
        passed("30-second timer poll failure and recovery")

        status = page.locator('[data-limits-monitor="statusbar"]')
        expect(status).to_be_visible()
        assert "요청" not in status.inner_text() and "토큰" not in status.inner_text()
        passed("status bar has no token leakage")
    finally:
        # Keep visual evidence even when an assertion above fails.
        try: page.screenshot(path=str(OUTPUT / "usage-ui-final.png"), full_page=True)
        except Exception: pass
        (OUTPUT / "browser-results.json").write_text(json.dumps({"case_count": len(CASES), "cases": CASES}, ensure_ascii=False, indent=2))
        context.close()
print(json.dumps({"case_count": len(CASES), "cases": CASES}, ensure_ascii=False))
