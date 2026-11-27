#!/usr/bin/env python3
"""2차(일반 사용자 자료) 배치1·2 검수 결과를 data/source/golf_courses_all_v29.json 에 반영한다.

- 배치1: 수도권 A 109건 → 96건 반영 / 13건 제외
- 배치2: 수도권 B 155건 → 143건 반영 / 12건 제외
- 기존 값이 있는 필드는 건드리지 않는다(빈 필드만 채움).
- 티픽 실거래 최저가 12건은 이미 fee.market 에 반영돼 있어 새로 쓰지 않는다(검증만).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data/source/golf_courses_all_v29.json"
B1 = Path("/workspace/memory/clones/99239e1f-shimiseul8/pickle/2026-11-27-1909/received/0-batch1_capital_a_found.json")
B2 = Path("/workspace/memory/clones/99239e1f-shimiseul8/pickle/2026-11-27-1912/received/0-batch2_capital_b_found.json")
CHECKED = "2026-11-27"

B1_EXCLUDE = {4, 13, 37, 40, 53, 54, 62, 74, 89, 90, 92, 94, 108}
B2_EXCLUDE = {27, 97, 98, 99, 100, 114, 115, 116, 117, 125, 133, 150}

# 값 정정·범위 표기 (수신 값이 원문보다 넓거나 오독된 건)
OVERRIDE = {
    (1, 48): "예약 없이 도착순 선착순 — 도착 후 티켓팅·접수 순서로 티업 시간 배정(공식 예약안내). 2023년 기사 기준 오전 5시부터 라운드·연습장 이용권 판매",
    (1, 98): "비회원 기준 — 이용예정일 7일 전 17:00까지 취소. 7~5일 전 취소는 패널티 없음, 5~3일 전 2개월, 3~1일 전 3개월, 당일·노쇼 6개월 예약정지, 예약자 미내장 3개월 정지(이후 예약건 전체 취소). 클럽회원은 5일 전 17:00까지",
    (1, 99): "비회원 실시간 예약 — 4주 전 목요일 09:30(월~금 5일치, 회원 예약 후 잔여 타임), 3주 전 월요일 09:30(해당 주 포함). 클럽회원은 4주 전 월요일 09:30(평일)·4주 전 금요일 14:00(휴일)",
    (2, 93): "미쁨코스 레드티는 인조매트 없이 전 홀 잔디(다른 코스·티는 미확인)",
}

# 범위·기준을 값 앞에 명시해야 하는 건
SCOPE = {
    (1, 32): "회원 예약 기준 — ",
    (1, 57): "P9(퍼블릭 9홀) 기준 — ",
    (1, 72): "회원 예약 기준 — ",
    (1, 73): "회원 예약 기준 — ",
    (1, 81): "[클럽 회원 전용] ",
    (1, 88): "P9(퍼블릭 9홀) 기준 — ",
    (1, 97): "회원 예약 기준 — ",
    (1, 105): "P9(퍼블릭 9홀) 기준 — ",
    (2, 42): "[회원 예약 기준] ",
}

NIGHT_TEXT = {
    (1, 18): "야간 라운드 운영(2026-04 확인)",
    (1, 20): "야간 라운드 운영(야간 노캐디, 2023-11 후기)",
    (1, 25): "3부 나이트골프 운영(2026-04 공지 확인)",
    (1, 51): "야간 라운드(4부) 운영(2024-08 후기)",
    (1, 60): "야간 라운드 운영(2026-04 확인)",
    (1, 68): "야간 라운드 운영(2023-10 후기)",
    (1, 95): "야간 라운드 운영(2024-03 후기)",
    (2, 5): "야간 라운드·조명 운영(2026-11 후기)",
    (2, 11): "야간 라운드·조명 운영(2026-11 후기)",
    (2, 16): "야간 라운드·조명 운영(2026-11 후기)",
    (2, 20): "야간 라운드·조명 운영(2026-08 후기)",
    (2, 36): "야간 라운드 운영(2026-06 후기)",
    (2, 66): "야간 라운드 운영(2026-08 후기)",
    (2, 69): "야간 라운드 운영(노캐디 셀프 9홀, 2026-07 후기)",
    (2, 74): "야간 라운드 운영(2026-11 후기)",
    (2, 76): "야간 조명 운영(2026-03 후기)",
    (2, 83): "3부 야간 라운드 운영(2026-10 후기)",
    (2, 101): "야간 라운드 운영(2026-11 후기)",
    (2, 120): "야간 라운드·조명 운영(2026-10 후기)",
    (2, 137): "야간 라운드 운영(2026-10 후기)",
    (2, 141): "3부 야간 라운드 운영(2026-10 후기)",
    (2, 154): "야간 라운드·조명 운영(2026-10 후기)",
}

MARKET_VERIFIED = {(2, 17), (2, 70), (2, 72), (2, 81), (2, 91), (2, 94),
                   (2, 103), (2, 124), (2, 127), (2, 128), (2, 145)}

FEE_NOTE = {
    (1, 8): ("2026-10", "2026-10 공개자료 기준 일반 주중(1인·18홀). 카트 100,000·코스매니저 160,000 별도"),
    (1, 19): ("2026-05", "2026-05 월별 안내 주중 1부 최저. 1부 139,000~199,000·3부 129,000~179,000원"),
    (1, 30): ("2026-04", "공식 요금안내 검색 결과 인용. 주중 140,000·주말 179,000원"),
    (1, 69): ("2026-04", "비회원 18홀 평일 220,000·휴일 300,000원, 회원가 62,000원"),
    (2, 13): ("2026-06", "18홀 평일 145,000~150,000원"),
    (2, 38): ("2026-11", "11월 1부 기준 주중 160,000~190,000원, 토 270,000·일 260,000~270,000원"),
    (2, 59): ("2026-08", "비회원 18홀 주중 250,000원"),
    (2, 89): ("2026-07", "평일 125,000~150,000원, 주말·공휴일 150,000~220,000원"),
    (2, 110): ("2026-11", "주중 1부 100,000/110,000원, 2부 120,000/130,000원"),
    (2, 118): ("2026-06", "평일 100,000~150,000원(티오프 시간대별), 주말·공휴일 150,000원 이상"),
    (2, 147): ("2025-06", "비회원 주중 300,000원(2025-06 기준)"),
    (2, 151): ("2026-09", "비회원 18홀 주중 140,000·공휴일 200,000원, 카트 20,000원"),
}

SRC_LABEL = {
    "official_site": "공식 홈페이지",
    "booking_platform": "예약 플랫폼(골프토피아 정책표)",
    "membership_broke": "회원권 거래소 공개 자료",
    "membership_broker": "회원권 거래소 공개 자료",
    "greenfee_guide": "그린피가이드(공식 인용)",
    "news": "언론 보도",
    "community": "커뮤니티 게시글",
    "user_review": "방문 후기",
    "blog": "블로그(공개 정리글)",
}
AGGREGATE_HOSTS = ("golfjang.kr", "everysearch.store", "golf.ridecop.co.kr", "roundingday.kr")


def confidence(rec):
    st = rec.get("source_type")
    date = rec.get("source_date") or ""
    if st == "official_site":
        return "high"
    if st in ("booking_platform", "membership_broker"):
        return "medium"
    if any(h in rec["source_url"] for h in AGGREGATE_HOSTS):
        return "low"
    if date[:4].isdigit() and int(date[:4]) < 2026:
        return "low"
    if st in ("community", "user_review"):
        return "low"
    return "medium"


def set_night(course, text):
    course["course"]["night_light"] = text


def apply(recs, batch_no, data, stats):
    by_id = {c["course_id"]: c for c in data["courses"]}
    excluded = B1_EXCLUDE if batch_no == 1 else B2_EXCLUDE
    for i, r in enumerate(recs, 1):
        if i in excluded:
            stats["excluded"].append((batch_no, i, r["course_id"], r["name"], r["field"]))
            continue
        c = by_id.get(r["course_id"])
        if c is None:
            stats["missing_course"].append((batch_no, i, r["course_id"]))
            continue
        field = r["field"]
        value = OVERRIDE.get((batch_no, i), r["value"])
        if isinstance(value, str) and (batch_no, i) in SCOPE:
            value = SCOPE[(batch_no, i)] + value
        url = r["source_url"]
        quote = r["quote"]
        stype = r.get("source_type") or "blog"
        label = SRC_LABEL.get(stype, "공개 자료")
        conf = confidence(r)
        base = {"source_url": url, "source_type": stype, "confidence": conf,
                "value_from": f"user_batch{batch_no}_2026_11_27(외부 검수본 재확인)", "checked_at": CHECKED}

        if field.startswith("ops."):
            key = field.split(".", 1)[1]
            holder = c["ops"].setdefault(key, {"value": None, "evidence": []})
            if holder.get("value") not in (None, "", []):
                stats["skip_nonempty"].append((batch_no, i, r["course_id"], field))
                continue
            holder.update({"value": value, "evidence": [quote], **base})
            stats["applied"].append((batch_no, i, r["course_id"], field))

        elif field == "course.night_light":
            if c["course"].get("night_light") not in (None, ""):
                stats["skip_nonempty"].append((batch_no, i, r["course_id"], field))
                continue
            if (batch_no, i) == (2, 85):
                set_night(c, False)
            else:
                set_night(c, NIGHT_TEXT.get((batch_no, i), value))
            stats["applied"].append((batch_no, i, r["course_id"], field))

        elif field == "course.grass.green":
            g = c["course"].setdefault("grass", {"tee": None, "fairway": None, "green": None})
            if g.get("green") not in (None, "", {}):
                stats["skip_nonempty"].append((batch_no, i, r["course_id"], field))
                continue
            if isinstance(value, str):
                value = re.sub("벤트그래스", "벤트그라스", value)
            g["green"] = {"value": value, "evidence": quote, "source": label, "url": url}
            stats["applied"].append((batch_no, i, r["course_id"], field))

        elif field in ("course.par", "course.length_m"):
            key = field.split(".")[1]
            if c["course"].get(key) not in (None, ""):
                stats["skip_nonempty"].append((batch_no, i, r["course_id"], field))
                continue
            c["course"][key] = int(value)
            stats["applied"].append((batch_no, i, r["course_id"], field))

        elif field == "cancel.cancel_policy":
            cur = c["cancel"].get("cancel_policy")
            if cur not in (None, ""):
                stats["skip_nonempty"].append((batch_no, i, r["course_id"], field))
                continue
            c["cancel"]["cancel_policy"] = {"value": value, "source": label, "url": url, "checked_at": CHECKED}
            c["cancel"].setdefault("evidence", [])
            if quote not in c["cancel"]["evidence"]:
                c["cancel"]["evidence"].append(quote)
            stats["applied"].append((batch_no, i, r["course_id"], field))

        elif field == "cancel.open_cycle":
            cur = c["cancel"].get("open_cycle")
            if cur not in (None, ""):
                stats["skip_nonempty"].append((batch_no, i, r["course_id"], field))
                continue
            c["cancel"]["open_cycle"] = value
            c["cancel"].setdefault("evidence", [])
            ev = quote + f" ({url})"
            if ev not in c["cancel"]["evidence"]:
                c["cancel"]["evidence"].append(ev)
            stats["applied"].append((batch_no, i, r["course_id"], field))

        elif field == "fee.weekday" and (batch_no, i) in MARKET_VERIFIED:
            # 티픽 실거래 최저가는 이미 fee.market 에 들어 있다. 공시가(weekday)로 쓰지 않는다.
            mk = c["fee"].get("market") or {}
            stats["market_verified"].append((batch_no, i, r["course_id"], mk.get("weekday_min"), mk.get("weekend_min")))

        elif field == "fee.weekday":
            fee = c["fee"]
            if fee.get("weekday") not in (None, ""):
                stats["skip_nonempty"].append((batch_no, i, r["course_id"], field))
                continue
            as_of, note = FEE_NOTE.get((batch_no, i), (r.get("source_date") or CHECKED, ""))
            fee["weekday"] = int(value)
            fee["basis"] = "1인·18홀 비회원(공개 요금 정보, 블로그 인용)"
            fee["as_of"] = as_of
            fee["source_url"] = url
            fee["note"] = note
            fee["checked_at"] = CHECKED
            fee.setdefault("sources", [])
            fee["sources"].append({"source": label, "url": url, "checked_at": CHECKED, "note": quote})
            stats["applied"].append((batch_no, i, r["course_id"], field))

        else:
            stats["unknown"].append((batch_no, i, field))


def main():
    data = json.loads(SRC.read_text())
    stats = {k: [] for k in ("applied", "excluded", "skip_nonempty", "missing_course", "unknown", "market_verified")}
    b1 = json.loads(B1.read_text())
    b2 = json.loads(B2.read_text())
    apply(b1, 1, data, stats)
    apply(b2, 2, data, stats)

    data["dataset"]["version"] = "2.9.9"
    data["dataset"]["built_at"] = "2026-11-27T19:45:00+09:00"
    data["dataset"]["master_version"] = (
        "2.9.9 (2026-11-27 2차 사용자 자료 배치1·2 — 수도권 A·B 검수 반영, "
        "티픽 실거래 최저가 12건은 기존 market 값과 대조)"
    )
    for c in data["courses"]:
        if any(a[2] == c["course_id"] for a in stats["applied"]):
            c["meta"]["user_supplement_batch12_2026_11_27"] = "2차(일반 사용자 자료) 배치1·2 검수 반영"

    SRC.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({k: len(v) for k, v in stats.items()}, ensure_ascii=False))
    for k in ("excluded", "skip_nonempty", "missing_course", "unknown", "market_verified"):
        for row in stats[k]:
            print(k, row)


if __name__ == "__main__":
    main()
