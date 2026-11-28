#!/usr/bin/env python3
"""CourseBrief — 잔여 플레이스홀더·오분류·타일 라벨 중복 정리 (v2.9.16, 2026-11-28).

1) 플레이스홀더: ops/facilities 값의 `문구 확인(원문 근거)` / `(문구 확인)`, value_previous 잔재,
   `fee.basis: "official"` 내부 코드, '미확인'만 있는 값 → 제거(null) 또는 실제 값만 유지
2) 오분류 이관
   - cancel 문구에 섞인 캐디·부대시설·휴장일·경기시간·카트요금 → 각 섹션으로(이미 있으면 중복 제거)
   - facilities.food/other 에 섞인 사우나 → ops.sauna / facilities.locker_sauna
   - ops.locker 에만 있는 사우나 값 → ops.sauna, ops.sauna 에만 있는 락카 값 → ops.locker
3) 타일 라벨-값 중복: 값이 라벨을 그대로 되풀이하면 상태어(운영/가능/불가…)만 남긴다

사용
  python3 scripts/clean_residual_2026_11_28.py --dry-run
  python3 scripts/clean_residual_2026_11_28.py
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import sys

SRC = "data/source/golf_courses_all_v29.json"

LABELS: dict[str, dict[str, str]] = {
    "ops": {
        "nocaddie": "노캐디", "two_player": "2인 플레이", "three_player": "3인 플레이",
        "five_player": "5인 플레이", "marshal_caddie": "마샬 캐디", "cart_type": "카트 종류",
        "cart_entry": "카트 페어웨이 진입", "bagdrop": "셀프 백드롭", "mat": "매트 티샷",
        "checkin": "체크인", "locker": "락카", "sauna": "사우나", "dress": "복장 규정",
        "pace": "진행 속도",
    },
    "facilities": {
        "practice": "연습장", "indoor_range": "실내 연습장", "food": "식당·조식",
        "snack_bar": "그늘집·스낵", "locker_sauna": "락카·사우나", "lodging": "숙박",
        "other": "기타 시설", "night": "야간 라운드", "closed_days": "휴장일",
        "shuttle": "셔틀·교통", "ev_charge": "전기차 충전", "proshop": "프로샵",
    },
}

# 라벨을 걷어낸 뒤 남는 껍데기 → 화면에 쓸 상태 표기
BARE = {"": "운영", "있음": "운영", "시설": "운영", "실": "운영", "룸": "운영",
        "소": "운영", "구역": "운영", "운영 중": "운영", "없음": "미운영"}

# 라벨 뒤에 이 말이 오면 문장이 깨지므로(조사) 원문 유지
PARTICLE = re.compile(r"^(?:시|는|은|이|가|를|을|도|만|까지|부터|에서|으로|로|와|과|의|에는)\s")
# 라벨을 걷어낼 수 있는(=실제 상태·수치로 시작하는) 앞머리
STRIPPABLE = re.compile(r"^(?:가능|불가|불허|불가능|금지|있음|없음|운영|선택|일부|전면|미도입|안내|셀프|라운드|라운딩|타임|추가요금|\(|\d|[A-Za-z])")

CONCAT_FIX = re.compile(r"(있음|없음)(?=[가-힣A-Za-z])")
PLACEHOLDER_ONLY = re.compile(r"^(?:문구 확인\(원문 근거\)|\(?문구 확인\)?|원문 근거|확인 필요|미확인)$")
PLACEHOLDER_PAREN = re.compile(r"\s*\(\s*문구 확인\s*(?:·\s*원문 근거)?\s*\)")

log: list[str] = []

# 라벨과 함께 쓰이는 다른 표기도 되풀이로 본다
EXTRA_VARIANTS: dict[tuple[str, str], list[str]] = {
    ("facilities", "practice"): ["골프연습장", "골프 연습장"],
    ("facilities", "closed_days"): ["정기 휴장일", "정기휴장일"],
}

# 기계적 규칙으로 다듬기 어려운 표기 — 값이 화면에서 라벨을 되풀이하지 않게 하는 개별 치환
ALIAS: dict[tuple[str, str], dict[str, str]] = {
    ("facilities", "practice"): {
        "골프연습장": "운영", "골프 연습장 운영": "운영", "골프연습장 안내": "운영",
        "드라이빙 레인지골프연습장": "드라이빙 레인지", "드라이빙 레인지연습장": "드라이빙 레인지",
        "드라이빙레인지 · 연습장": "드라이빙 레인지", "드라이빙 레인지 · 골프연습장": "드라이빙 레인지",
        "드라이빙 레인지·골프연습장": "드라이빙 레인지", "연습장 · 벙커연습": "벙커연습 겸비",
        "연습장 · 퍼팅연습그린": "퍼팅연습그린 겸비",
    },
    ("ops", "locker"): {"락카룸·락카장 운영": "운영(락카룸·락카장)"},
    ("facilities", "closed_days"): {
        "정기 휴장일 없음": "없음", "정기휴장일 없음(클럽 사정에 따른 휴장은 사전 통보)": "없음(클럽 사정에 따른 휴장은 사전 통보)",
        "정기휴장일: 매월 첫번째 월요일": "매월 첫번째 월요일",
    },
}


def note(msg: str) -> None:
    log.append(msg)


SUFFIX = r"(?:소|시설|구역|실|룸|장)?"


def label_regex(label: str) -> re.Pattern:
    parts = [re.escape(p) for p in re.split(r"\s*·\s*", label) if p]
    # 라벨에 붙는 시설 명사(연습장·락카룸·충전소)까지만 라벨로 보고, 뒤에 다른 한글 단어가 바로 붙으면 건드리지 않는다
    return re.compile(r"^" + r"\s*·\s*".join(parts) + SUFFIX + r"(?![\uAC00-\uD7A3])\s*[:：]?\s*")


def strip_label(label: str, value: str) -> str:
    """값 앞머리의 라벨 되풀이를 걷어낸다. 걷어낼 수 없으면 원문 그대로."""
    m = label_regex(label).match(value)
    if not m:
        return value
    tail_raw = value[m.end():]
    dotted = tail_raw.lstrip().startswith("·")
    rest = tail_raw.lstrip(" ·,、-—+")
    if rest and PARTICLE.match(rest):
        # "2인 플레이 시 3인 요금이 부과됩니다" → "시" 뒤가 완결된 서술이라 라벨과 함께 걷어낸다
        m_particle = re.match(r"^시\s*(.+)$", rest)
        if m_particle:
            return m_particle.group(1).strip()
        return value
    # 라벨에 '·'로 이어 붙은 시설 목록: `사우나·노천탕` → `운영 · 노천탕`
    if dotted and rest:
        return f"운영 · {rest}"
    if rest in BARE:
        return BARE[rest]
    m_paren = re.match(r"^(있음|없음|운영)\s*(\(.+\))$", rest)
    if m_paren:
        state = {"있음": "운영", "없음": "미운영"}.get(m_paren.group(1), "운영")
        return f"{state}{m_paren.group(2)}"
    m_sep = re.match(r"^(있음|운영)\s*[·,/]\s*(.+)$", rest)
    if m_sep:
        return f"운영 · {m_sep.group(2).strip().lstrip('·,/ ')}"
    m_tail = re.match(r"^(있음|운영)\s+(.+)$", rest)
    if m_tail:
        return f"운영 · {m_tail.group(2).strip().lstrip('·,/ ')}"
    # 괄호 설명이 앞에 오는 값: `락카(후불 결제)` → `운영(후불 결제)`,
    # `락카(탈의실) 운영, …` → `탈의실 운영, …`
    m_group = re.match(r"^\(([^()]*)\)(.*)$", rest)
    if m_group:
        inner, after = m_group.group(1), m_group.group(2)
        if re.match(r"^\s*(?:운영|가능|불가|선택|라운드|라운딩|타임)", after):
            return f"{inner}{after}"
        return f"운영({inner}){after}"
    if not rest or not STRIPPABLE.match(rest):
        return value
    return rest


def scrub_placeholder(value):
    if not isinstance(value, str):
        return value
    v = value.strip()
    if PLACEHOLDER_ONLY.match(v):
        return None
    v2 = PLACEHOLDER_PAREN.sub("", v).strip()
    return v2 or None


def fix_concat(value: str) -> str:
    return CONCAT_FIX.sub(r"\1 · ", value)


def get(c, path):
    cur = c
    for k in path.split("."):
        if isinstance(cur, dict) and k in cur:
            cur = cur[k]
        else:
            return None
    return cur


def holder(c, path):
    """`sec.key.value` / `sec.key.sub` 형태 경로의 dict 를 만든다(없으면 생성)."""
    parts = path.split(".")
    cur = c
    for k in parts[:-1]:
        cur = cur.setdefault(k, {})
        if not isinstance(cur, dict):
            raise TypeError(f"{path}: {k} 가 dict 가 아님")
    leaf = parts[-1]
    if leaf not in cur or not isinstance(cur[leaf], dict):
        cur[leaf] = {"value": cur.get(leaf)}
    return cur[leaf]


def set_value(c, path, value, cid):
    h = holder(c, path)
    old = h.get("value")
    if old == value:
        return
    h["value"] = value
    note(f"{cid} {path}.value: {old!r} → {value!r}")


def split_top(text: str) -> list[str]:
    """괄호 안은 건너뛰고 바깥 '·'·',' 로만 나눈다."""
    parts, buf, depth = [], "", 0
    for ch in text:
        if ch in "(（":
            depth += 1
        elif ch in ")）":
            depth = max(0, depth - 1)
        if ch in "·," and depth == 0:
            parts.append(buf)
            buf = ""
            continue
        buf += ch
    parts.append(buf)
    return [p.strip() for p in parts if p.strip()]


def append_tokens(c, path, tokens, cid):
    """이미 들어 있는 항목은 빼고 없는 것만 덧붙인다."""
    h = holder(c, path)
    old = h.get("value") if isinstance(h.get("value"), str) else ""
    compact = re.sub(r"\s", "", old)
    add = [t for t in tokens if re.sub(r"\s", "", t) not in compact]
    if not add:
        return
    set_value(c, path, " · ".join(filter(None, [old] + add)), cid)


def set_scalar(c, path, text, cid):
    """`fee.note` 처럼 dict 가 아닌 문자열 필드에 값을 쓴다."""
    parts = path.split(".")
    cur = c
    for k in parts[:-1]:
        cur = cur.setdefault(k, {})
    old = cur.get(parts[-1])
    if old == text:
        return
    cur[parts[-1]] = text
    note(f"{cid} {path}: {old!r} → {text!r}")


def append_value(c, path, text, cid, sep=" · "):
    h = holder(c, path)
    old = h.get("value")
    if isinstance(old, str) and text in old:
        return
    new = text if not old else f"{old}{sep}{text}"
    set_value(c, path, new, cid)


# ---------------------------------------------------------------- 취소 필드 이관 표
# (course_id, 취소 문구에 섞여 있던 줄의 앞부분) → 처분
#   ("drop", 이유) : 이미 해당 섹션에 같은 내용이 있음
#   ("set"|"append", 경로, 값)
CANCEL_ROUTE: list[tuple[str, str, tuple]] = [
    ("kr-golf-0057", "캐디:", ("append", "ops.nocaddie", "팀당 20,000원 추가")),
    ("kr-golf-0057", "캐디피 결제:", ("set", "fee.caddie.note", "캐디피 현금 결제")),
    ("kr-golf-0058", "캐디:", ("append", "ops.nocaddie", "팀당 20,000원 추가")),
    ("kr-golf-0058", "야간(3부):", ("drop", "facilities.night 에 동일 문구")),
    ("kr-golf-0059", "경기 시간:", ("append", "ops.pace", "18홀 4시간 30분")),
    ("kr-golf-0059", "잔디:", ("drop", "course.grass 에 동일 내용")),
    ("kr-golf-0060", "캐디:", ("drop", "ops.nocaddie 에 동일 문구")),
    ("kr-golf-0060", "2인 플레이:", ("drop", "ops.two_player 에 동일 내용")),
    ("kr-golf-0060", "정기 휴장일:", ("drop", "facilities.closed_days 에 동일 문구")),
    ("kr-golf-0069", "겨울 휴장:", ("drop", "facilities.closed_days 에 동일 문구")),
    ("kr-golf-0069", "개장:", ("drop", "master.opened=1991")),
    ("kr-golf-0069", "부대시설:", ("drop", "ops.sauna·facilities.practice 에 동일 내용")),
    ("kr-golf-0090", "겨울 휴장:", ("drop", "facilities.closed_days 에 동일 문구")),
    ("kr-golf-0090", "카트:", ("set", "ops.cart_type", "리무진카트(18홀 4인 200,000원·5인 250,000원)")),
    ("kr-golf-0168", "노캐디 라운드 고객은", ("append", "ops.cart_type", "노캐디 라운드는 개인 카트 사용 불가(전동카트만)")),
    ("kr-golf-0183", "노캐디 라운드 고객은", ("append", "ops.cart_type", "노캐디 라운드는 개인 카트 사용 불가(전동카트만)")),
    ("kr-golf-0298", "2인 플레이:", ("drop", "ops.two_player 에 동일 문구")),
    ("kr-golf-0298", "정기 휴장일:", ("drop", "facilities.closed_days 에 동일 문구")),
    ("kr-golf-0298", "경기 시간:", ("append", "ops.pace", "18홀 5시간")),
    ("kr-golf-0298", "요금표상", ("set", "fee.note", "요금표상 팀당 카트비·캐디피 합계 240,000원")),
    ("kr-golf-0308", "야간(3부) 라운드:", ("drop", "facilities.night 에 동일 문구")),
    ("kr-golf-0308", "개장·설계", ("drop", "master.opened=2007")),
    ("kr-golf-0312", "캐디:", ("drop", "ops.nocaddie 에 동일 문구")),
    ("kr-golf-0312", "부대시설:", ("drop", "ops.sauna·facilities.practice 에 동일 내용")),
    ("kr-golf-0328", "캐디:", ("drop", "ops.nocaddie 에 동일 내용")),
    ("kr-golf-0328", "야간(3부) 라운드:", ("drop", "facilities.night 에 동일 문구")),
    ("kr-golf-0331", "캐디:", ("set", "ops.nocaddie", "노캐디(셀프) 라운드 가능, 팀당 20,000원 추가")),
    ("kr-golf-0331", "야간(3부) 라운드:", ("set", "facilities.night", "운영")),
    ("kr-golf-0343", "부대시설:", ("drop", "ops.sauna 에 동일 내용")),
    ("kr-golf-0343", "요금표상", ("set", "fee.note", "요금표상 팀당 카트비·캐디피 합계 220,000원")),
    ("kr-golf-0516", "정기 휴장일:", ("set", "facilities.closed_days", "매주 월요일")),
    ("kr-golf-0516", "카트:", ("set", "ops.cart_type", "리무진카트(6인승)·18홀 220,000원")),
    ("kr-golf-0516", "개장·설계", ("set", "briefing.course_notes", "1987년 개장·설계(2026-11 요금·휴장 안내 원문)")),
]

# 취소와 무관한 줄인지 판별(이관 표에 없는데 걸리면 남겨 두고 로그만)
NON_CANCEL_LINE = re.compile(
    r"^(?:캐디|노캐디|부대시설|부대\s*시설|정기\s*휴장일|휴장일|겨울\s*휴장|야간|개장|설계|경기\s*시간|요금표상|카트|그린피|입장료|잔디)"
)

POST_RE: list[tuple[tuple[str, str], re.Pattern, str]] = [
    (("ops", "two_player"), re.compile(r"^2인 (가능|불가|허용|금지)$"), r"\1"),
    (("ops", "three_player"), re.compile(r"^3인 (가능|불가|허용|금지)$"), r"\1"),
    (("ops", "five_player"), re.compile(r"^5인 (가능|불가|허용|금지)$"), r"\1"),
    (("ops", "locker"), re.compile(r"^락[커카] 운영$"), "운영"),
]

SAUNA_TOKEN = re.compile(r"^사우나(?:\s*(?:있음|없음))?$|^사우나\)$|^사우나\(.*\)$")

# 규칙을 다 돌린 뒤에도 라벨을 되풀이하는 짧은 값 — 화면에 남는 정보만 남긴다
POST: dict[tuple[str, str, str], str] = {
    ("ops", "mat", "전 홀 매트 티샷"): "전 홀",
    ("ops", "mat", "일부 홀 매트 티샷"): "일부 홀",
    ("ops", "mat", "운영 — 매트 티샷"): "운영",
    ("facilities", "practice", "숏게임 연습장"): "숏게임 전용",
    ("facilities", "practice", "40타석 연습장"): "40타석",
    ("facilities", "practice", "60타석 연습장(2018년 신설)"): "60타석(2018년 신설)",
    ("ops", "sauna", "락카룸·사우나"): "운영 · 락카룸",
    ("ops", "sauna", "락커·사우나"): "운영 · 락커",
    ("ops", "sauna", "락카·사우나실"): "운영 · 락카실",
    ("ops", "sauna", "락카실·사우나"): "운영 · 락카실",
    ("ops", "sauna", "운영 · 사우나 시설"): "운영",
    ("ops", "locker", "사우나·락카룸"): "운영 · 사우나",
    ("ops", "marshal_caddie", "마샬캐디 운영"): "운영",
    ("ops", "nocaddie", "전면 노캐디"): "전면 운영",
    ("facilities", "ev_charge", "전기차 충전시설 설치"): "설치",
    ("ops", "nocaddie", "2인 노캐디 불가"): "2인 불가",
    ("ops", "nocaddie", "전 홀 노캐디"): "전 홀",
    ("ops", "nocaddie", "3부 노캐디 운영"): "3부 운영",
    ("ops", "mat", "파3 홀 매트 티샷"): "파3 홀",
    ("ops", "locker", "남녀 락카시설"): "운영(남녀)",
    ("ops", "sauna", "온천 사우나 있음"): "운영(온천)",
    ("ops", "locker", "운영 · 사우나 운영(지하암반 천연온천)"): "운영 · 사우나(지하암반 천연온천)",
    ("ops", "locker", "락카룸과 사우나 시설 운영(락카 근무자 별도 봉사료 없음)"): "사우나 병설(근무자 별도 봉사료 없음)",
    ("facilities", "ev_charge", "전기차 충전시설 설치 완료 및 이용안내"): "설치 완료",
    ("facilities", "ev_charge", "전기차충전소 충전기 5대 (완속충전지원)"): "충전기 5대(완속)",
    ("ops", "nocaddie", "노캐디(셀프) 라운드 가능, 팀당 20,000원 추가"): "(셀프) 라운드 가능, 팀당 20,000원 추가",
    ("ops", "marshal_caddie", "마샬캐디(경기 진행위원) 운영"): "경기 진행위원 운영",
    ("ops", "marshal_caddie", "마샬캐디 100,000원/팀(오후·야간)"): "100,000원/팀(오후·야간)",
    ("ops", "three_player", "3인 플레이까지 가능"): "3인까지 가능",
    ("ops", "three_player", "3인 플레이부터 이용 가능"): "3인부터 이용 가능",
    ("ops", "two_player", "2인 플레이시 3인 그린피 적용"): "3인 그린피 적용",
}


def main() -> int:
    dry = "--dry-run" in sys.argv
    doc = json.load(open(SRC, encoding="utf-8"))

    for c in doc["courses"]:
        cid = c["course_id"]

        # ---------- 1) 플레이스홀더
        for sec in ("ops", "facilities"):
            for key, h in (c.get(sec) or {}).items():
                if not isinstance(h, dict):
                    continue
                for leaf in ("value", "value_previous", "text"):
                    if leaf in h:
                        new = scrub_placeholder(h[leaf])
                        if new != h[leaf]:
                            note(f"{cid} {sec}.{key}.{leaf}: {h[leaf]!r} → {new!r}")
                            h[leaf] = new
        if c["fee"].get("basis") == "official":
            c["fee"]["basis"] = "공식 요금표"
            note(f"{cid} fee.basis: 'official' → '공식 요금표'")
        # '미확인'만 남은 시설 값은 값이 아니다
        night = (c["facilities"].get("night") or {})
        if isinstance(night.get("value"), str) and "미확인" in night["value"]:
            note(f"{cid} facilities.night.value: {night['value']!r} → None (미확인)")
            night["value"] = None

        # ---------- concat 복원 (사우나 있음락커룸 → 사우나 있음 · 락커룸)
        for sec in ("ops", "facilities"):
            for key, h in (c.get(sec) or {}).items():
                if isinstance(h, dict) and isinstance(h.get("value"), str):
                    fixed = fix_concat(h["value"])
                    if fixed != h["value"]:
                        note(f"{cid} {sec}.{key}.value 이어붙임 복원: {h['value']!r} → {fixed!r}")
                        h["value"] = fixed

        # ---------- 2c) ops.locker / ops.sauna 오배치 (라벨을 걷기 전에 판별해야 문맥이 남는다)
        locker = (c["ops"].get("locker") or {}).get("value")
        sauna = (c["ops"].get("sauna") or {}).get("value")
        has_lock = lambda s: bool(re.search("락|라커|로커", s or ""))
        if isinstance(locker, str) and locker.startswith("사우나") and not has_lock(locker):
            if not sauna:
                set_value(c, "ops.sauna", locker, cid)
                note(f"{cid} ops.locker(사우나 내용) → ops.sauna 로 이동: {locker!r}")
            elif sauna != locker:
                append_value(c, "ops.sauna", " · ".join(filter(None, [sauna, locker])), cid)
                note(f"{cid} ops.locker 사우나 문구를 ops.sauna 에 합침: {locker!r}")
            set_value(c, "ops.locker", None, cid)
        if isinstance(sauna, str) and sauna.startswith("락") and "사우나" not in sauna:
            locker_now = (c["ops"].get("locker") or {}).get("value")
            if not locker_now:
                set_value(c, "ops.locker", sauna, cid)
                note(f"{cid} ops.sauna(락카 내용) → ops.locker 로 이동: {sauna!r}")
            elif locker_now != sauna:
                append_value(c, "ops.locker", sauna, cid)
            set_value(c, "ops.sauna", None, cid)

        # ---------- 2b) facilities.food/other 에 섞인 사우나
        fac = c["facilities"]
        sauna_now = (fac.get("locker_sauna") or {}).get("value") or (c["ops"].get("sauna") or {}).get("value")
        for key in ("food", "other"):
            h = fac.get(key)
            val = (h or {}).get("value")
            if not isinstance(val, str):
                continue
            parts = split_top(val)
            sauna_parts = [p for p in parts if SAUNA_TOKEN.match(p)]
            if not sauna_parts:
                continue
            keep = [p for p in parts if p not in sauna_parts]
            sauna_text = sauna_parts[0]
            value_only = "미운영" if "없음" in sauna_text else "운영"
            if not sauna_now:
                set_value(c, "facilities.locker_sauna", value_only, cid)
                note(f"{cid} {key} 에서 사우나 → facilities.locker_sauna={value_only!r}")
                sauna_now = value_only
            else:
                note(f"{cid} {key} 에서 사우나 문구 제거(이미 사우나 정보 있음): {sauna_text!r}")
            # 식당 타일에 연습장·프로샵 같은 비식음 시설이 섞여 있으면 원래 자리로 돌린다(라벨 정리 뒤에 처리)
            new = " · ".join(keep) if keep else None
            set_value(c, f"facilities.{key}", new, cid)

        # ---------- 3) 라벨 되풀이 정리
        for sec, labels in LABELS.items():
            for key, h in (c.get(sec) or {}).items():
                if not isinstance(h, dict) or key not in labels:
                    continue
                old = h.get("value")
                if not isinstance(old, str):
                    continue
                variants = [labels[key]] + [p for p in labels[key].split("·") if p]
                variants += EXTRA_VARIANTS.get((sec, key), [])
                new = old
                for lab in variants:
                    new = strip_label(lab, new)
                new = ALIAS.get((sec, key), {}).get(old, new)
                if new != old:
                    note(f"{cid} {sec}.{key}.value: {old!r} → {new!r}")
                    h["value"] = new

        # ---------- 식당 타일에 남은 비식음 시설(연습장·프로샵)은 제자리로
        food = (c["facilities"].get("food") or {}).get("value")
        if isinstance(food, str):
            tokens = split_top(food)
            prac = [t for t in tokens if re.search("연습장|레인지|퍼팅|벙커|어프로치", t)]
            shop = [t for t in tokens if re.search("프로샵|편의점|수영장", t)]
            if prac or shop:
                if prac:
                    append_tokens(c, "facilities.practice", prac, cid)
                    note(f"{cid} facilities.food 의 연습 시설 → facilities.practice: {prac}")
                if shop:
                    append_tokens(c, "facilities.other", shop, cid)
                    note(f"{cid} facilities.food 의 비식음 시설 → facilities.other: {shop}")
                keep = [t for t in tokens if t not in prac and t not in shop]
                set_value(c, "facilities.food", " · ".join(keep) if keep else None, cid)

        # ---------- 2a) 취소 필드에 섞인 타 항목 이관
        cp = c["cancel"].get("cancel_policy")
        if isinstance(cp, dict) and isinstance(cp.get("value"), str):
            kept: list[str] = []
            for raw in cp["value"].split("\n"):
                line = raw.strip()
                if not line:
                    continue
                body = line.lstrip("•·- ").strip()
                if not NON_CANCEL_LINE.match(body):
                    kept.append(raw)
                    continue
                route = next((r for (cid_, pref, r) in CANCEL_ROUTE if cid_ == cid and body.startswith(pref)), None)
                if route is None:
                    note(f"[UNROUTED] {cid} cancel: {body!r}")
                    kept.append(raw)
                    continue
                if route[0] == "drop":
                    note(f"{cid} cancel 에서 제거({route[1]}): {body!r}")
                elif route[0] == "set":
                    if route[1].startswith("fee."):
                        set_scalar(c, route[1], route[2], cid)
                    else:
                        set_value(c, route[1], route[2], cid)
                else:
                    append_value(c, route[1], route[2], cid)
            new = "\n".join(kept) if kept else None
            if new != cp["value"]:
                cp["value"] = new
                note(f"{cid} cancel.cancel_policy 정리 후: {new!r}")

        # ---------- 1b) 상태 안내에 남은 수집 기준일(내부 확인일) 제거
        def strip_date_meta(text: str) -> str:
            if not isinstance(text, str):
                return text
            out = text
            out = re.sub(r"\(\s*\d{4}-\d{2}-\d{2}\s*기준\s*([^()]*?)\s*\)", r"(\1)", out)
            out = re.sub(r"\d{4}-\d{2}-\d{2}\s*(?:기준|확인)\s*", "", out)
            out = re.sub(r"\s{2,}", " ", out).replace("( )", "").strip()
            return out

        for path in ("master.status_note", "master.expected_open", "master.project_stage", "briefing.alert.raw"):
            parts = path.split(".")
            node = c
            for k in parts[:-1]:
                node = node.get(k) if isinstance(node, dict) else None
            if not isinstance(node, dict) or not isinstance(node.get(parts[-1]), str):
                continue
            old = node[parts[-1]]
            new = strip_date_meta(old)
            if new != old:
                note(f"{cid} {path} 기준일 제거: {old!r} → {new!r}")
                node[parts[-1]] = new

        # ---------- 식당 타일과 기타 시설 타일에 같은 시설이 두 번 찍히지 않게
        food_v = (c["facilities"].get("food") or {}).get("value")
        other_h = c["facilities"].get("other")
        other_v = (other_h or {}).get("value")
        if isinstance(food_v, str) and isinstance(other_v, str):
            food_c = re.sub(r"\s", "", food_v)
            keep = [t for t in split_top(other_v) if re.sub(r"\s", "", t) not in food_c]
            if len(keep) != len(split_top(other_v)):
                new = " · ".join(keep) if keep else None
                note(f"{cid} facilities.other 식당 중복 제거: {other_v!r} → {new!r}")
                other_h["value"] = new

        # ---------- 마지막 다듬기: 라벨을 되풀이하는 짧은 값
        for sec in ("ops", "facilities"):
            for key, h in (c.get(sec) or {}).items():
                if not isinstance(h, dict):
                    continue
                val = h.get("value")
                fix = POST.get((sec, key, val)) if isinstance(val, str) else None
                if fix:
                    note(f"{cid} {sec}.{key}.value 마무리: {val!r} → {fix!r}")
                    h["value"] = fix

        # ---------- 라벨을 되풀이하는 짧은 값(정규식) — `2인 플레이 / 2인 불가` → `2인 플레이 / 불가`
        for (sec, key), pattern, repl in POST_RE:
            h = (c.get(sec) or {}).get(key)
            val = h.get("value") if isinstance(h, dict) else None
            if isinstance(val, str) and pattern.match(val):
                new = pattern.sub(repl, val)
                if new != val:
                    note(f"{cid} {sec}.{key}.value 마무리: {val!r} → {new!r}")
                    h["value"] = new

        # ---------- 같은 문구가 '현장 운영'·'부대시설' 두 타일에 찍히는 경우 하나만 남긴다
        sauna_v = (c["ops"].get("sauna") or {}).get("value")
        ls_v = (c["facilities"].get("locker_sauna") or {}).get("value")
        if isinstance(sauna_v, str) and isinstance(ls_v, str) and re.sub(r"\s", "", sauna_v) == re.sub(r"\s", "", ls_v):
            drop = "facilities.locker_sauna" if not re.search("락|라커|로커", sauna_v) else "ops.sauna"
            holder(c, drop)["value"] = None
            note(f"{cid} 두 타일 중복 문구 제거: {drop} = {sauna_v!r}")

    # ---------- 버전
    ds = doc["dataset"]
    if not dry:
        ds["version"] = "2.9.16"
        ds["master_version"] = (
            "2.9.16 (2026-11-28 잔여 정리 — 플레이스홀더 제거, 취소·시설 필드 오분류 이관, 타일 라벨-값 중복 정리)"
        )
        ds["built_at"] = "2026-11-28T15:30:00+09:00"

    if dry:
        print("\n".join(log))
        print(f"\n합계 {len(log)}건")
        return 0

    json.dump(doc, open(SRC, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("\n".join(log[-40:]))
    print(f"\n적용 {len(log)}건")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
