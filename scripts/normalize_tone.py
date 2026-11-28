#!/usr/bin/env python3
"""CourseBrief 사용자 노출 문구를 해요체로 정리한다.

대상은 **화면에 그대로 나가는 문장 필드**뿐이다. 관리자 모드에서만 보이는
원문 인용(`evidence`, `raw`, `sources[].quote`, `browser_official`)과 내부 조사
메모(`master.holes_note` 등)는 손대지 않는다 — 인용문을 바꾸면 근거가 아니게 된다.

실행
  python3 scripts/normalize_tone.py --source            # data/source 원본 정리
  python3 scripts/normalize_tone.py --source --apply    # 실제로 쓴다
  python3 scripts/normalize_tone.py --v29 --apply       # data/v29 산출물 점검·정리
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from haeyo import convert_text  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "data", "source", "golf_courses_all_v29.json")
V29 = os.path.join(ROOT, "data", "v29")

# 화면에 나가는 경로만 (구조가 같아 source·v29 양쪽에 같은 규칙을 쓴다)
def is_visible(path: list[str]) -> bool:
    p = tuple(path)
    if p == ("cancel", "cancel_policy", "value") or p == ("cancel", "open_cycle") or p == ("cancel", "notes"):
        return True
    if len(p) == 3 and p[0] in ("ops", "facilities") and p[2] == "value":
        return True
    if p in (("fee", "note"), ("fee", "cart", "note"), ("fee", "caddie", "note"),
             ("fee", "cart", "label"), ("fee", "caddie", "label"), ("fee", "official_green", "label")):
        return True
    if len(p) == 3 and p[0] == "fee" and p[1] == "official_detail":
        return True
    if len(p) == 5 and p[:3] == ("fee", "official_table", "rows") and p[4] in ("label", "value", "section"):
        return True
    if p in (("briefing", "alert", "summary"), ("briefing", "alert", "detail"),
             ("briefing", "recent_notice_text"), ("briefing", "course_notes")):
        return True
    if len(p) == 5 and p[:3] == ("briefing", "notices", "items") and p[4] == "title":
        return True
    if len(p) == 6 and p[:3] == ("briefing", "notices", "tags") and p[5] == "title":
        return True
    if p == ("briefing", "review", "note"):
        return True
    if len(p) == 2 and p[0] == "rental" and p[1] in ("available", "fee_text", "brand", "reservation", "note"):
        return True
    if p == ("rental", "nearby_delivery", "note_code"):
        return True
    if len(p) == 5 and p[:3] == ("rental", "nearby_delivery", "providers") and p[4] in ("basis", "operating_status", "caution", "note"):
        return True
    if len(p) == 2 and p[0] == "master" and p[1] in ("address_note", "status_note", "nearest_ic_note"):
        return True
    return False


def walk(obj, path, changes, log):
    """문자열 잎을 바꾼 값을 돌려준다(부모가 다시 담는다)."""
    if isinstance(obj, dict):
        for k, v in list(obj.items()):
            obj[k] = walk(v, path + [k], changes, log)
        return obj
    if isinstance(obj, list):
        for i, v in enumerate(obj):
            obj[i] = walk(v, path + [str(i)], changes, log)
        return obj
    if isinstance(obj, str):
        if not is_visible(path):
            return obj
        local: list[tuple[str, str]] = []
        new = convert_text(obj, local)
        if new != obj:
            changes.append((list(path), obj, new, local))
            if len(log) < 400:
                log.append((list(path), obj, new))
        return new
    return obj


def process_course(c: dict, changes, log) -> None:
    for key in ("cancel", "ops", "facilities", "fee", "briefing", "rental", "master"):
        if key in c:
            walk(c[key], [key], changes, log)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", action="store_true")
    ap.add_argument("--v29", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--show", dest="show", type=int, default=40, help="바꾼 문장을 몇 개까지 보여 줄지")
    args = ap.parse_args()
    if not (args.source or args.v29):
        args.source = args.v29 = True

    changes: list = []
    log: list = []
    touched = 0

    if args.source:
        data = json.load(open(SOURCE, encoding="utf-8"))
        for c in data.get("courses", []):
            before = len(changes)
            process_course(c, changes, log)
            if len(changes) > before:
                touched += 1
        print(f"[source] 문장 {len(changes)}곳 · 구장 {touched}곳")
        if args.apply and changes:
            with open(SOURCE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=1)
                f.write("\n")
            print(f"[source] 저장 완료 → {os.path.relpath(SOURCE, ROOT)}")

    if args.v29:
        files = sorted(glob.glob(os.path.join(V29, "courses", "*.json")))
        v29_changes: list = []
        v29_log: list = []
        for fp in files:
            obj = json.load(open(fp, encoding="utf-8"))
            before = len(v29_changes)
            process_course(obj, v29_changes, v29_log)
            if len(v29_changes) > before and args.apply:
                with open(fp, "w", encoding="utf-8") as f:
                    json.dump(obj, f, ensure_ascii=False, indent=None, separators=(",", ":"))
        print(f"[v29] 문장 {len(v29_changes)}곳 · 파일 {len(files)}개")
        changes.extend(v29_changes)

    # 바꾼 문장 보기
    shown = 0
    for path, before, after, local in changes:
        if shown >= args.show:
            break
        shown += 1
        print(f"\n· {'.'.join(path)}")
        print(f"  - {before[:160]}")
        print(f"  + {after[:160]}")
    if len(changes) > shown:
        print(f"\n… 그 밖 {len(changes) - shown}곳")


if __name__ == "__main__":
    main()
