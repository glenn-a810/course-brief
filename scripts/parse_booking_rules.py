#!/usr/bin/env python3
"""예약 규칙 파싱 패스 — 취소 마감·위약(H2)과 예약 오픈(H3)을 계산 가능한 값으로 만든다.

원칙
- 원문(`cancel.cancel_policy`, `cancel.open_cycle`)은 **그대로 둔다**. 새 값은 보조 필드로만 더한다.
- 확실하지 않으면 만들지 않는다(`None`). 추측한 날짜·요율은 넣지 않고, 화면은 원문만 보여 준다.
- 모든 파싱 결과에는 `confidence`(high/medium/low)와 원문 발췌(`basis`)를 남겨 화면이 근거를 밝히게 한다.

산출
1) `data/v29/courses/{id}.json` 의 `cancel` 에
   - `parsed_cancel`: 무료 취소 마감(주중/주말/공통) + 위약 단계(일수·%·예약정지) + 기준(1인/팀)·대상(회원/비회원)
   - `parsed_open`  : 예약 오픈 규칙(주·일·개월 단위, 요일, 시각, 범위) + 방식(추첨/선착순/전화…)
   - `weather_summary`: 악천후 정산 규정에서 뽑은 짧은 문장(최대 2개)
2) `data/v29/booking_rules.json` — 위 두 값을 구장 id 로 모은 경량 파일(목록·내 구장 화면용, 원문 없음)
3) `data/v29/alerts.json` — 휴장·에어레이션·요금 변경 통합 캘린더(M3)용 항목

실행: python3 scripts/parse_booking_rules.py [--audit]
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V29 = os.path.join(ROOT, "data", "v29")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from haeyo import to_haeyo  # noqa: E402

WEEKDAYS = {"월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5, "일": 6}

# ---------------------------------------------------------------- 공통


def norm(text: str) -> str:
    t = text.replace("\u00a0", " ").replace("\u3000", " ")
    t = t.replace("ㆍ", "·").replace("〜", "~").replace("～", "~").replace("－", "-")
    t = re.sub(r"[ \t]{2,}", " ", t)
    return t.strip()


def clip(text: str, limit: int = 90) -> str:
    t = norm(text)
    return t if len(t) <= limit else t[: limit - 1].rstrip() + "…"


SENTENCE_SPLIT = re.compile(r"[\n;。]|(?<=\d)\.(?=\s|$)|\s*[•▪●○]\s*")
COMMA_SPLIT = re.compile(r"[,，](?![^()]*\))")
PARENS = re.compile(r"\([^()]*\)|\[[^\[\]]*\]")


def sentences(text: str) -> list[str]:
    return [norm(s) for s in SENTENCE_SPLIT.split(text) if norm(s)]


PAREN_LABEL = re.compile(r"\(\s*(주중|평일|주말|공휴일)[^()]*\)")


def strip_parens(text: str) -> str:
    """괄호 안은 조건·예외 설명인 경우가 많아 마감 계산에서 뺀다(원문은 그대로 보존).

    다만 괄호가 요일 구분(예: "3일 전(평일)·4일 전(주말)")이면 라벨로 살린다.
    """
    t = PAREN_LABEL.sub(lambda m: f" {m.group(1)} ", text)
    return norm(PARENS.sub(" ", t))


# ---------------------------------------------------------------- H2: 취소·위약

FREE_SIGNAL = re.compile(
    r"위약\s*(?:금)?\s*(?:없|미적용|없이)|무료|무벌점|패널티\s*(?:없|미적용)|벌점\s*없|"
    r"취소\s*가능|취소\s*권장|취소해야|환불|수수료\s*없|정상\s*취소|위약\s*미발생|예약금\s*전액"
)
PENALTY_MARK = re.compile(r"%|개월|예약\s*정지|예약\s*금지|위약|벌점|패널티|출입\s*정지|차감|배상")
DEADLINE_TUPLE = re.compile(r"(\d{1,3})\s*(?:~\s*(\d{1,3}))?\s*(일|시간)\s*(?:이)?전")
TIME_AFTER = re.compile(r"\s*(\d{1,2})\s*(?::|시)\s*(\d{2})?")
PCT_RE = re.compile(r"(\d{1,2}(?:\.\d+)?)\s*%")
MONTH_RE = re.compile(r"(\d{1,3})\s*개월")
SUSPEND_DAY = re.compile(r"(\d{1,3})\s*일\s*(?:예약)?\s*정지")
DAY_LABEL = re.compile(r"(주중|평일|주말|공휴일|휴일)")
BASIS_TEAM = re.compile(r"팀\s*(?:당|별|이용요금|기준)|4인\s*(?:이용)?요금")
BASIS_PERSON = re.compile(r"1인|인당|개인\s*요금")


BOTH_LABEL = re.compile(r"모두|공통|동일|구분\s*없|양일|평일·주말|주중·주말|주말·평일|주말·주중")


def label_of(text: str, pos: int, window: int = 16) -> str | None:
    """튜플 앞쪽 가까운 곳의 주중/주말 라벨. 없으면 None(공통).

    "주중·주말", "평일·주말 모두"처럼 둘을 함께 적은 구간은 공통으로 읽는다.
    """
    head = text[max(0, pos - window):pos]
    found = list(DAY_LABEL.finditer(head))
    if not found:
        return None
    if len({m.group(1) for m in found}) >= 2 or BOTH_LABEL.search(head):
        return None
    lab = found[-1].group(1)
    return "weekday" if lab in ("주중", "평일") else "weekend"


def label_after(text: str, pos: int) -> str | None:
    """튜플 바로 뒤에 붙은 라벨 — "3일 전(평일)"·"3일 전 평일" 형태."""
    m = re.match(r"[\s·]*\(?\s*(주중|평일|주말|공휴일)", text[pos:pos + 12])
    if not m:
        return None
    return "weekday" if m.group(1) in ("주중", "평일") else "weekend"


def nearest_label(text: str, start: int, end: int) -> str | None:
    """앞·뒤 라벨 중 더 가까운 쪽. "주중 3일 전·주말 4일 전"처럼 라벨이 앞뒤로 붙는 표기를 가른다."""
    base = max(0, start - 16)
    head = text[base:start]
    if BOTH_LABEL.search(head):
        return None
    best: tuple[int, str] | None = None
    found = list(DAY_LABEL.finditer(head))
    if found:
        m = found[-1]
        best = (start - (base + m.end()), _lab(m.group(1)))
    m2 = re.match(r"[\s·]*\(?\s*(주중|평일|주말|공휴일)", text[end:end + 12])
    if m2:
        cand = (m2.start(1), _lab(m2.group(1)))
        if best is None or cand[0] < best[0]:
            best = cand
    return best[1] if best else None


def _lab(word: str) -> str:
    return "weekday" if word in ("주중", "평일") else "weekend"


def parse_cancel(text: str | None) -> dict | None:
    if not isinstance(text, str):
        return None
    raw = norm(text)
    if len(raw) < 4:
        return None

    free: dict[str, dict] = {}
    penalty: list[dict] = []
    free_basis: list[str] = []
    penalty_basis: list[str] = []
    scope_member = bool(re.search(r"회원", raw)) and not re.search(r"비회원|일반\s*고객", raw)
    basis = "team" if BASIS_TEAM.search(raw) else ("person" if BASIS_PERSON.search(raw) else "unknown")
    deadline_only: list[tuple[str | None, int, str | None, str]] = []

    for sent in sentences(strip_parens(raw)):
        sent_free = bool(FREE_SIGNAL.search(sent))
        for cl in COMMA_SPLIT.split(sent):
            cl = norm(cl)
            tuples = list(DEADLINE_TUPLE.finditer(cl))
            if not tuples:
                continue
            cl_penalty = bool(PENALTY_MARK.search(cl))
            # 문장 어딘가에 무료 취소 표현이 있고 이 조각에 위약 표시가 없으면 무료 마감으로 읽는다
            is_free = bool(FREE_SIGNAL.search(cl)) or (sent_free and not cl_penalty)
            # 무료/위약 표시가 전혀 없는 "N일 전까지"는 마감 후보로만 모아 둔다(문장 전체에 무료 표현이 있을 때만 채택)
            if not is_free and not cl_penalty and re.search(r"까지|가능|이내", cl):
                found_t = [t for t in (time_in(cl[m.end(): tuples[i + 1].start() if i + 1 < len(tuples) else len(cl)], "")
                                       for i, m in enumerate(tuples)) if t]
                shared = found_t[0] if len(set(found_t)) == 1 else None
                for i, m in enumerate(tuples):
                    tail = cl[m.end(): tuples[i + 1].start() if i + 1 < len(tuples) else len(cl)]
                    deadline_only.append((label_of(cl, m.start()), max(int(m.group(1)), int(m.group(2)) if m.group(2) else int(m.group(1))),
                                          time_in(tail, "") or shared, cl))
                continue
            times = {tm for tm in (time_in(cl[m.end(): tuples[i + 1].start() if i + 1 < len(tuples) else len(cl)], "")
                                   for i, m in enumerate(tuples)) if tm}
            only_time = next(iter(times)) if len(times) == 1 else None
            for i, m in enumerate(tuples):
                lo = int(m.group(1))
                hi = int(m.group(2)) if m.group(2) else None
                days = max(lo, hi) if hi is not None else lo
                if m.group(3) == "시간":
                    continue  # 시간 단위 마감은 일 단위로 환산하지 않는다
                tail = cl[m.end(): tuples[i + 1].start() if i + 1 < len(tuples) else len(cl)]
                lab = nearest_label(cl, m.start(), m.end())
                t = time_in(tail, "") or only_time
                if is_free:
                    slot = free.setdefault(lab or "common", {})
                    if "days_before" not in slot or days > slot["days_before"]:
                        slot["days_before"] = days
                    if t:
                        slot["time"] = t
                    if len(free_basis) < 2:
                        free_basis.append(clip(cl))
                else:
                    pm = PCT_RE.search(tail)
                    mm = MONTH_RE.search(tail)
                    dm = SUSPEND_DAY.search(tail)
                    if pm is None and mm is None and dm is None and not re.search(r"위약|패널티|배상|차감", cl):
                        continue
                    penalty.append({
                        "day": lab,
                        "from_days": lo,
                        "to_days": hi if hi is not None else lo,
                        "pct": float(pm.group(1)) if pm else None,
                        "suspend_months": int(mm.group(1)) if mm else None,
                        "suspend_days": int(dm.group(1)) if dm else None,
                        "text": clip(cl, 70),
                    })
                    if len(penalty_basis) < 3:
                        penalty_basis.append(clip(cl))

    # 무료 마감을 하나도 못 읽었으면, "N일 전까지" 마감 후보로 채운다(신뢰도 medium)
    used_deadline_only = False
    if not free and deadline_only:
        for lab, days, t, cl in deadline_only:
            slot = free.setdefault(lab or "common", {})
            if "days_before" not in slot or days > slot["days_before"]:
                slot["days_before"] = days
            if t:
                slot["time"] = t
            used_deadline_only = True
        free_basis = [clip(x[3]) for x in deadline_only[:2]]

    # 같은 조건이 중복되면 하나만
    seen = set()
    uniq: list[dict] = []
    for p in penalty:
        key = (p["day"], p["from_days"], p["to_days"], p["pct"], p["suspend_months"], p["suspend_days"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(p)
    uniq.sort(key=lambda p: (p["from_days"], p["to_days"]))
    penalty = uniq

    if not free and not penalty:
        return None

    common = free.get("common")
    if common:
        for k in ("weekday", "weekend"):
            free.setdefault(k, dict(common))

    has_both = "weekday" in free and "weekend" in free
    timed = all(v.get("time") for v in free.values()) if free else False
    if has_both and timed:
        confidence = "high"
    elif has_both or (free and timed):
        confidence = "medium"
    elif free:
        confidence = "medium"
    else:
        confidence = "low"  # 무료 마감은 못 읽고 위약 단계만 읽은 경우
    if used_deadline_only and confidence == "high":
        confidence = "medium"
    if scope_member and confidence == "high":
        confidence = "medium"

    return {
        "free": {k: free[k] for k in ("weekday", "weekend") if k in free},
        "penalty": penalty,
        "basis": basis,
        "scope": "member" if scope_member else ("non_member" if re.search(r"비회원", raw) else "unknown"),
        "confidence": confidence,
        "basis_text": free_basis,
        "penalty_text": penalty_basis,
    }


def time_in(after: str, fallback: str) -> str | None:
    m = TIME_AFTER.match(after)
    if not m:
        return None
    hh = int(m.group(1))
    mm = int(m.group(2)) if m.group(2) else 0
    if not (0 <= hh <= 24 and 0 <= mm <= 59):
        return None
    return f"{hh:02d}:{mm:02d}"


# ---------------------------------------------------------------- H3: 예약 오픈

OPEN_TUPLE = re.compile(r"(\d{1,3})\s*(주|달|개월|일)\s*(?:이)?(?:전|후|뒤)")
REL_WEEK = re.compile(r"(전전주|전주|지난주|차주|다음주)\s*(?:\s*(월|화|수|목|금|토|일)\s*요일)?")
D_DAY = re.compile(r"\bD\s*-\s*(\d{1,3})")
METHODS = [
    ("추첨", "lottery"), ("선착순", "fcfs"), ("인터넷", "online"), ("온라인", "online"),
    ("모바일", "online"), ("전화", "phone"), ("현장", "onsite"),
]
RECURRING = re.compile(r"매주|매월|매일|매달|첫\s*번째|마지막\s*주|매\s*주|매\s*월")
WD_AFTER = re.compile(r"\s*(월|화|수|목|금|토|일)\s*(?:요일)?")
WD_BEFORE = re.compile(r"(월|화|수|목|금|토|일)\s*요일\s*$|(?<![\w가-힣])(월|화|수|목|금|토|일)\s*요일")
SCOPE_LABEL = re.compile(r"(주중|평일|주말|공휴일|휴일)")
MEMBER_LABEL = re.compile(r"(비회원|일반\s*고객|정회원|준회원|주중회원|웹회원|우대회원|회원)")


def scope_of(text: str, pos: int, window: int = 18) -> str:
    head = text[max(0, pos - window):pos]
    if BOTH_LABEL.search(head) or re.search(r"(주중|평일)\s*[·,]\s*(주말|공휴일|휴일)", head):
        return "both"
    found = list(SCOPE_LABEL.finditer(head))
    if not found:
        return "both"
    return "weekday" if found[-1].group(1) in ("주중", "평일") else "weekend"


def member_of(text: str, pos: int, window: int = 16) -> str | None:
    head = text[max(0, pos - window):pos]
    found = list(MEMBER_LABEL.finditer(head))
    if not found:
        return None
    return found[-1].group(1).replace(" ", "")


def time_after(seg: str) -> str | None:
    """구간 앞부분의 시각. 괄호·조사 같은 잡음이 사이에 있어도 12자 안에서 찾는다."""
    m = re.match(r"[^0-9]{0,12}?(?:오전|오후)?\s*(\d{1,2})\s*(?::|시)\s*(\d{2})?", seg)
    if not m:
        return None
    h = int(m.group(1))
    mi = int(m.group(2)) if m.group(2) else 0
    pre = seg[max(0, m.start() - 4):m.start() + 6]
    if "오후" in pre and h < 12:
        h += 12
    if not (0 <= h <= 24 and 0 <= mi <= 59):
        return None
    return f"{h:02d}:{mi:02d}"


def parse_open(text: str | None) -> dict | None:
    if not isinstance(text, str):
        return None
    raw = norm(text)
    if len(raw) < 4:
        return None
    scan = strip_parens(raw)
    rules: list[dict] = []
    for m in OPEN_TUPLE.finditer(scan):
        unit_raw = m.group(2)
        unit = {"주": "week", "달": "month", "개월": "month", "일": "day"}[unit_raw]
        before = int(m.group(1))
        tail = scan[m.end():m.end() + 22]
        wd_m = WD_AFTER.match(tail)
        wd = wd_m.group(1) if wd_m else None
        # "같은 요일"·"해당 요일"은 요일을 고정하지 않는다
        timeseg = tail[len(wd_m.group(0)):] if wd_m else tail
        rules.append({
            "scope": scope_of(scan, m.start()),
            "unit": unit,
            "before": before,
            "weekday": wd,
            "time": time_after(timeseg),
            "member": member_of(scan, m.start()),
            "text": clip(m.group(0) + (wd_m.group(0) if wd_m else ""), 40),
        })
    # "전주 수요일"·"다음주 금요일" 같은 상대 주 표현
    for m in REL_WEEK.finditer(scan):
        back = 2 if m.group(1) == "전전주" else 1
        if any(r["unit"] == "week" and r["before"] == back for r in rules):
            continue
        wd = m.group(2)
        rules.append({
            "scope": scope_of(scan, m.start()),
            "unit": "week",
            "before": back,
            "weekday": wd,
            "time": time_after(scan[m.end():m.end() + 22]),
            "member": member_of(scan, m.start()),
            "text": clip(m.group(0), 30),
        })
    if not rules and D_DAY.search(scan):
        for m in D_DAY.finditer(scan):
            rules.append({
                "scope": scope_of(scan, m.start()), "unit": "day", "before": int(m.group(1)),
                "weekday": None, "time": time_after(scan[m.end():m.end() + 12]),
                "member": None, "text": clip(m.group(0), 30),
            })

    # 매월 N일(또는 첫 번째 X요일) 정기 오픈
    monthly: list[dict] = []
    if re.search(r"매월|매달|매\s*월", scan):
        for m in re.finditer(r"(?:매월|매달|매\s*월)\s*(?:첫\s*번째\s*)?(\d{1,2})\s*일", scan):
            monthly.append({"day": int(m.group(1)), "weekday": None,
                            "time": time_after(scan[m.end():m.end() + 16]),
                            "scope": scope_of(scan, m.start())})
        for m in re.finditer(r"(?:매월|매달|매\s*월)\s*(?:첫\s*번째|마지막)\s*(월|화|수|목|금|토|일)요일", scan):
            monthly.append({"day": None, "weekday": m.group(1),
                            "time": time_after(scan[m.end():m.end() + 16]),
                            "scope": scope_of(scan, m.start()), "ordinal": "first"})
    if not rules and not monthly:
        return None

    # 비회원 규정이 따로 있으면 그것을 우선한다(화면은 '비회원 기준'을 밝힌다)
    scope_tag = "unknown"
    non_member = [r for r in rules if r["member"] and r["member"] != "회원" and "비회원" in r["member"]]
    if non_member:
        rules = non_member + [r for r in rules if not r["member"]]
        scope_tag = "non_member"
    elif any(r["member"] for r in rules):
        scope_tag = "member"

    # 범위·값이 같은 규칙은 하나만
    seen = set()
    uniq: list[dict] = []
    for r in rules:
        key = (r["scope"], r["unit"], r["before"], r["weekday"], r["time"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(r)

    method = None
    for word, code in METHODS:
        if word in raw:
            method = code
            break
    weekly = re.search(r"매주\s*(월|화|수|목|금|토|일)", scan)
    recurring = bool(RECURRING.search(scan)) or bool(monthly)
    befores = {r["before"] for r in uniq if r["scope"] != "both"} or {r["before"] for r in uniq}
    ambiguous = len(befores) > 1

    has_time = any(r["time"] for r in uniq)
    has_weekday = any(r["weekday"] for r in uniq)
    if method == "lottery" or ambiguous:
        confidence = "low"
    elif recurring and not uniq:
        confidence = "low"
    elif has_time and (has_weekday or weekly):
        confidence = "high"
    else:
        confidence = "medium"
    if recurring and confidence == "high":
        confidence = "medium"  # 정기 오픈은 날짜 계산이 오늘 기준이라 한 단계 낮춘다
    if scope_tag == "member" and confidence == "high":
        confidence = "medium"

    return {
        "rules": uniq,
        "monthly": monthly[:3],
        "weekly": {"weekday": weekly.group(1), "time": time_after(scan[weekly.end():weekly.end() + 16])} if weekly else None,
        "method": method,
        "recurring": recurring,
        "member_only": scope_tag == "member",
        "scope": scope_tag,
        "ambiguous": ambiguous,
        "confidence": confidence,
        "text": clip(raw, 120),
    }


# ---------------------------------------------------------------- M1: 악천후 정산 문장

WEATHER_KW = re.compile(r"악천후|우천|기상|비가|눈이|강수|강설|안개|낙뢰|태풍|환불|정산|중단")
WEATHER_NOISE = re.compile(r"구분|비고|이용요금안내|1부|2부|그린피|카트료")


def weather_summary(evidence: list | None) -> list[str]:
    out: list[str] = []
    for raw in (evidence or [])[:8]:
        if not isinstance(raw, str):
            continue
        t = norm(raw).replace("※", " ").replace("·", " ")
        for sent in re.split(r"(?<=[.!?。])\s+|[\n]", t):
            s = norm(sent)
            if not (10 <= len(s) <= 130):
                continue
            if not WEATHER_KW.search(s):
                continue
            if WEATHER_NOISE.search(s):
                continue
            digits = len(re.findall(r"\d", s))
            if digits > len(s) * 0.25:
                continue
            if re.search(r"미확인|확인\s*안\s*됨", s):
                continue
            s = re.sub(r"^[-–—•\s]+", "", s)
            s = to_haeyo(s)  # 화면에 그대로 나가는 문장 — 해요체로 맞춘다
            if s and s not in out:
                out.append(s)
            if len(out) >= 2:
                return out
    return out


# ---------------------------------------------------------------- M3: 통합 캘린더

KIND_RULES = [
    ("aeration", re.compile(r"에어레이션|통기|그린\s*갱신|그린갱신|배토|코어링|잔디\s*(?:보수|관리|작업)")),
    ("closure", re.compile(r"휴장|휴무|임시\s*휴|영업\s*중단|운영\s*중단|결장|동계\s*휴|하계\s*휴|개장\s*연기")),
    ("fee_change", re.compile(r"(?:그린피|요금|가격)[^.]{0,14}?(?:변경|조정|인상|인하)")),
]
EXCLUDE_NOTICE = re.compile(r"테니스|수영|스키|콘도|회원\s*모집|채용|입찰|분양|쿠폰|이벤트|특가|대회|모집|행사|축제")

FULL_RANGE = re.compile(
    r"(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?\s*[~\-–]\s*"
    r"(?:(20\d{2})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?"
)
FULL_DATE = re.compile(r"(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?")
# "12월 21일(월)" — 요일까지 적힌 제목은 그 요일이 맞는 해를 골라 연도를 정한다(추측이 아니라 검산)
MONTH_DAY_WD = re.compile(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*\(?\s*(월|화|수|목|금|토|일)\s*\)?\s*요일?")
WD_INDEX = {"월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5, "일": 6}
# 연도 없이 월·일만 있는 제목 — 게시일과 가장 가까운 해를 고른다(같은 해 아니면 전/후 1년)
MD_PLAIN = re.compile(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일")
MD_RANGE = re.compile(r"(\d{1,2})\s*/\s*(\d{1,2})\s*[~\-]\s*(\d{1,2})(?!\d)")


def iso(y: str, m: str, d: str) -> str | None:
    try:
        return date(int(y), int(m), int(d)).isoformat()
    except ValueError:
        return None


def dates_from_title(title: str, anchor: date | None = None) -> tuple[str | None, str | None]:
    m = FULL_RANGE.search(title)
    if m:
        y1, m1, d1, y2, m2, d2 = m.groups()
        start = iso(y1, m1, d1)
        end = iso(y2 or y1, m2, d2)
        if start and end:
            return start, end
    m2 = FULL_DATE.search(title)
    if m2:
        start = iso(*m2.groups())
        if start:
            return start, start
    if anchor:
        best: date | None = None
        for m3 in MONTH_DAY_WD.finditer(title):
            mo, d, wd = m3.groups()
            for y in (anchor.year - 1, anchor.year, anchor.year + 1):
                try:
                    cand = date(y, int(mo), int(d))
                except ValueError:
                    continue
                if cand.weekday() != WD_INDEX[wd]:
                    continue
                if abs((cand - anchor).days) > 400:
                    continue
                if best is None or abs((cand - anchor).days) < abs((best - anchor).days):
                    best = cand
        if best:
            return best.isoformat(), best.isoformat()
        best_md: date | None = None
        for m4 in MD_PLAIN.finditer(title):
            near = title[max(0, m4.start() - 10):m4.end() + 12]
            if not re.search(r"휴장|휴무|에어레이션|정비|공사|중단|통기|개장", near):
                continue
            mo, d = m4.groups()
            for y in (anchor.year - 1, anchor.year, anchor.year + 1):
                try:
                    cand = date(y, int(mo), int(d))
                except ValueError:
                    continue
                if abs((cand - anchor).days) > 300:
                    continue
                if best_md is None or abs((cand - anchor).days) < abs((best_md - anchor).days):
                    best_md = cand
        if best_md:
            return best_md.isoformat(), best_md.isoformat()
    return None, None


def classify_notice(title: str) -> str | None:
    if EXCLUDE_NOTICE.search(title):
        return None
    for kind, rx in KIND_RULES:
        if rx.search(title):
            return kind
    return None


def collect_alerts(courses: list[dict]) -> dict:
    items: list[dict] = []
    for c in courses:
        master = c.get("master") or {}
        base = {
            "id": c["course_id"],
            "name": c["meta"]["name"],
            "sido": master.get("sido") or "",
            "sigungu": master.get("sigungu") or "",
            "status": master.get("status") or "operating",
        }
        br = c.get("briefing") or {}
        alert = br.get("alert")
        if isinstance(alert, dict):
            period = alert.get("period")
            frm = to = reopen = None
            if isinstance(period, dict):
                frm, to, reopen = period.get("from"), period.get("to"), period.get("reopen")
            elif isinstance(period, str):
                frm, to = dates_from_title(period)
            title = (alert.get("summary") or "").strip()
            text = f"{title} {alert.get('detail') or ''}"
            if re.search(r"휴장|휴무|중단|영업\s*종료|폐업", text):
                kind = "closure"
            else:
                kind = classify_notice(title) or "notice"
            if re.search(r"정상\s*운영|휴장\s*(?:없|공지\s*없)|휴장하지", title) and not frm:
                kind = "note"  # "동계 휴장 없이 정상 운영" — 일정이 아니라 참고
            items.append({
                **base, "kind": kind, "source": "alert", "title": clip(title, 90),
                "from": frm, "to": to, "reopen": reopen,
                "confirmed": bool(alert.get("confirmed")), "level": alert.get("level") or "info",
                "detail": clip(alert.get("detail") or "", 160),
                "url": alert.get("source_url") if isinstance(alert.get("source_url"), str) else None,
                "updated": alert.get("checked_at") or "",
            })
        for it in ((br.get("notices") or {}).get("items") or []):
            title = (it.get("title") or "").strip()
            if len(title) < 4:
                continue
            kind = classify_notice(title)
            if not kind:
                continue
            posted = None
            if isinstance(it.get("date"), str) and len(it["date"]) >= 10:
                try:
                    posted = date.fromisoformat(it["date"][:10])
                except ValueError:
                    posted = None
            # "매월 셋째 월요일 휴장"처럼 되풀이되는 규칙은 한 날짜로 달력에 올리지 않는다
            if RECURRING.search(title):
                frm, to = None, None
            else:
                frm, to = dates_from_title(title, posted)
            items.append({
                **base, "kind": kind, "source": "notice", "title": clip(title, 80),
                "from": frm, "to": to, "reopen": None, "confirmed": False, "level": "info",
                "detail": "", "url": None, "updated": it.get("date") or "",
            })
    seen = set()
    uniq = []
    for it in items:
        key = (it["id"], it["title"], it["from"], it["kind"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(it)
    uniq.sort(key=lambda x: (x["from"] or "9999", x["name"]))
    return {
        "dataset": {
            "built_at": "",
            "count": len(uniq),
            "with_period": sum(1 for x in uniq if x["from"]),
            "note": "확인된 운영 알림(alert)과 공지 제목에서 기간을 읽은 항목. 기간을 읽지 못한 항목은 '일정 미상'으로 표시합니다.",
        },
        "items": uniq,
    }


# ---------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audit", action="store_true", help="표본 검수 파일(tmp/parse_audit.txt) 생성")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(V29, "courses", "*.json")))
    if not files:
        print("data/v29/courses 가 없습니다. 먼저 npm run data:build", file=sys.stderr)
        return 1

    courses = []
    stats = {"cancel": 0, "cancel_high": 0, "open": 0, "open_high": 0, "weather": 0}
    rules: dict[str, dict] = {}
    audit: list[str] = []

    for path in files:
        with open(path, encoding="utf-8") as fp:
            course = json.load(fp)
        courses.append(course)
        cancel = course.get("cancel") or {}
        policy = cancel.get("cancel_policy")
        text = policy.get("value") if isinstance(policy, dict) else policy
        pc = parse_cancel(text)
        po = parse_open(cancel.get("open_cycle"))
        ws = weather_summary(cancel.get("weather_evidence"))

        # 기존 파싱 결과는 지우고 다시 만든다(재실행 안전)
        for k in ("parsed_cancel", "parsed_open", "weather_summary"):
            cancel.pop(k, None)
        if pc:
            cancel["parsed_cancel"] = pc
            stats["cancel"] += 1
            stats["cancel_high"] += 1 if pc["confidence"] == "high" else 0
        if po:
            cancel["parsed_open"] = po
            stats["open"] += 1
            stats["open_high"] += 1 if po["confidence"] == "high" else 0
        if ws:
            cancel["weather_summary"] = ws
            stats["weather"] += 1
        course["cancel"] = cancel

        if pc or po:
            entry: dict = {}
            if pc:
                entry["cancel"] = {
                    "free": pc["free"],
                    "penalty": [
                        {k: p[k] for k in ("day", "from_days", "to_days", "pct", "suspend_months")}
                        for p in pc["penalty"][:6]
                    ],
                    "basis": pc["basis"], "scope": pc["scope"], "confidence": pc["confidence"],
                }
            if po:
                entry["open"] = {
                    "rules": [{k: r[k] for k in ("scope", "unit", "before", "weekday", "time")}
                              for r in po["rules"][:4]],
                    "monthly": po["monthly"][:2], "weekly": po["weekly"],
                    "method": po["method"], "recurring": po["recurring"],
                    "member_only": po["member_only"], "ambiguous": po["ambiguous"],
                    "confidence": po["confidence"],
                }
            rules[course["course_id"]] = entry

        if args.audit and (pc or po):
            audit.append(f"## {course['course_id']} {course['meta']['name']}")
            if text:
                audit.append(f"  원문(취소): {norm(text)[:240]}")
            if pc:
                audit.append(f"  파싱(취소): {json.dumps(pc['free'], ensure_ascii=False)} "
                             f"위약 {pc['penalty']} 기준 {pc['basis']} 신뢰 {pc['confidence']}")
            if cancel.get("open_cycle"):
                audit.append(f"  원문(오픈): {norm(cancel['open_cycle'])[:220]}")
            if po:
                audit.append(f"  파싱(오픈): {json.dumps(po['rules'], ensure_ascii=False)} "
                             f"방식 {po['method']} 반복 {po['recurring']} 신뢰 {po['confidence']}")
            if ws:
                audit.append(f"  악천후: {ws}")
            audit.append("")

        with open(path, "w", encoding="utf-8") as fp:
            json.dump(course, fp, ensure_ascii=False, indent=1)
            fp.write("\n")

    with open(os.path.join(V29, "index.json"), encoding="utf-8") as fp:
        index = json.load(fp)
    built_at = index.get("dataset", {}).get("built_at", "")

    booking = {
        "dataset": {
            "built_at": built_at,
            "note": "취소·예약 오픈 규칙의 계산용 요약. 원문과 근거는 courses/{id}.json 의 cancel 에 있습니다.",
            "parsed_cancel": stats["cancel"],
            "parsed_open": stats["open"],
            "with_cancel_policy": sum(1 for c in courses if (c.get("cancel") or {}).get("cancel_policy")),
            "with_open_cycle": sum(1 for c in courses if (c.get("cancel") or {}).get("open_cycle")),
        },
        "rules": rules,
    }
    with open(os.path.join(V29, "booking_rules.json"), "w", encoding="utf-8") as fp:
        json.dump(booking, fp, ensure_ascii=False, separators=(",", ":"))
        fp.write("\n")

    alerts = collect_alerts(courses)
    alerts["dataset"]["built_at"] = built_at
    with open(os.path.join(V29, "alerts.json"), "w", encoding="utf-8") as fp:
        json.dump(alerts, fp, ensure_ascii=False, separators=(",", ":"))
        fp.write("\n")

    if args.audit:
        os.makedirs(os.path.join(ROOT, "tmp"), exist_ok=True)
        with open(os.path.join(ROOT, "tmp", "parse_audit.txt"), "w", encoding="utf-8") as fp:
            fp.write("\n".join(audit))
        print("검수 파일: tmp/parse_audit.txt")

    print(f"취소 파싱 {stats['cancel']}곳(high {stats['cancel_high']}) · "
          f"오픈 파싱 {stats['open']}곳(high {stats['open_high']}) · 악천후 문장 {stats['weather']}곳")
    print(f"alerts {alerts['dataset']['count']}건(기간 있음 {alerts['dataset']['with_period']}) · "
          f"booking_rules {len(rules)}곳")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
