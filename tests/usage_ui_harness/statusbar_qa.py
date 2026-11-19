"""Playwright checks for status presentation using only synthetic loopback fixture data."""
import hashlib
import json
import os
from pathlib import Path
from tempfile import gettempdir
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get("USAGE_UI_URL", "http://127.0.0.1:5173")
BROWSER = os.environ.get("USAGE_UI_BROWSER")
OUT = Path(os.environ.get("USAGE_UI_OUTPUT", str(Path(os.environ.get("TMPDIR") or gettempdir()) / "limits-statusbar")))
OUT.mkdir(parents=True, exist_ok=True)
CASES = []
def passed(name): CASES.append({"name": name, "passed": True})

with sync_playwright() as p:
  browser = p.chromium.launch(executable_path=BROWSER, headless=True)
  context = browser.new_context()
  page = context.new_page()
  page_errors = []
  page.on("pageerror", lambda error: page_errors.append(str(error)))
  profile_key = json.dumps(["fixture-connection-a", "fixture-profile-a"], separators=(",", ":"))
  identities = ["synthetic-account-email", "synthetic-account-zero"]
  pins = [hashlib.sha256(json.dumps([profile_key, "openai-codex", identity, 0], separators=(",", ":")).encode()).hexdigest()
          for identity in identities]
  legacy_preferences = {"hidden": [pins[1]], "maskEmails": False, "statusBarDisplay": "graph"}
  seed = json.dumps({"presentation": legacy_preferences}, separators=(",", ":"))
  context.add_init_script(f"if (!sessionStorage.getItem('__limits-statusbar-seeded')) {{ localStorage.setItem('limits-monitor-presentation', {json.dumps(seed)}); sessionStorage.setItem('__limits-statusbar-seeded', '1'); }}")
  try:
    page.goto(URL, wait_until="networkidle")
    expect(page.get_by_text("SYNTHETIC FIXTURE")).to_be_visible()
    status = page.locator('[data-limits-monitor="statusbar"]')
    expect(status).to_be_visible()
    expect(status).to_contain_text("s…@…")
    expect(status).not_to_contain_text("Synthetic zero")
    expect(status).not_to_contain_text("synthetic.user@example.invalid")
    assert status.get_attribute("title") is None
    assert status.locator("[data-limits-account='chip']").count() == 1
    status.click()
    dialog = page.get_by_role("dialog")
    expect(dialog).to_be_visible()
    expect(dialog.locator(":scope > div").first).to_contain_text("최근 조회 · Hermes 카탈로그")
    expect(dialog.locator("[data-current-chat-usage]")).to_contain_text("API 요청 수")
    expect(dialog.locator("[data-current-chat-usage]")).to_contain_text("보고된 토큰 소계")
    expect(dialog.locator("[data-current-chat-usage]")).to_contain_text("구독 한도 %가 아닙니다")
    expect(dialog).to_contain_text("Synthetic zero")
    expect(dialog).to_contain_text("s…@…")
    expect(dialog).not_to_contain_text("synthetic.user@example.invalid")
    expect(dialog).not_to_contain_text("데이터 최신성 및 범위")
    expect(dialog).not_to_contain_text("Data freshness and scope")
    for obsolete in ("이메일 가리기", "모든 계정 표시"):
      expect(dialog.get_by_text(obsolete, exact=True)).to_have_count(0)
    expect(dialog.get_by_role("button", name="모든 계정 표시")).to_have_count(0)
    shape_group = dialog.get_by_role("group", name="표시 모양")
    expect(shape_group.get_by_role("checkbox")).to_have_count(3)
    expect(dialog.get_by_role("checkbox")).to_have_count(5)
    expect(dialog.get_by_text("표시 모양", exact=True)).to_be_visible()
    email_selector = dialog.get_by_role("checkbox", name="상태바에 표시: Codex s…@…")
    zero_selector = dialog.get_by_role("checkbox", name="상태바에 표시: Codex Synthetic zero")
    expect(email_selector).to_be_checked()
    expect(zero_selector).not_to_be_checked()
    expect(dialog).to_contain_text("s…@…")
    expect(dialog).to_contain_text("Synthetic zero")
    passed("saved account selection hides one chip while both account rows remain visible and masked")

    percent = shape_group.get_by_role("checkbox", name="퍼센트")
    bar = shape_group.get_by_role("checkbox", name="막대 그래프")
    circle = shape_group.get_by_role("checkbox", name="원형 그래프")
    expect(percent).not_to_be_checked()
    expect(bar).to_be_checked()
    expect(circle).not_to_be_checked()
    expect(status.get_by_role("progressbar")).to_have_count(1)
    bar_label = dialog.get_by_text("막대 그래프", exact=True)
    bar_label.click()
    expect(bar).to_be_checked()
    expect(percent).not_to_be_checked()
    bar_label.click()
    expect(bar).to_be_checked()
    expect(percent).not_to_be_checked()
    expect(circle).not_to_be_checked()
    expect(status.get_by_role("progressbar")).to_have_attribute("aria-valuenow", "80")
    expect(status.get_by_role("progressbar")).to_have_attribute("aria-valuetext", "80% 남음")
    passed("label pointer selects bar and selected checkbox cannot be cleared")

    circle.focus()
    page.keyboard.press("Space")
    expect(circle).to_be_checked()
    expect(percent).not_to_be_checked()
    expect(bar).not_to_be_checked()
    gauge = status.locator("svg[role='progressbar']")
    expect(gauge).to_have_count(1)
    expect(gauge).to_have_attribute("aria-valuemin", "0")
    expect(gauge).to_have_attribute("aria-valuemax", "100")
    expect(gauge).to_have_attribute("aria-valuenow", "80")
    expect(gauge).to_have_attribute("aria-valuetext", "80% 남음")
    expect(gauge.locator("circle")).to_have_count(2)
    expect(gauge.locator("circle").nth(1)).to_have_attribute("pathLength", "100")
    persisted = page.evaluate("JSON.parse(localStorage.getItem('limits-monitor-presentation')).presentation")
    assert persisted == {"hidden": [pins[1]], "statusBarDisplay": "circle"}, persisted
    passed("Space selects the SVG circle without resetting the hidden account choice")

    page.reload(wait_until="networkidle")
    status = page.locator('[data-limits-monitor="statusbar"]')
    status.click()
    dialog = page.get_by_role("dialog")
    shape_group = dialog.get_by_role("group", name="표시 모양")
    circle = shape_group.get_by_role("checkbox", name="원형 그래프")
    expect(circle).to_be_checked()
    expect(shape_group.get_by_role("checkbox")).to_have_count(3)
    expect(dialog.get_by_role("checkbox")).to_have_count(5)
    expect(status.locator("svg[role='progressbar']")).to_have_count(1)
    email_selector = dialog.get_by_role("checkbox", name="상태바에 표시: Codex s…@…")
    zero_selector = dialog.get_by_role("checkbox", name="상태바에 표시: Codex Synthetic zero")
    expect(email_selector).to_be_checked()
    expect(zero_selector).not_to_be_checked()
    persisted = page.evaluate("JSON.parse(localStorage.getItem('limits-monitor-presentation')).presentation")
    assert persisted == {"hidden": [pins[1]], "statusBarDisplay": "circle"}, persisted
    passed("circle shape and account selection survive same-context reload")

    zero_selector.click()
    expect(zero_selector).to_be_checked()
    expect(status.locator("[data-limits-account='chip']")).to_have_count(2)
    expect(status).to_contain_text("Synthetic zero")
    zero_selector.focus()
    page.keyboard.press("Space")
    expect(zero_selector).not_to_be_checked()
    expect(status.locator("[data-limits-account='chip']")).to_have_count(1)
    expect(status).not_to_contain_text("Synthetic zero")
    passed("pointer and Space hide/show an account chip without removing its row")

    email_selector.focus()
    page.keyboard.press("Space")
    expect(email_selector).not_to_be_checked()
    expect(status.locator("[data-limits-account='chip']")).to_have_count(0)
    expect(status).to_be_visible()
    expect(status).to_contain_text("표시 중인 계정 없음")
    expect(dialog).to_be_visible()
    expect(dialog.get_by_role("checkbox")).to_have_count(5)
    expect(dialog).to_contain_text("s…@…")
    expect(dialog).to_contain_text("Synthetic zero")
    email_selector.focus()
    page.keyboard.press("Space")
    expect(email_selector).to_be_checked()
    expect(status.locator("[data-limits-account='chip']")).to_have_count(1)
    zero_selector.click()
    expect(zero_selector).to_be_checked()
    expect(status.locator("[data-limits-account='chip']")).to_have_count(2)
    passed("all-hidden status bar remains usable and account chips can be recovered")

    page.evaluate("window.__usageQA.disconnect()")
    expect(status.get_by_role("progressbar")).to_have_count(0)
    expect(status).to_contain_text("—")
    page.evaluate("window.__usageQA.reconnect()")
    page.evaluate("window.__usageQA.control({fail_catalog:true})")
    dialog.get_by_role("button", name="새로고침").click()
    stale_warnings = dialog.get_by_role("status").filter(has_text="이전 데이터 — 다시 확인해야 합니다.")
    expect(stale_warnings).to_have_count(2, timeout=10000)
    for index in range(2):
      expect(stale_warnings.nth(index)).to_be_visible()
    expect(status.get_by_role("progressbar")).to_have_count(0)
    expect(status).to_contain_text("—")
    pane = page.locator('[data-limits-monitor="pane"]')
    catalog_error = pane.get_by_role("status").filter(has_text="fixture-profile-a: 프로필 한도 조회 실패")
    expect(catalog_error).to_be_visible(timeout=10000)
    passed("offline and failed catalog reads suppress cached graph values and show scoped warnings")

    page.evaluate("window.__usageQA.control({fail_catalog:false})")
    dialog.get_by_role("button", name="새로고침").click()
    expect(status.locator("svg[role='progressbar']")).to_have_count(1, timeout=10000)
    expect(stale_warnings).to_have_count(0)
    expect(catalog_error).to_have_count(0)
    expect(dialog.get_by_role("checkbox", name="원형 그래프")).to_be_checked()
    assert not page_errors, page_errors
    passed("recovered catalog restores the circle and keeps choices visible")
  finally:
    try:
      page.evaluate("window.__usageQA.reconnect(); window.__usageQA.control({fail_catalog:false, delay_ms:0})")
    except Exception:
      pass
    try:
      if page.locator('[data-limits-monitor="statusbar"]').is_visible() and not page.get_by_role("dialog").is_visible():
        page.locator('[data-limits-monitor="statusbar"]').click()
      page.screenshot(path=str(OUT / "statusbar-final.png"), full_page=True)
    except Exception:
      pass
    (OUT / "statusbar-results.json").write_text(json.dumps({"case_count":len(CASES),"cases":CASES,"page_errors":page_errors}, ensure_ascii=False, indent=2))
    context.close()
    browser.close()
print(json.dumps({"case_count":len(CASES),"cases":CASES}, ensure_ascii=False))
