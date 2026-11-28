#!/usr/bin/env python3
"""
L3. 인덱스에 KGA 대표 슬로프 추가 — `data/v29/index.json`

`npm run data:rules`(예약 규칙 파싱) 뒤에 도는 후처리 단계다. 상세 JSON 의
`course.kga.hole_combinations` 에서 구장 대표 슬로프를 뽑아 인덱스에 경량 반영한다.

  python3 scripts/index_slope.py            # 반영
  python3 scripts/index_slope.py --check    # 반영하지 않고 현황만

대표값 규칙은 `build_data_split.kga_slope()` 한 곳에 있다(남자 Regular 티 18홀 조합 평균,
Regular 가 없으면 남자 티 중앙값). 값이 없는 구장은 필드를 넣지 않는다 — 0 이 아니다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_data_split as bds  # noqa: E402  (대표값 규칙을 한 곳에서만 정의한다)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V29 = os.path.join(ROOT, "data", "v29")
INDEX = os.path.join(V29, "index.json")
COURSES = os.path.join(V29, "courses")

FIELD_NOTE = "KGA 대표 슬로프 레이팅 {value, tee, combos} — 남자 Regular 티 18홀 조합 평균(L3)"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    with open(INDEX, encoding="utf-8") as f:
        index = json.load(f)

    found = 0
    missing = 0
    changed = 0
    values: list[float] = []
    for item in index["courses"]:
        cid = item["id"]
        detail_path = os.path.join(COURSES, f"{cid}.json")
        slope = None
        if os.path.exists(detail_path):
            with open(detail_path, encoding="utf-8") as f:
                slope = bds.kga_slope(json.load(f))
        if slope:
            found += 1
            values.append(slope["value"])
            if item.get("slope") != slope:
                item["slope"] = slope
                changed += 1
        else:
            missing += 1
            if "slope" in item:
                del item["slope"]
                changed += 1

    fields = index.get("dataset", {}).get("fields")
    if isinstance(fields, dict) and fields.get("slope") != FIELD_NOTE:
        fields["slope"] = FIELD_NOTE
        changed += 1

    values.sort()
    if values:
        mid = values[len(values) // 2]
        print(f"슬로프 있는 구장 {found}곳 · 없음 {missing}곳 · 범위 {values[0]:g}~{values[-1]:g} · 중앙값 {mid:g}")
    print(f"인덱스 변경 {changed}건")
    if args.check:
        return 0
    with open(INDEX, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"저장: {os.path.relpath(INDEX, ROOT)} ({os.path.getsize(INDEX) / 1024:.1f}KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
