#!/usr/bin/env python3
"""Toss 스타일 CourseBrief 라이브 스크린샷 + 콘솔 오류 수집"""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "https://coursebrief.pages.dev"
OUT = Path("/workspace/browser")
OUT.mkdir(parents=True, exist_ok=True)

shots = [
    # (파일명, url, viewport, color_scheme, theme_override, full_page)
    ("toss-desktop-list.png", "/?v=4", (1440, 950), "light", None, False),
    ("toss-mobile-list.png", "/?v=4", (390, 844), "light", None, False),
    ("toss-desktop-detail.png", "/#/c/kr-golf-0371", (1440, 950), "light", None, False),
    ("toss-mobile-detail.png", "/#/c/kr-golf-0371", (390, 844), "light", None, False),
    ("toss-dark-detail.png", "/#/c/kr-golf-0371", (1440, 950), "dark", None, False),
]


async def main():
    report = {"console": [], "pageerrors": [], "reqfailed": [], "checks": {}}
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for name, path, vp, scheme, theme, full in shots:
            ctx = await browser.new_context(
                viewport={"width": vp[0], "height": vp[1]},
                device_scale_factor=2 if vp[0] < 500 else 1,
                color_scheme=scheme,
                locale="ko-KR",
            )
            if theme:
                await ctx.add_init_script(
                    f"try{{localStorage.setItem('coursebrief-theme','{theme}')}}catch(e){{}}"
                )
            page = await ctx.new_page()
            page.on("console", lambda m, n=name: report["console"].append((n, m.type, m.text)) if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e, n=name: report["pageerrors"].append((n, str(e))))
            page.on("requestfailed", lambda r, n=name: report["reqfailed"].append((n, r.url, r.failure)))
            await page.goto(BASE + path, wait_until="networkidle", timeout=60000)
            await page.wait_for_timeout(1200)
            if "detail" in name:
                await page.wait_for_selector("#detail-title", timeout=20000)
                await page.wait_for_timeout(800)
            else:
                await page.wait_for_selector(".card", timeout=20000)
            info = await page.evaluate(
                """() => {
                    const cs = getComputedStyle(document.body);
                    const sec = document.querySelector('.section');
                    return {
                      bg: cs.backgroundColor,
                      font: cs.fontFamily,
                      cards: document.querySelectorAll('.card').length,
                      sections: document.querySelectorAll('.section').length,
                      noticeRows: document.querySelectorAll('.notice-list li').length,
                      tiles: document.querySelectorAll('.tile').length,
                      secBadge: !!document.querySelector('.section h2 .ic-tile'),
                      h2: (document.querySelector('.section h2')||{}).textContent,
                      docW: document.documentElement.scrollWidth,
                      winW: innerWidth,
                      sectionBg: sec ? getComputedStyle(sec).backgroundColor : null,
                    };
                }"""
            )
            report["checks"][name] = info
            await page.screenshot(path=str(OUT / name), full_page=full)
            print(name, json.dumps(info, ensure_ascii=False))
            await ctx.close()
        await browser.close()
    print("CONSOLE", json.dumps(report["console"], ensure_ascii=False)[:1500])
    print("PAGEERRORS", json.dumps(report["pageerrors"], ensure_ascii=False)[:800])
    print("REQFAILED", json.dumps(report["reqfailed"], ensure_ascii=False)[:800])

asyncio.run(main())
