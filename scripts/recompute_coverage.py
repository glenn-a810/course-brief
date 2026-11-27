#!/usr/bin/env python3
"""원본 데이터셋(`data/source/golf_courses_all_v29.json`)의 coverage 블록을 현재 필드 값으로 다시 쓴다.

`npm run data:build` 는 생성물의 coverage 를 항상 다시 계산하지만, 원본 파일 안의
coverage 블록은 병합 스크립트가 건드리지 않아 낡은 채로 남는다. 이 스크립트는 원본을
현재 값 기준으로 맞춰 두어, 원본을 직접 읽는 사람·도구가 낡은 수치를 보지 않게 한다.

사용:
  python3 scripts/recompute_coverage.py            # 원본 갱신
  python3 scripts/recompute_coverage.py --check    # 갱신이 필요한지만 확인(종료코드 1)
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import coverage_metric  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = os.path.join(ROOT, "data", "source", "golf_courses_all_v29.json")

METRIC_TEXT = (
    "stage2c/1.0 채움률 — basic: 이름·주소·전화·홈페이지·좌표·최단 IC·형태·홀수·개장(9) / "
    "course: 홀수·코스명·블록·잔디·KGA(5) / fee: 주중·주말·카트·캐디(4) / ops: 정규 14필드 / "
    "facility: 정규 10필드 / briefing: 공지·후기·공지문·코스설명(4) / rental: 지원여부·풀세트·요금·권역배송(4) "
    "중 값이 있는 비율. 값은 구조({name, distance_km}·{items}·{providers} 등) 안의 실제 내용으로 판단하고, "
    "출처·확인일 같은 메타데이터만 있는 항목은 비어 있는 것으로 센다. `npm run data:build`가 매번 다시 계산한다."
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    with open(args.src, encoding="utf-8") as f:
        data = json.load(f)

    changed = 0
    for c in data["courses"]:
        fresh = coverage_metric.coverage_for(c)
        if c.get("coverage") != fresh:
            changed += 1
        c["coverage"] = fresh

    avgs = coverage_metric.averages(data["courses"])
    summary = " · ".join(f"{a} {avgs[a] * 100:.1f}%" for a in coverage_metric.AREAS)
    print(f"coverage 불일치 {changed}곳 / 전체 {len(data['courses'])}곳")
    print(f"평균 {summary} (전체 {coverage_metric.overall(data['courses'])}%)")

    if args.check:
        return 1 if changed else 0

    ds = data.setdefault("dataset", {})
    ds["coverage_metric"] = METRIC_TEXT
    ds["coverage_recomputed_at"] = "2026-11-27"
    with open(args.src, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"갱신 완료: {args.src}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
