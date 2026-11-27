#!/usr/bin/env python3
"""2차(일반 사용자 자료) 배치 1·2·4·5 검수 결과를 data/source/golf_courses_all_v29.json 에 반영한다.

- 배치1 수도권A 109건 → 96건 반영 / 13건 제외
- 배치2 수도권B 155건 → 143건 반영 / 12건 제외 (티픽 실거래 최저가 11건은 기존 fee.market 과 대조만)
- 배치4 충청 106건 → 100건 반영 / 6건 제외
- 배치5 호남 88건 → 74건 반영 / 14건 제외
- 기존 값이 있는 필드는 건드리지 않는다(빈 필드만 채움).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data/source/golf_courses_all_v29.json"
BASE = Path("/workspace/memory/clones/99239e1f-shimiseul8/pickle")
BATCHES = {
    1: BASE / "2026-11-27-1909/received/0-batch1_capital_a_found.json",
    2: BASE / "2026-11-27-1912/received/0-batch2_capital_b_found.json",
    4: BASE / "2026-11-27-1922/received/0-batch4_chungcheong_found.json",
    5: BASE / "2026-11-27-1924/received/0-batch5_honam_found.json",
}
CHECKED = "2026-11-27"

EXCLUDE = {
    1: {4, 13, 37, 40, 53, 54, 62, 74, 89, 90, 92, 94, 108},
    2: {27, 97, 98, 99, 100, 114, 115, 116, 117, 125, 133, 150},
    4: {2, 15, 16, 28, 29, 97},
    5: {6, 8, 11, 12, 14, 27, 31, 43, 52, 56, 60, 61, 62, 63},
}

# 티픽 실거래 최저가 — 이미 fee.market 에 있어 공시가(weekday)로 쓰지 않는다
MARKET_VERIFIED = {(2, i) for i in (17, 70, 72, 81, 91, 94, 103, 124, 127, 128, 145)}

OVERRIDE = {
    (1, 48): "예약 없이 도착순 선착순 — 도착 후 티켓팅·접수 순서로 티업 시간 배정(공식 예약안내). 2023년 기사 기준 오전 5시부터 라운드·연습장 이용권 판매",
    (1, 98): "비회원 기준 — 이용예정일 7일 전 17:00까지 취소. 7~5일 전 취소는 패널티 없음, 5~3일 전 2개월, 3~1일 전 3개월, 당일·노쇼 6개월 예약정지, 예약자 미내장 3개월 정지(이후 예약건 전체 취소). 클럽회원은 5일 전 17:00까지",
    (1, 99): "비회원 실시간 예약 — 4주 전 목요일 09:30(월~금 5일치, 회원 예약 후 잔여 타임), 3주 전 월요일 09:30(해당 주 포함). 클럽회원은 4주 전 월요일 09:30(평일)·4주 전 금요일 14:00(휴일)",
    (2, 93): "미쁨코스 레드티는 인조매트 없이 전 홀 잔디(다른 코스·티는 미확인)",
    (4, 14): 6163,
    (4, 36): 2824,
    (4, 41): 5970,
    (4, 58): 3181,
    (4, 89): 3076,
    (4, 51): 72,
    (4, 67): 72,
    (4, 102): 72,
    (5, 42): "주중·주말 5일 전 17:00까지 취소. 주중은 4일 전 30일, 3일 전 60일, 2일 전 90일 또는 이용요금 10%, 1일 전 120일·20%, 당일·미내장 150일·30% 예약정지. 주말은 4일 전 30일, 3일 전 60일·10%, 2일 전 90일·20%, 1일 전 120일·20%, 당일·미내장 150일·30%",
}

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
    (4, 4): "야간 라운드 미운영(2026 확인)",
    (4, 17): "야간(3부) 미운영(2026 확인)",
    (4, 21): "야간(3부) 운영(2026 확인)",
    (4, 26): "야간(3부) 미운영(2026 확인)",
    (4, 47): "야간(3부) 운영(2026 확인)",
    (4, 50): "야간 라운드 운영(2026 확인)",
    (4, 57): "야간 라운드 운영(2026 확인)",
    (4, 60): "야간 시간대 운영(2026 확인)",
    (4, 82): "야간 라운드 운영(LED 조명, 2026 확인)",
    (4, 85): "야간(3부) 자율 라운드 운영(2026-04부터)",
    (4, 90): "야간 라운드 운영(2026 확인)",
    (5, 3): "야간 라운드 운영(야경 후기 다수, 2026-11)",
    (5, 5): "야간 라운드 운영(2025-05 후기)",
    (5, 19): "야간(3부) 운영(2026-11 후기)",
    (5, 47): "야간 라운드 운영(2024-08 후기)",
    (5, 55): False,
}

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
    (5, 16): ("2026-11", "10~11월 정규 요금 주중 162,000·주말·공휴일 212,000원"),
    (5, 36): ("2026-11", "2026년 비회원 그린피 36만원 안팎(후기 집계)"),
    (5, 69): ("2025-09", "민간인 사례요금 평일 58,000·민간인의 날 51,000·휴일 78,000원(9홀)"),
    (5, 85): ("2026-11", "공식 정상가 평일 160,000·주말 200,000원"),
}

SRC_LABEL = {
    "official_site": "공식 홈페이지",
    "booking_platform": "예약 플랫폼(공개 정책·요금표)",
    "membership_broker": "회원권 거래소 공개 자료",
    "greenfee_guide": "그린피가이드(공식 인용)",
    "news": "언론 보도",
    "community": "커뮤니티 게시글",
    "user_review": "방문 후기·후기 집계",
    "review_aggregator": "후기 집계 사이트",
    "blog": "블로그(공개 정리글)",
}
AGGREGATE_HOSTS = ("golfjang.kr", "everysearch.store", "golf.ridecop.co.kr", "roundingday.kr")


def confidence(rec):
    st = rec.get("source_type")
    date = rec.get("source_date") or ""
    if st == "official_site":
        return "high"
    if st in ("booking_platform", "membership_broker", "greenfee_guide"):
        return "medium"
    if st in ("review_aggregator", "user_review", "community"):
        return "low"
    if any(h in rec["source_url"] for h in AGGREGATE_HOSTS):
        return "low"
    if date[:4].isdigit() and int(date[:4]) < 2026:
        return "low"
    return "medium"


def apply_batch(recs, batch_no, data, stats):
    by_id = {c["course_id"]: c for c in data["courses"]}
    excluded = EXCLUDE[batch_no]
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
            c["course"]["night_light"] = NIGHT_TEXT.get((batch_no, i), value)
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
            mk = c["fee"].get("market") or {}
            stats["market_verified"].append((batch_no, i, r["course_id"], mk.get("weekday_min"), mk.get("weekend_min")))

        elif field == "fee.weekday":
            fee = c["fee"]
            if fee.get("weekday") not in (None, ""):
                stats["skip_nonempty"].append((batch_no, i, r["course_id"], field))
                continue
            as_of, note = FEE_NOTE.get((batch_no, i), (r.get("source_date") or CHECKED, ""))
            fee["weekday"] = int(value)
            fee["basis"] = "1인·18홀 비회원(공개 요금 정보, 블로그·후기 인용)"
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
    for batch_no, path in BATCHES.items():
        apply_batch(json.loads(path.read_text()), batch_no, data, stats)

    data["dataset"]["version"] = "2.9.9"
    data["dataset"]["built_at"] = "2026-11-27T20:05:00+09:00"
    data["dataset"]["master_version"] = (
        "2.9.9 (2026-11-27 2차 사용자 자료 배치1·2·4·5 — 수도권 A·B·충청·호남 검수 반영, "
        "티픽 실거래 최저가 11건은 기존 market 값과 대조)"
    )
    touched = {a[2] for a in stats["applied"]}
    for c in data["courses"]:
        if c["course_id"] in touched:
            c["meta"]["user_supplement_batch1245_2026_11_27"] = "2차(일반 사용자 자료) 배치1·2·4·5 검수 반영"

    SRC.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({k: len(v) for k, v in stats.items()}, ensure_ascii=False))
    for k in ("excluded", "skip_nonempty", "missing_course", "unknown", "market_verified"):
        for row in stats[k]:
            print(k, row)


if __name__ == "__main__":
    main()
