#!/usr/bin/env python3
"""CourseBrief 정보 충실도(coverage) 지표.

`coverage` 블록은 구장 상세 JSON 12키 중 하나로, 7개 영역별 "값이 있는 항목의 비율"이다.
원본 데이터셋(`data/source/golf_courses_all_v29.json`)의 `dataset.coverage_metric` 이 정의한
필드 그룹을 그대로 쓰고, 값의 유무만 현재 필드 값에서 매번 다시 센다.

이전에는 필드 값이 `{"value": ...}` 형태일 때만 '값 있음'으로 세는 규칙이라,
`nearest_ic{name, distance_km}`, `course.grass{tee, fairway, green}`, `kga{kga_name, code}`,
`briefing.notices{items}`, `review{score_10}`, `rental.nearby_delivery{providers}` 처럼
`value` 키 없이 구조로 담긴 값이 전부 '비어 있음'으로 집계됐다. 지금은 구조 안의 실제
내용을 보고 판단하며, 출처·확인일 같은 메타데이터만 있는 딕셔너리는 비어 있는 것으로 본다.

`npm run data:build` 는 이 모듈로 coverage 를 다시 계산해 구장 상세 JSON 에 쓰므로,
원본의 coverage 값이 낡아 있어도 생성 결과는 항상 현재 필드 기준이다.
"""
from __future__ import annotations

AREAS = ("basic", "course", "fee", "ops", "facility", "briefing", "rental")

# 값이 아니라 출처·기준·확인 시점을 적는 키. 이 키만 있는 딕셔너리는 '값 없음'으로 본다.
META_KEYS = frozenset({
    "source", "sources", "source_url", "source_file", "url", "url_former",
    "checked_at", "collected_at", "collected", "verified_at", "as_of", "updated_at",
    "note", "notes", "note_code", "evidence", "basis", "method", "confidence",
    "quote", "legend", "provider_count", "region", "sido", "match_method",
    "match_score", "match_confidence", "tags",
})

OPS_FIELDS = ("nocaddie", "two_player", "three_player", "five_player", "marshal_caddie",
              "cart_type", "cart_entry", "bagdrop", "mat", "checkin", "locker", "sauna",
              "dress", "pace")

FACILITY_FIELDS = ("practice", "indoor_range", "food", "snack_bar", "locker_sauna",
                   "lodging", "other", "night", "closed_days", "shuttle")


def has_value(v) -> bool:
    """항목에 사람이 읽을 값이 있는지. False/0 같은 '없음·불가' 답도 값으로 센다."""
    if v is None:
        return False
    if isinstance(v, bool):
        return True
    if isinstance(v, (int, float)):
        return True
    if isinstance(v, str):
        s = v.strip()
        return bool(s) and s not in ("미확인", "확인 안 됨")
    if isinstance(v, (list, tuple)):
        return any(has_value(x) for x in v)
    if isinstance(v, dict):
        if "value" in v:
            return has_value(v["value"])
        return any(has_value(v[k]) for k in v if k not in META_KEYS)
    return False


def _ratio(values: list) -> float:
    return round(sum(1 for v in values if has_value(v)) / len(values), 2)


def _wrap(v):
    """ops·facility 처럼 {value, source} 로 감싼 항목은 value 만 본다."""
    return v.get("value") if isinstance(v, dict) and "value" in v else v


def coverage_for(course: dict) -> dict:
    """구장 레코드의 현재 필드 값에서 7개 영역 채움률을 계산한다."""
    m = course.get("master") or {}
    co = course.get("course") or {}
    fee = course.get("fee") or {}
    ops = course.get("ops") or {}
    fac = course.get("facilities") or {}
    br = course.get("briefing") or {}
    rt = course.get("rental") or {}

    basic = [
        m.get("name"), m.get("address"), m.get("tel"), m.get("homepage"),
        m.get("lat"), m.get("nearest_ic"), m.get("type"),
        (m.get("holes") or {}).get("total"), m.get("opened"),
    ]
    course_fields = [
        co.get("holes"), co.get("course_names"), co.get("blocks"),
        co.get("grass"), co.get("kga"),
    ]
    fee_fields = [
        fee.get("weekday"), fee.get("weekend"),
        _wrap(fee.get("cart")), _wrap(fee.get("caddie")),
    ]
    ops_fields = [_wrap(ops.get(k)) for k in OPS_FIELDS]
    fac_fields = [_wrap(fac.get(k)) for k in FACILITY_FIELDS]
    br_fields = [br.get("notices"), br.get("review"),
                 br.get("recent_notice_text"), br.get("course_notes")]
    rt_fields = [rt.get("available"), rt.get("full_set"), rt.get("fee_text"),
                 rt.get("nearby_delivery")]

    return {
        "basic": _ratio(basic),
        "course": _ratio(course_fields),
        "fee": _ratio(fee_fields),
        "ops": _ratio(ops_fields),
        "facility": _ratio(fac_fields),
        "briefing": _ratio(br_fields),
        "rental": _ratio(rt_fields),
    }


def averages(courses: list[dict]) -> dict:
    """영역별 평균 — 데이터 소개 페이지 인포그래피가 쓴다. coverage 블록을 다시 계산해 쓴다."""
    sums = {a: 0.0 for a in AREAS}
    n = 0
    for c in courses:
        cov = coverage_for(c)
        n += 1
        for a in AREAS:
            sums[a] += cov[a]
    if not n:
        return {}
    return {a: round(sums[a] / n, 3) for a in AREAS}


def overall(courses: list[dict]) -> float:
    """7개 영역 전체 평균(0~100)."""
    avgs = averages(courses)
    return round(sum(avgs.values()) / len(AREAS) * 100, 1) if avgs else 0.0
