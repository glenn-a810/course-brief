#!/usr/bin/env python3
"""
L2. 그린피 스냅샷 기록 — `data/v29/price_history.json`

빌드마다 이 스크립트를 한 번 돌려 오늘 날짜의 그린피를 남긴다(`npm run data:snapshot`).
사이트는 이 파일을 읽어 상세의 `01 요금·예약` 에 '그린피 추이'를 그린다.

기록 규칙
  - **값이 바뀐 구장만** 한 줄 남긴다. 같은 값이 이어지는 기간은 직전 기록값이 유지된 것으로 본다.
    그래서 파일이 매일 540줄씩 불어나지 않고(하루 수십 줄), 그래프는 '기록된 시점의 값'을 정확히 잇는다.
  - 한 구장에 같은 날짜 기록이 이미 있으면 다시 쓰지 않는다(멱등).
  - 값의 출처(`basis`: official/market)도 함께 남긴다 — 공식 요금표가 관측 최저가로 바뀌면
    가격이 아니라 '출처'가 바뀐 것일 수 있어, 화면에서 같은 선으로 읽지 않게 구분할 수 있다.
  - 없는 값은 `null` 로 둔다(0 이 아니다). 데이터 원칙과 같다.

사용
  python3 scripts/record_price_snapshot.py                 # 오늘 날짜로 기록
  python3 scripts/record_price_snapshot.py --date 2026-11-28
  python3 scripts/record_price_snapshot.py --dry-run       # 쓰지 않고 요약만
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "data", "v29", "index.json")
OUT = os.path.join(ROOT, "data", "v29", "price_history.json")
KST = timezone(timedelta(hours=9))
SCHEMA = "coursebrief/price-history-1"


def load_json(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def snapshot_of(item: dict) -> dict:
    fee = item.get("green_fee") or {}
    return {
        "weekday": fee.get("weekday"),
        "weekend": fee.get("weekend"),
        "cart": item.get("cart"),
        "caddie": item.get("caddie"),
        "basis": fee.get("basis"),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=None, help="기록 날짜(YYYY-MM-DD). 기본은 오늘(Asia/Seoul)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    date = args.date or datetime.now(KST).strftime("%Y-%m-%d")
    index = load_json(INDEX)
    courses = index.get("courses") or []

    if os.path.exists(OUT):
        history = load_json(OUT)
    else:
        history = {
            "dataset": {
                "schema": SCHEMA,
                "created_at": date,
                "updated_at": date,
                "rule": "value-change-only",
                "note": "값이 바뀐 날만 기록합니다. 기록이 없는 기간은 직전 값이 유지된 것으로 봅니다.",
                "counts": {"courses": 0, "records": 0},
            },
            "courses": {},
        }

    by_course: dict = history.setdefault("courses", {})
    added = 0
    changed = 0
    same = 0
    empty = 0
    for item in courses:
        cid = item.get("id")
        if not cid:
            continue
        snap = snapshot_of(item)
        if snap["weekday"] is None and snap["weekend"] is None:
            empty += 1  # 요금 값이 아직 없는 구장은 기록하지 않는다
            continue
        records = by_course.setdefault(cid, [])
        if any(r.get("date") == date for r in records):
            same += 1
            continue
        last = records[-1] if records else None
        if last and all(last.get(k) == snap[k] for k in ("weekday", "weekend", "cart", "caddie", "basis")):
            same += 1  # 값이 그대로면 오늘 줄을 만들지 않는다
            continue
        records.append({"date": date, **snap})
        if last:
            changed += 1
        else:
            added += 1

    # 비어 있는 배열은 남기지 않는다(파일 크기)
    by_course = {k: v for k, v in by_course.items() if v}
    history["courses"] = by_course
    total = sum(len(v) for v in by_course.values())
    history["dataset"]["updated_at"] = date
    history["dataset"]["counts"] = {"courses": len(by_course), "records": total}

    size = len(json.dumps(history, ensure_ascii=False, separators=(",", ":")))
    print(f"{date} 스냅샷 — 구장 {len(courses)}곳 중 신규 {added} · 변동 {changed} · 그대로 {same} · 요금 없음 {empty}")
    print(f"기록 누적 {len(by_course)}곳 / {total}건 · 파일 약 {size / 1024:.1f}KB")
    if args.dry_run:
        print("(dry-run — 쓰지 않았습니다)")
        return 0
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"저장: {os.path.relpath(OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
