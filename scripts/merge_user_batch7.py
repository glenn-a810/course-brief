#!/usr/bin/env python3
"""2차 사용자 자료 배치 7(부울경) 검수 결과를 data/source/golf_courses_all_v29.json 에 반영한다.

- 수신 145건 / 53곳 → 120건 반영, 25건 제외
- 오래된 자료(2012·2013·2020·2021)와 운영정책성 2022년 자료는 제외
- 27·36·54홀 합산 파·전장은 18홀 기준으로 환산하거나 제외
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data/source/golf_courses_all_v29.json"
FOUND = Path("/workspace/memory/clones/99239e1f-shimiseul8/pickle/2026-11-27-1932/received/0-batch7_buulgyeong_found.json")
CHECKED = "2026-11-27"

EXCLUDE = {1, 3, 4, 11, 12, 22, 25, 44, 56, 62, 72, 75, 77, 85, 87, 88, 91, 92,
           102, 106, 109, 116, 123, 139, 143}

OVERRIDE = {
    17: 72, 24: 72, 66: 72, 78: 72, 101: 72, 117: 72,
    41: 2897, 58: 3152, 70: 6434,
    90: "4인 플레이 원칙 — 인원 미달 시에도 4인 요금 적용(2인 단독 가능 여부는 미확인)",
}

QUOTE_OVERRIDE = {
    23: "#3인 가능#야간 (voicecaddiex 코스 태그)",
    49: "모든 홀 잔디 티박스 37 · 매트 티박스 2 (최근 90일 후기 태그 집계)",
    138: "3부 ₩65,000~ · 11.30.(월) 17:35 (voicecaddiex 최저가티)",
    145: "#3인 가능 (voicecaddiex 코스 태그)",
}

NIGHT_TEXT = {
    23: "야간 라운드 운영(2026-11 카카오골프 태그)",
    26: "3부 야간 라운드 운영(2026)",
    38: "야간 라운드 운영(2026)",
    42: "야간 라운드 운영(LED 조명, 2026)",
    46: "전 홀 야간 조명(2026)",
    52: "3부 야간 라운드 운영(2026)",
    65: "3부 야간 라운드 운영(조명 어둡다는 후기, 2026)",
    68: "3부 야간 라운드 운영(2026)",
    71: "가야퍼블릭 3부 야간 라운드 운영(2022-05 후기)",
    80: "3부 야간 라운드 운영(2023-08 후기)",
    86: "3부 야간 라운드 운영(2022-09 후기)",
    104: "3부 야간 라운드 운영(LED 조명, 2022-04 후기)",
    118: "3부 야간 라운드 운영(2026-10 후기)",
    127: "3부 야간 라운드 운영(후반 조명, 2026-11 후기)",
    131: "3부 야간 라운드 운영(2026-11 후기)",
    138: "3부 야간 라운드 운영(2026-11 최저가티)",
    144: False,
}

SRC_LABEL = {
    "official_site": "공식 홈페이지",
    "official_guide": "공식 안내",
    "booking_platform": "예약 플랫폼(공개 정보)",
    "booking_review": "예약 플랫폼 후기",
    "greenfee_guide": "그린피가이드(공식 인용)",
    "review_aggregator": "후기 집계 사이트",
    "user_review": "방문 후기",
    "news": "언론 보도",
    "blog": "블로그(공개 정리글)",
}


def confidence(rec):
    st = rec.get("source_type")
    date = rec.get("source_date") or ""
    if st in ("official_site", "official_guide"):
        return "high"
    if st in ("booking_platform", "greenfee_guide"):
        return "medium"
    if st in ("review_aggregator", "user_review", "booking_review"):
        return "low"
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
        url = r["source_url"]
        quote = QUOTE_OVERRIDE.get(i, r["quote"])
        stype = r.get("source_type") or "blog"
        label = SRC_LABEL.get(stype, "공개 자료")
        base = {"source_url": url, "source_type": stype, "confidence": confidence(r),
                "value_from": "user_batch7_2026_11_27(외부 검수본 재확인)", "checked_at": CHECKED}

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
            fee["weekday"] = int(value)
            fee["basis"] = "9홀 비회원(공개 요금 정보, 블로그 인용)"
            fee["as_of"] = r.get("source_date") or CHECKED
            fee["source_url"] = url
            fee["note"] = ""
            fee["checked_at"] = CHECKED
            fee.setdefault("sources", [])
            fee["sources"].append({"source": label, "url": url, "checked_at": CHECKED, "note": quote})
            applied.append((i, r["course_id"], field))

    data["dataset"]["version"] = "2.9.11"
    data["dataset"]["built_at"] = "2026-11-27T20:40:00+09:00"
    data["dataset"]["master_version"] = (
        "2.9.11 (2026-11-27 2차 사용자 자료 배치1·2·4·5·6·7 — 수도권 A·B·충청·호남·대구경북·부울경 검수 반영)"
    )
    touched = {a[1] for a in applied}
    for c in data["courses"]:
        if c["course_id"] in touched:
            c["meta"]["user_supplement_batch7_2026_11_27"] = "2차(일반 사용자 자료) 배치7(부울경) 검수 반영"

    SRC.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({"applied": len(applied), "excluded": len(excluded), "skipped": len(skipped)}, ensure_ascii=False))
    for row in excluded:
        print("excluded", row)
    for row in skipped:
        print("skipped", row)


if __name__ == "__main__":
    main()
