#!/usr/bin/env python3
"""CourseBrief — 상세 화면 노출 텍스트 무결성 전수 점검(2026-11-28 가독성 패스 기준).

점검 항목
  1) 내부 정정 메모(v2.x 정정/정리) 노출
  2) 수집 출처·확인일 메타(YYYY-MM-DD 확인/기준, 채널 브랜드명) 노출
  3) '코스 구성' 값이 구분자 없이 붙어 있는 경우(예: MAPLEPINEBIRCH, 동코스서코스남코스)
  4) 플레이스홀더(`문구 확인(원문 근거)`, `official` 코드) 노출
  5) 타일 라벨-값 중복(`연습장 → 연습장`, `프로샵 → 프로샵`)

사용
  python3 scripts/check_visible_text_2026_11_28.py            # 사람이 읽는 요약
  python3 scripts/check_visible_text_2026_11_28.py --json     # 건수만 JSON
"""
from __future__ import annotations

import glob
import json
import re
import sys

MEMO = re.compile(r"v2\.\d+\s*(?:정정|정리)")
META = re.compile(r"\d{4}-\d{2}(?:-\d{2})?\s*(?:재)?(?:확인|기준)|티픽|카카오골프예약|스마트스코어|그린피가이드")
UPPER_CONCAT = re.compile(r"^[A-Z]{8,}$")
PLACEHOLDER = re.compile(r"문구 확인|원문 근거|값 없음|placeholder", re.I)

# app.ts 의 OPS / FAC 라벨
LABELS = {
    "ops": {"nocaddie": "노캐디", "two_player": "2인 플레이", "three_player": "3인 플레이",
            "five_player": "5인 플레이", "marshal_caddie": "마샬 캐디", "cart_type": "카트 종류",
            "cart_entry": "카트 페어웨이 진입", "bagdrop": "셀프 백드롭", "mat": "매트 티샷",
            "checkin": "체크인", "locker": "락카", "sauna": "사우나", "dress": "복장 규정",
            "pace": "진행 속도"},
    "facilities": {"practice": "연습장", "indoor_range": "실내 연습장", "food": "식당·조식",
                   "snack_bar": "그늘집·스낵", "locker_sauna": "락카·사우나", "lodging": "숙박",
                   "other": "기타 시설", "night": "야간 라운드", "closed_days": "휴장일",
                   "shuttle": "셔틀·교통", "ev_charge": "전기차 충전", "proshop": "프로샵"},
}


def compact(s: str) -> str:
    return re.sub(r"[\s·]", "", s)

# 화면에 그대로 나가는 텍스트 필드
TEXT_FIELDS = (
    "fee.weekday_text", "fee.weekend_text", "fee.note", "fee.basis",
    "fee.cart.note", "fee.cart.text", "fee.caddie.note", "fee.caddie.text",
    "cancel.open_cycle", "cancel.notes", "cancel.cancel_policy", "cancel.cancel_policy.value",
    "course.course_names",
)


def get(obj, path):
    cur = obj
    for k in path.split("."):
        if isinstance(cur, dict) and k in cur:
            cur = cur[k]
        else:
            return None
    return cur


def walk_values(obj, prefix=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk_values(v, f"{prefix}.{k}" if prefix else k)
    elif isinstance(obj, str):
        yield prefix, obj


def splittable(block: str, names: set[str]) -> bool:
    """구분자 없이 붙은 코스명을 알려진 코스명 조각으로 나눌 수 있는지."""
    if not block or " " in block or "·" in block or "(" in block:
        return False
    tokens = sorted((n for n in names if n and n != block and block.startswith(n)), key=len, reverse=True)
    if not tokens:
        return False

    def rec(rest: str, depth: int) -> bool:
        if not rest:
            return depth >= 2
        for n in tokens:
            if rest.startswith(n) and rec(rest[len(n):], depth + 1):
                return True
        return False

    return rec(block, 0)


def main() -> int:
    memo, meta, concat, placeholder, dup = [], [], [], [], []
    files = sorted(glob.glob("data/v29/courses/*.json"))
    for f in files:
        d = json.load(open(f, encoding="utf-8"))
        cid = d["course_id"]

        texts = list(TEXT_FIELDS)
        for sec in ("ops", "facilities"):
            for key, val in (d.get(sec) or {}).items():
                if isinstance(val, dict):
                    for leaf in ("value", "text"):
                        if isinstance(val.get(leaf), str):
                            texts.append(f"{sec}.{key}.{leaf}")
        # 브리핑 노출 필드
        br = d.get("briefing") or {}
        texts += ["briefing.recent_notice_text", "briefing.course_notes",
                  "briefing.alert.summary", "briefing.alert.detail", "briefing.review.note"]

        for path in texts:
            v = get(d, path)
            if not isinstance(v, str) or not v:
                continue
            if MEMO.search(v):
                memo.append((cid, path, MEMO.search(v).group(0), v[:120]))
            m = META.search(v)
            if m:
                meta.append((cid, path, m.group(0), v[:120]))

        # 플레이스홀더·타일 라벨 되풀이
        for sec, labels in LABELS.items():
            for key, holder in (d.get(sec) or {}).items():
                if not isinstance(holder, dict):
                    continue
                val = holder.get("value")
                if not isinstance(val, str):
                    continue
                if PLACEHOLDER.search(val):
                    placeholder.append((cid, f"{sec}.{key}", val[:80]))
                label = labels.get(key)
                if label and compact(val) == compact(label):
                    dup.append((cid, f"{sec}.{key}", label, val))
        if isinstance((d.get("fee") or {}).get("basis"), str) and d["fee"]["basis"] in ("official", "market"):
            placeholder.append((cid, "fee.basis", d["fee"]["basis"]))

        co = d.get("course") or {}
        names = set()
        for n in (co.get("course_names") or []):
            if isinstance(n, str):
                names.add(n.strip())
        for n in ((co.get("kga") or {}).get("nine_hole_courses") or []):
            if isinstance(n, str):
                names.add(n.strip())
        for n in (d.get("master") or {}).get("course_blocks") or []:
            if isinstance(n, str):
                names.add(n.strip())
        for blocks_path in ("course.blocks", "master.course_spec.blocks"):
            for b in get(d, blocks_path) or []:
                if not isinstance(b, str) or not b:
                    continue
                if UPPER_CONCAT.match(b) or splittable(b, names):
                    concat.append((cid, blocks_path, b))

    if "--json" in sys.argv:
        print(json.dumps({"files": len(files), "memo": len(memo), "meta": len(meta), "concat": len(concat),
                          "placeholder": len(placeholder), "dup": len(dup)},
                         ensure_ascii=False))
    else:
        print(f"구장 {len(files)}곳 전수 점검")
        print(f"  내부 정정 메모 노출 {len(memo)}건")
        print(f"  출처·확인일 메타 노출 {len(meta)}건")
        print(f"  구분자 없이 붙은 코스 구성 {len(concat)}건")
        print(f"  플레이스홀더 노출 {len(placeholder)}건")
        print(f"  타일 라벨-값 중복 {len(dup)}건")
        for label, rows in (("메모", memo), ("메타", meta), ("코스구성", concat),
                            ("플레이스홀더", placeholder), ("타일중복", dup)):
            for row in rows[:15]:
                print(f"   [{label}] {row[0]} {row[1]} {row[3] if len(row) > 3 else ''}")

    return 0 if not (memo or meta or concat or placeholder or dup) else 1


if __name__ == "__main__":
    sys.exit(main())
