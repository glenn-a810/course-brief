#!/usr/bin/env python3
"""
PWA 아이콘·공유 미리보기(OG) 이미지 생성 — 한 번 돌리고 산출물을 저장소에 둔다.

왜 빌드에 넣지 않는가
  Cloudflare Pages 빌드 환경에는 Python 과 한글 폰트가 보장되지 않는다. PNG 541장을
  매 배포마다 다시 만드는 것도 낭비다. 그래서 `web/icons/*.png`, `web/og/*.png` 를
  여기서 만들어 커밋하고, `npm run build` 는 web/ 를 그대로 복사만 한다.

다시 만들 때
  python3 scripts/gen-pwa-assets.py          # 아이콘 + OG 전체
  python3 scripts/gen-pwa-assets.py --icons  # 아이콘만
  (한글 폰트가 없으면 시스템에서 CJK 폰트를 찾아 쓴다)

OG 규격: 1200×630 PNG(카카오톡·슬랙·X 공통). 색은 사이트 토큰과 같은 값만 쓴다.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "data/v29/index.json"
ICONS = ROOT / "web/icons"
OG = ROOT / "web/og"

FONT_CANDIDATES = [
    "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf",
    "/usr/share/fonts/opentype/noto/NotoSansCJKkr-Regular.otf",
    "/usr/share/fonts/truetype/noto/NotoSansCJKkr-Regular.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
]

# 사이트 토큰(style.css)과 같은 값
BG = "#f2f4f6"
SURFACE = "#ffffff"
TEXT = "#191f28"
TEXT2 = "#4e5968"
TEXT3 = "#8b95a1"
LINE = "#e5e8eb"
ACCENT = "#3182f6"
INSET = "#f2f4f6"


def font(size: int, path: str | None) -> ImageFont.FreeTypeFont:
    if not path:
        raise SystemExit("한글 폰트를 찾지 못했습니다. FONT_CANDIDATES 를 확인하세요.")
    return ImageFont.truetype(path, size)


def find_font() -> str | None:
    for p in FONT_CANDIDATES:
        if Path(p).exists():
            return p
    return None


def draw_text(draw, xy, text, f, fill, stroke=0, stroke_fill=None):
    """stroke_width 로 굵기를 흉내 낸다(저장소 환경에 Bold 파일이 없다)."""
    draw.text(xy, text, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill or fill)


def wrap(draw, text, f, max_w):
    """공백 기준 줄바꿈. 한 단어가 폭을 넘으면 글자 단위로 자른다."""
    words = text.split(" ")
    lines, cur = [], ""
    for w in words:
        cand = f"{cur} {w}".strip()
        if draw.textlength(cand, font=f) <= max_w:
            cur = cand
            continue
        if cur:
            lines.append(cur)
        if draw.textlength(w, font=f) <= max_w:
            cur = w
        else:
            buf = ""
            for ch in w:
                if draw.textlength(buf + ch, font=f) <= max_w:
                    buf += ch
                else:
                    lines.append(buf)
                    buf = ch
            cur = buf
    if cur:
        lines.append(cur)
    return lines


def won(v):
    if not isinstance(v, (int, float)):
        return ""
    return f"{int(round(v)):,}원"


def rounded(draw, box, r, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def draw_brand_mark(draw, x, y, size, bg, fg="#ffffff"):
    rounded(draw, (x, y, x + size, y + size), int(size * 0.3), bg)
    # 'C' — 원의 오른쪽을 연 호
    pad = size * 0.26
    box = (x + pad, y + pad, x + size - pad, y + size - pad)
    draw.arc(box, start=42, end=318, fill=fg, width=max(4, int(size * 0.115)))


def og_card(title, meta, fees, fpath, out: Path):
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    rounded(d, (36, 36, W - 36, H - 36), 38, SURFACE)
    draw_brand_mark(d, 84, 78, 64, ACCENT)

    f_brand = font(30, fpath)
    draw_text(d, (168, 82), "CourseBrief", f_brand, TEXT, stroke=1, stroke_fill=TEXT)
    draw_text(d, (169, 120), "코스브리프 · 전국 골프장 실전 브리핑", font(20, fpath), TEXT3)

    # 구장명 — 길면 폰트를 줄이고, 그래도 넘치면 두 줄까지
    size = 76 if len(title) <= 14 else 66 if len(title) <= 18 else 56
    f_name = font(size, fpath)
    lines = wrap(d, title, f_name, W - 200)[:2]
    y = 232
    for line in lines:
        draw_text(d, (84, y), line, f_name, TEXT, stroke=1, stroke_fill=TEXT)
        y += int(size * 1.22)

    if meta:
        draw_text(d, (86, y + 8), meta, font(30, fpath), TEXT2)
        y += 56

    # 그린피 칩
    px, py = 84, 470
    f_chip = font(28, fpath)
    chips = [c for c in fees if c] or ["그린피 확인 중 · 전화 문의"]
    for chip in chips:
        w = int(d.textlength(chip, font=f_chip)) + 44
        rounded(d, (px, py, px + w, py + 62), 16, INSET)
        draw_text(d, (px + 22, py + 14), chip, f_chip, TEXT)
        px += w + 12

    draw_text(d, (84, H - 92), "coursebrief.pages.dev", font(22, fpath), TEXT3)
    tail = "전국 540곳 · 7개 영역 정리"
    tw = d.textlength(tail, font=font(22, fpath))
    draw_text(d, (W - 84 - tw, H - 92), tail, font(22, fpath), TEXT3)

    # 8비트 팔레트로 줄여 540장을 합쳐도 저장소·배포가 무거워지지 않게
    img = img.convert("P", palette=Image.ADAPTIVE, colors=128)
    img.save(out, optimize=True)


def icon(size: int, out: Path, fpath: str | None, maskable: bool = False):
    """앱 아이콘 — OG 카드의 브랜드 마크와 같은 모양(흰 C + 브랜드 블루)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        # 마스크(원·스쿼클) 어느 모양으로 잘려도 로고가 살아 있도록 안전 영역(80%) 안에 C 를 둔다
        d.rectangle((0, 0, size, size), fill=ACCENT)
        glyph = size * 0.5
    else:
        rounded(d, (0, 0, size, size), int(size * 0.235), ACCENT)
        glyph = size * 0.62
    sw = max(2, int(size * 0.014))
    f = font(int(glyph * 1.45), fpath)
    l, t, r, b = d.textbbox((0, 0), "C", font=f, stroke_width=sw)
    d.text(((size - (r - l)) / 2 - l, (size - (b - t)) / 2 - t), "C", font=f, fill="#ffffff", stroke_width=sw, stroke_fill="#ffffff")
    img.save(out, optimize=True)


