#!/usr/bin/env python3
"""2차 사용자 자료 배치 3(강원·제주) 검수 결과를 data/source/golf_courses_all_v29.json 에 반영한다.

- 수신 42건 / 30곳 → 42건 반영(전건 원문 재확인), 0건 제외
- 27홀 합산 파(108)는 18홀 기준 72로 환산, 전장은 정수(m)로 정제
- 카트 요금표만 근거인 5인 플레이, 회원 전용 규정, 기간 한정 운영은 값 안에 조건을 명시
- 2026-11-27 재확인: 원문 27개 URL 전건 접속 + 인용문 부분 문자열 대조, 블로그 20건은 게시일 실측

사용: python3 scripts/merge_user_batch3.py --found <batch3_found.json>
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data/source/golf_courses_all_v29.json"
CHECKED = "2026-11-27"

# 값 정제·조건 명시 (수신값 그대로 쓰지 않는 건)
VALUE = {
    1: "주말 이용 4일 전·주중 이용 3일 전 17시까지 취소 가능(주말 3일 전 취소는 10%) — 이후 2일 전 10%·1일 전 20%·당일·노쇼 30%, 위약금은 그린피 정상가 기준",
    2: "매주 화요일 정기예약 접수(약 3개월 전 일정) — 같은 페이지에 '매월 1일 10:00 오픈' 안내도 병존",
    5: "인터넷 예약은 이용일 3주 전 09시부터(전화 예약은 그 다음 영업일 09시부터)",
    7: "2인 불가(3인 이상 4인 이하 원칙, 에콜리안 공통 예약 규정)",
    9: "2인 라운딩 불가(1팀 4인 원칙) — 동계시즌에만 2인·5인 허용",
    10: "5인 라운딩 불가(1팀 4인 원칙) — 동계시즌에만 2인·5인 허용",
    11: "2인 라운딩 불가(1팀 4인 원칙, 5인도 불가)",
    13: "주말·공휴일 4일 전, 평일 3일 전까지 취소 시 예약금 전액 환불(비회원) — 이후 주말·공휴일 3~2일 전·평일 2일 전 10%, 1일 전 20%, 당일·노쇼 30% 또는 예약정지 2개월",
    15: 6904,
    21: 72,
    14: 72,
    16: "5인 라운딩 시 리무진 카트(8인승) 5인 이용 200,000원/대(4인 170,000원) — 공식 카트 요금표 기준, '5인 플레이 가능' 별도 문구는 없음",
    17: "5인 라운딩 시 리무진 카트 5인 1팀 200,000원(4인 180,000원) — 공식 요금 안내를 인용한 2차 자료 기준(공식 사이트는 접속 불가)",
    19: "노캐디 가능(AI캐디·셀프 전동카트 이용, 티타임 한정)",
    28: "야간 골프(3부) 가능(2026-02 공개 자료 기준)",
    29: "주중 예약은 플레이일 4주 전 화요일 선착순(정회원 09:00, 주중·홈페이지 회원 10:00) — 회원 기준",
    30: "예약일 제외 8일 전까지 페널티 없이 취소 가능, 7일 전~노쇼는 1개월 예약정지 — 회원 기준",
    31: "정회원 주중 4주 전 화요일 09:00 선착순, 주말 3주 전 추첨 접수 — 회원 기준",
    32: "이용일 5일 전까지 취소 가능, 이후 벌점·예약금지 — 회원 기준",
    33: "2·3인 라운딩 가능(2026년 7월 1일~8월 31일 홈페이지 예약 한정 특별 운영, 추가요금 없음)",
    36: "노캐디 라운딩 가능(노캐디 타임 한정, 2026-11-06 여행사 안내 기준)",
    37: "노캐디 라운딩 가능(노캐디 타임 한정, 2026-11-06 여행사 안내 기준)",
    41: "5인 라운딩 가능(주중·주말, 기본 2캐디·2카트)",
}

# 수신 quote 중 원문과 어긋나거나 더 정확한 문장으로 바꾼 건
QUOTE = {
    33: "2026년 여름에는 홈페이지 예약건을 대상으로 7월 1일부터 8월 31일까지 2인 또는 3인 라운딩 시 추가요금 없이 이용할 수 있는 특별 운영 이 공식적으로 안내됐습니다.",
    41: "더클래식, 라온, 부영, 오라, 에버리스, 아덴힐 주중 / 주말 2캐디 2카트 (기본)",
}

# 원문 게시일 실측값(블로그) 또는 확인일(공식·안내 페이지)
SOURCE_DATE = {
    1: "2026-11-27(확인일)", 2: "2026-11-27(확인일)", 3: "2026-11-27(확인일)",
    4: "2026-11-27(확인일)", 5: "2026-11-27(확인일)", 6: "2026-11-27(확인일)", 7: "2026-11-27(확인일)",
    8: "2026-11-27(확인일)", 9: "2026-11-27(확인일)", 10: "2026-11-27(확인일)", 11: "2026-11-27(확인일)",
    12: "2026-11-27(확인일)", 13: "2026-11-27(확인일, 약관 2024-10-01 시행본)",
    14: "2026-11-27(확인일)", 15: "2026-11-27(확인일)",
    16: "2026-10-10", 17: "2026-10-10",
    18: "2026-08-30", 19: "2026-08-30", 42: "2026-08-30",
    20: "2026-10-08", 21: "2026-06-01", 22: "2026-06-01", 23: "2026-07-08", 27: "2026-07-08",
    24: "2026-10-06", 25: "2026-08-04", 26: "2026-07-19", 28: "2026-02-06",
    29: "2026-10-13", 30: "2026-10-13", 31: "2026-11-16", 32: "2026-11-16",
    33: "2026-08-30", 34: "2026-11-05", 35: "2026-01-16", 41: "2026-05-06",
    36: "2026-11-06", 37: "2026-11-06", 38: "2026-11-06", 39: "2026-11-06", 40: "2026-11-06",
}

# 공식 페이지 요금표를 한 번 더 확인한 건(증거 추가)
EXTRA_EVIDENCE = {
    16: [("https://www.shinedale.com/Guide/Fees.aspx",
          "리무진 카트 대여료 (1대당 /8인승) 4인 이용시 170,000 5인 이용시 200,000 (공식 요금표)")],
}

SRC_LABEL = {
    "official_site": "공식 홈페이지",
    "guide_site": "그린피가이드(공식 안내 정리)",
    "travel_site": "제주 여행사 안내",
    "blog_review": "블로그(공개 정리글)",
    "blog_round_review": "방문 후기 블로그",
}

CONFIDENCE = {"official_site": "high", "guide_site": "medium", "travel_site": "medium",
              "blog_review": "low", "blog_round_review": "low"}


def add_check(course: dict, field: str, value, quote: str, base: dict, note: str = "") -> None:
    """값 자체를 담을 수 없는 스칼라 필드(파·전장·야간)의 근거를 meta.review.checks 에 남긴다."""
    review = course["meta"].setdefault("review", {"checked_at": CHECKED, "status": "supplemented", "checks": []})
    review.setdefault("checks", []).append({
        "field": field,
        "received": None,
        "verified": value,
        "result": "보완",
        "url": base["source_url"],
        "quote": quote,
        "source_type": base["source_type"],
        "source_date": base["source_date"],
        "confidence": base["confidence"],
        "checked_at": CHECKED,
        "note": f"2차 사용자 자료 배치3(강원·제주)" + (f" · {note}" if note else ""),
    })


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--found", required=True, help="배치 3 수신 JSON 경로")
    args = ap.parse_args()

    data = json.loads(SRC.read_text())
    recs = json.loads(Path(args.found).read_text())
    by_id = {c["course_id"]: c for c in data["courses"]}
    applied, excluded, skipped = [], [], []

    for i, r in enumerate(recs, 1):
        c = by_id.get(r["course_id"])
        if c is None:
            skipped.append((i, r["course_id"], r["field"], "course_id 없음"))
            continue
        field = r["field"]
        value = VALUE.get(i, r["value"])
        quote = QUOTE.get(i, r["quote"])
        url = r["source_url"]
        stype = r.get("source_type") or "blog_review"
        label = SRC_LABEL.get(stype, "공개 자료")
        date = SOURCE_DATE.get(i, r.get("source_date") or CHECKED)
        base = {"source_url": url, "source_type": stype, "confidence": CONFIDENCE.get(stype, "low"),
                "value_from": "user_batch3_2026_11_27(원문 재확인)", "source_date": date,
                "checked_at": CHECKED}
        evidence = [quote] + [q for _, q in EXTRA_EVIDENCE.get(i, [])]

        if field.startswith("ops."):
            key = field.split(".", 1)[1]
            holder = c["ops"].setdefault(key, {"value": None, "evidence": []})
            if holder.get("value") not in (None, "", []):
                skipped.append((i, r["course_id"], field, "기존 값 있음")); continue
            holder.update({"value": value, "evidence": evidence, **base})
            applied.append((i, r["course_id"], field))

        elif field == "course.night_light":
            if c["course"].get("night_light") not in (None, ""):
                skipped.append((i, r["course_id"], field, "기존 값 있음")); continue
            c["course"]["night_light"] = value
            add_check(c, field, value, quote, base)
            applied.append((i, r["course_id"], field))

        elif field == "course.grass.green":
            g = c["course"].setdefault("grass", {"tee": None, "fairway": None, "green": None})
            if g.get("green") not in (None, "", {}):
                skipped.append((i, r["course_id"], field, "기존 값 있음")); continue
            g["green"] = {"value": value, "evidence": quote, "source": label, "url": url,
                          "source_date": date, "checked_at": CHECKED}
            applied.append((i, r["course_id"], field))

        elif field in ("course.par", "course.length_m"):
            key = field.split(".")[1]
            if c["course"].get(key) not in (None, ""):
                skipped.append((i, r["course_id"], field, "기존 값 있음")); continue
            c["course"][key] = int(value)
            note = ""
            if field == "course.par" and c["course"].get("holes") not in (None, 18):
                note = f"원문은 {c['course']['holes']}홀 합산 파 108 → 18홀 기준 72로 환산"
            elif field == "course.length_m" and not isinstance(r["value"], int):
                note = f"원문 표기 '{r['value']}' → 정수(m)로 정제"
            add_check(c, field, int(value), quote, base, note)
            applied.append((i, r["course_id"], field))

        elif field == "cancel.cancel_policy":
            if c["cancel"].get("cancel_policy") not in (None, ""):
                skipped.append((i, r["course_id"], field, "기존 값 있음")); continue
            c["cancel"]["cancel_policy"] = {"value": value, "source": label, "url": url,
                                            "source_date": date, "checked_at": CHECKED}
            c["cancel"].setdefault("evidence", [])
            for q in evidence:
                if q not in c["cancel"]["evidence"]:
                    c["cancel"]["evidence"].append(q)
            applied.append((i, r["course_id"], field))

        elif field == "cancel.open_cycle":
            if c["cancel"].get("open_cycle") not in (None, ""):
                skipped.append((i, r["course_id"], field, "기존 값 있음")); continue
            c["cancel"]["open_cycle"] = value
            c["cancel"].setdefault("evidence", [])
            ev = f"{quote} ({url})"
            if ev not in c["cancel"]["evidence"]:
                c["cancel"]["evidence"].append(ev)
            applied.append((i, r["course_id"], field))
        else:
            skipped.append((i, r["course_id"], field, "미지원 필드"))

    data["dataset"]["version"] = "2.9.12"
    data["dataset"]["built_at"] = "2026-11-27T21:20:00+09:00"
    data["dataset"]["previous_version"] = "2.9.11"
    data["dataset"]["master_version"] = (
        "2.9.12 (2026-11-27 2차 사용자 자료 7개 배치 전량 검수 완료 — 수도권 A·B·충청·호남·대구경북·부울경·강원제주)"
    )
    touched = {a[1] for a in applied}
    for c in data["courses"]:
        if c["course_id"] in touched:
            c["meta"]["user_supplement_batch3_2026_11_27"] = "2차(일반 사용자 자료) 배치3(강원·제주) 검수 반영"

    SRC.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({"applied": len(applied), "excluded": len(excluded), "skipped": len(skipped),
                      "courses": len(touched)}, ensure_ascii=False))
    for row in excluded:
        print("excluded", row)
    for row in skipped:
        print("skipped", row)


if __name__ == "__main__":
    main()
