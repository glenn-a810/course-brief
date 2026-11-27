#!/usr/bin/env python3
"""로컬 dist QA 스크린샷 (배포 전 확인용)"""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8099"
OUT = Path("/workspace/browser")
OUT.mkdir(parents=True, exist_ok=True)

shots = [
    ("qa-desktop-list.png", "/", (1440, 950), "light", None, False),
    ("qa-mobile-list.png", "/", (390, 844), "light", None, False),
    ("qa-desktop-detail-top.png", "/#/c/kr-golf-0371", (1440, 950), "light", None, False),
    ("qa-desktop-detail-full.png", "/#/c/kr-golf-0371", (1440, 1200), "light", None, True),
    ("qa-mobile-detail-full.png", "/#/c/kr-golf-0371", (390, 844), "light", None, True),
    ("qa-desktop-rental.png", "/#/rental", (1440, 950), "light", None, False),
    ("qa-desktop-about.png", "/#/about", (1440, 950), "light", None, False),
    ("qa-dark-list.png", "/", (1440, 950), "dark", None, False),
    ("qa-mobile-rental.png", "/#/rental", (390, 844), "light", None, False),
]

async def main():
    errs = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for name, path, vp, scheme, theme, full in shots:
            ctx = await browser.new_context(viewport={"width": vp[0], "height": vp[1]},
                                            device_scale_factor=2 if vp[0] < 500 else 1,
                                            color_scheme=scheme, locale="ko-KR")
            page = await ctx.new_page()
            page.on("console", lambda m, n=name: errs.append((n, m.type, m.text)) if m.type == "error" else None)
            page.on("pageerror", lambda e, n=name: errs.append((n, "pageerror", str(e))))
            await page.goto(BASE + path, wait_until="networkidle", timeout=60000)
            await page.wait_for_timeout(1000)
            if "detail" in name:
                await page.wait_for_selector("#detail-title", timeout=20000)
            elif "rental" in name:
                await page.wait_for_selector(".rental-card", timeout=20000)
            elif "about" in name:
                await page.wait_for_selector(".area-card", timeout=20000)
            else:
                await page.wait_for_selector("#view-list:not([hidden]) .card:not(.card-skel)", timeout=20000)
            await page.wait_for_timeout(600)
            await page.screenshot(path=str(OUT / name), full_page=full)
            print("shot", name)
            await ctx.close()
        await browser.close()
    print("ERRORS", json.dumps(errs, ensure_ascii=False)[:1000])

asyncio.run(main())