def main():
    only_icons = "--icons" in sys.argv
    ICONS.mkdir(parents=True, exist_ok=True)
    OG.mkdir(parents=True, exist_ok=True)
    fpath = find_font()

    icon(192, ICONS / "icon-192.png", fpath)
    icon(512, ICONS / "icon-512.png", fpath)
    icon(512, ICONS / "maskable-512.png", fpath, maskable=True)
    icon(180, ICONS / "apple-touch-icon.png", fpath)
    print("icons: 4장")

    if only_icons:
        return

    og_card(
        "전국 540개 골프장",
        "코스 스펙 · 그린피 · 예약 규칙 · 현장 운영 · 위치·교통",
        [],
        fpath,
        OG / "cover.png",
    )

    idx = json.loads(INDEX.read_text())
    n = 0
    for c in idx["courses"]:
        region = " ".join(x for x in [c.get("sido"), c.get("sigungu")] if x)
        meta = " · ".join(
            x for x in [region, f"{c['holes']}홀" if c.get("holes") else "", c.get("type") if c.get("type") != "미확인" else ""] if x
        )
        fee = c.get("green_fee") or {}
        fees = []
        if fee.get("weekday"):
            fees.append(f"주중 {won(fee['weekday'])}")
        if fee.get("weekend"):
            fees.append(f"주말 {won(fee['weekend'])}")
        og_card(c["name"], meta, fees, fpath, OG / f"{c['id']}.png")
        n += 1
    print(f"og: cover + {n}장")


if __name__ == "__main__":
    main()
