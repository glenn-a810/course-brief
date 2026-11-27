#!/usr/bin/env python3
"""2차 사용자 자료 배치 6(대구·경북) 검수 결과를 data/source/golf_courses_all_v29.json 에 반영한다.

- 수신 57건 / 32곳 → 51건 / 32곳 반영, 6건 제외
- 기존 값이 있는 필드는 건드리지 않는다(빈 필드만 채움).
- master.homepage 5건은 master.homepage 가 비어 있는 구장에만 넣는다.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data/source/golf_courses_all_v29.json"
FOUND = Path("/workspace/memory/clones/99239e1f-shimiseul8/pickle/2026-11-27-1930/received/0-batch6_daegu_gyeongbuk_found.json")
CHECKED = "2026-11-27"

EXCLUDE = {1, 11, 24, 25, 39, 40}

OVERRIDE = {
    28: 36, 34: 72, 36: 36, 38: 72, 45: 36, 46: 36, 52: 36,
    47: 3287, 48: 6550, 53: 2800, 56: 6680,
    9: 49000,
}

NIGHT_TEXT = {
    2: "3부 야간 라운드 운영(2026-08 후기)",
    5: "3부 야간 라운드 운영(2026-09 후기)",
    8: "3부 야간 라운드 운영(2026-11 후기)",
    12: "3부 야간 라운드 운영(3부 16:50~18:49, 2026-03 요금표)",
    15: "3부 야간 라운드 운영(2023-06 후기)",
    22: "3부 야간 라운드 운영(3부 요금 별도, 2025-10 요금표)",
    23: "3부 야간 라운드 운영(2026-07 후기)",
    26: "3부 야간 라운드 운영(2024-03 후기)",
    27: "야간 라운드 미운영(3부 티타임·조명 없음, 2026-06 후기)",
    30: "3부까지 운영(캐디피 1~3부 동일, 2026-02 요금표)",
    42: "3부 야간 라운드 운영(캐디피 1·2·3부 동일, 2026-02 요금표)",
    51: "3부 야간 라운드 운영(3부 그린피 별도, 2026-03 요금표)",
}

FEE_NOTE = {
    9: ("2026-03", "9홀 주중 2부(08:30~16:30) 비회원 49,000원. 2026-03-01~03-15 예시 요금표, 월별 변동"),
}

SRC_LABEL = {
    "official_site": "공식 홈페이지",
    "greenfee_guide": "그린피가이드(공식 인용)",
    "golf_info_site": "골프장 정보 사이트(파크골프인포)",
    "blog": "블로그(공개 정리글)",
}


def confidence(rec):
    st = rec.get("source_type")
    date = rec.get("source_date") or ""
    if st == "official_site":
        return "high"
    if st in ("greenfee_guide", "golf_info_site"):
        return "medium"
    if date[:4].isdigit() and int(date[:4]) < 2026:
        return "low"
    return "medium"


def main():
    data = json.loads(SRC.read_text())
    recs = json.loads(FOUND.read_text())
    by_id = {c["course_id"]: c for c in data["courses"]}
    applied, excluded, skipped = [], [], []

    for i, r in enumerate(recs, 1):
        if i in EXCLUDE:
            excluded.append((i, r["course_id"], r["field"]))
            continue
        c = by_id.get(r["course_id"])
        if c is None:
            continue
        field = r["field"]
        value = OVERRIDE.get(i, r["value"])
        url, quote = r["source_url"], r["quote"]
        stype = r.get("source_type") or "blog"
        label = SRC_LABEL.get(stype, "공개 자료")
        base = {"source_url": url, "source_type": stype, "confidence": confidence(r),
                "value_from": "user_batch6_2026_11_27(외부 검수본 재확인)", "checked_at": CHECKED}

        if field.startswith("ops."):
            key = field.split(".", 1)[1]
            holder = c["ops"].setdefault(key, {"value": None, "evidence": []})
            if holder.get("value") not in (None, "", []):
                skipped.append((i, r["course_id"], field)); continue
            holder.update({"value": value, "evidence": [quote], **base})
            applied.append((i, r["course_id"], field))

        elif field == "course.night_light":
            if c["course"].get("night_light") not in (None, ""):
                skipped.append((i, r["course_id"], field)); continue
            c["course"]["night_light"] = NIGHT_TEXT.get(i, value)
            applied.append((i, r["course_id"], field))

        elif field == "course.grass.green":
            g = c["course"].setdefault("grass", {"tee": None, "fairway": None, "green": None})
            if g.get("green") not in (None, "", {}):
                skipped.append((i, r["course_id"], field)); continue
            g["green"] = {"value": value, "evidence": quote, "source": label, "url": url}
            applied.append((i, r["course_id"], field))

        elif field in ("course.par", "course.length_m"):
            key = field.split(".")[1]
            if c["course"].get(key) not in (None, ""):
                skipped.append((i, r["course_id"], field)); continue
            c["course"][key] = int(value)
            applied.append((i, r["course_id"], field))

        elif field == "master.homepage":
            if c["master"].get("homepage") not in (None, ""):
                skipped.append((i, r["course_id"], field)); continue
            c["master"]["homepage"] = value
            applied.append((i, r["course_id"], field))

        elif field == "cancel.cancel_policy":
            if c["cancel"].get("cancel_policy") not in (None, ""):
                skipped.append((i, r["course_id"], field)); continue
            c["cancel"]["cancel_policy"] = {"value": value, "source": label, "url": url, "checked_at": CHECKED}
            c["cancel"].setdefault("evidence", [])
            if quote not in c["cancel"]["evidence"]:
                c["cancel"]["evidence"].append(quote)
            applied.append((i, r["course_id"], field))

        elif field == "cancel.open_cycle":
            if c["cancel"].get("open_cycle") not in (None, ""):
                skipped.append((i, r["course_id"], field)); continue
            c["cancel"]["open_cycle"] = value
            c["cancel"].setdefault("evidence", [])
            ev = quote + f" ({url})"
            if ev not in c["cancel"]["evidence"]:
                c["cancel"]["evidence"].append(ev)
            applied.append((i, r["course_id"], field))

        elif field == "fee.weekday":
            fee = c["fee"]
            if fee.get("weekday") not in (None, ""):
                skipped.append((i, r["course_id"], field)); continue
            as_of, note = FEE_NOTE.get(i, (r.get("source_date") or CHECKED, ""))
            fee["weekday"] = int(value)
            fee["basis"] = "9홀 비회원(공개 요금 정보, 정보 사이트 인용)"
            fee["as_of"] = as_of
            fee["source_url"] = url
            fee["note"] = note
            fee["checked_at"] = CHECKED
            fee.setdefault("sources", [])
            fee["sources"].append({"source": label, "url": url, "checked_at": CHECKED, "note": quote})
            applied.append((i, r["course_id"], field))

    data["dataset"]["version"] = "2.9.10"
    data["dataset"]["built_at"] = "2026-11-27T20:20:00+09:00"
    data["dataset"]["master_version"] = (
        "2.9.10 (2026-11-27 2차 사용자 자료 배치1·2·4·5·6 — 수도권 A·B·충청·호남·대구경북 검수 반영)"
    )
    touched = {a[1] for a in applied}
    for c in data["courses"]:
        if c["course_id"] in touched:
            c["meta"]["user_supplement_batch6_2026_11_27"] = "2차(일반 사용자 자료) 배치6(대구·경북) 검수 반영"

    SRC.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({"applied": len(applied), "excluded": len(excluded), "skipped": len(skipped)}, ensure_ascii=False))
    for row in excluded:
        print("excluded", row)
    for row in skipped:
        print("skipped", row)


if __name__ == "__main__":
    main()
