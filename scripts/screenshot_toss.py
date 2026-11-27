#!/usr/bin/env python3
"""Toss 스타일 CourseBrief 라이브 스크린샷 + 콘솔/DOM 검증"""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://coursebrief.pages.dev"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("browser")
OUT.mkdir(parents=True, exist_ok=True)
V = "?v=11"

shots = [
    ("toss-desktop-list.png", f"/{V}", (1440, 950), "light", False),
    ("toss-mobile-list.png", f"/{V}", (390, 844), "light", False),
    ("toss-desktop-detail.png", "/#/c/kr-golf-0371", (1440, 950), "light", False),
    ("toss-mobile-detail.png", "/#/c/kr-golf-0371", (390, 844), "light", False),
    ("toss-dark-detail.png", "/#/c/kr-golf-0371", (1440, 950), "dark", False),
]

# 공지 복구 확인 대상 18곳
NOTICE_CHECK = [
    "kr-golf-0052", "kr-golf-0075", "kr-golf-0249", "kr-golf-0261", "kr-golf-0290",
    "kr-golf-0356", "kr-golf-0358", "kr-golf-0371", "kr-golf-0375", "kr-golf-0380",
    "kr-golf-0454", "kr-golf-0456", "kr-golf-0457", "kr-golf-0458", "kr-golf-0459",
    "kr-golf-0460", "kr-golf-0461", "kr-golf-0507",
]

async def main():
    report = {"console": [], "pageerrors": [], "reqfailed": [], "checks": {}, "notices": {}}
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for name, path, vp, scheme, full in shots:
            ctx = await browser.new_context(
                viewport={"width": vp[0], "height": vp[1]},
                device_scale_factor=2 if vp[0] < 500 else 1,
                color_scheme=scheme, locale="ko-KR",
            )
            page = await ctx.new_page()
            page.on("console", lambda m, n=name: report["console"].append((n, m.type, m.text)) if m.type == "error" else None)
            page.on("pageerror", lambda e, n=name: report["pageerrors"].append((n, str(e))))
            page.on("requestfailed", lambda r, n=name: report["reqfailed"].append((n, r.url, str(r.failure))))
            await page.goto(BASE + path, wait_until="networkidle", timeout=60000)
            await page.wait_for_timeout(1200)
            if "detail" in name:
                await page.wait_for_selector("#detail-title", timeout=20000)
            else:
                await page.wait_for_selector("#view-list:not([hidden]) .card:not(.card-skel)", timeout=20000)
            await page.wait_for_timeout(600)
            info = await page.evaluate("""() => {
                const cs = getComputedStyle(document.body);
                return {
                  bg: cs.backgroundColor,
                  font: cs.fontFamily.split(',')[0],
                  cards: document.querySelectorAll('.card:not(.card-skel)').length,
                  sections: document.querySelectorAll('.section').length,
                  noticeRows: document.querySelectorAll('.notice-list li').length,
                  tiles: document.querySelectorAll('.tile').length,
                  hScroll: document.documentElement.scrollWidth > innerWidth,
                };
            }""")
            report["checks"][name] = info
            await page.screenshot(path=str(OUT / name), full_page=full)
            print(name, json.dumps(info, ensure_ascii=False))
            await ctx.close()

        # 공지 복구 확인 — 18곳 상세에서 공지 행이 그려지는지
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        page = await ctx.new_page()
        page.on("console", lambda m: report["console"].append(("notice-scan", m.type, m.text)) if m.type == "error" else None)
        page.on("pageerror", lambda e: report["pageerrors"].append(("notice-scan", str(e))))
        await page.goto(BASE + "/" + V, wait_until="networkidle", timeout=60000)
        for cid in NOTICE_CHECK:
            await page.goto(BASE + "/#/c/" + cid, wait_until="networkidle", timeout=60000)
            await page.wait_for_selector("#s5", timeout=20000)
            n = await page.evaluate("document.querySelectorAll('#s5 .notice-list li').length")
            title = await page.evaluate("document.querySelector('#detail-title').textContent.trim()")
            report["notices"][cid] = {"name": title, "rows": n}
            print("notice", cid, title, n)
        await ctx.close()
        await browser.close()
    print("CONSOLE", json.dumps(report["console"], ensure_ascii=False)[:1200])
    print("PAGEERRORS", json.dumps(report["pageerrors"], ensure_ascii=False)[:600])
    print("REQFAILED", json.dumps(report["reqfailed"], ensure_ascii=False)[:600])
    missing = [k for k, v in report["notices"].items() if v["rows"] < 1]
    print("NOTICE_MISSING", missing)

asyncio.run(main())
