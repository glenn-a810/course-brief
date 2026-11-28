#!/usr/bin/env python3
"""CourseBrief — 일반 사용자 화면에 노출되는 공지·브리핑 텍스트에서 수집 출처·확인일 메타를 걷어낸다.

대상(data/source/golf_courses_all_v29.json → data/v29 산출물):
  briefing.recent_notice_text, briefing.course_notes,
  briefing.alert.summary / alert.detail,
  briefing.review.note,
  briefing.notices.items[].title

남기는 것: 골프장이 실제로 안내한 운영 내용(휴장·요금·예약 규칙·이용안내).
버리는 것: 수집 채널 이름/라벨("카카오골프예약 '골프장에서 알립니다'"), 확인일 표기
  ("(2026-11-27 확인)", "(2026-11-27 기준)"), 수집 실패·도메인 무응답 같은 수집 상태 설명,
  그리고 그런 설명만으로 된 문장.

출처 자체는 briefing.sources / fee.sources / review.source / official_reason 등
관리자 전용 필드에 그대로 남는다.

사용:
  python3 scripts/clean_visible_meta.py --check      # 남은 노출 건수만 보고(파일 수정 없음)
  python3 scripts/clean_visible_meta.py              # 정리 후 덮어쓰기
  python3 scripts/clean_visible_meta.py --dry        # 변경 전/후 미리보기
"""
from __future__ import annotations

import argparse
import json
import re
import sys

SRC = "data/source/golf_courses_all_v29.json"

# --- 1) 수집 채널 라벨(접두사) -------------------------------------------------
# "카카오골프예약 '골프장에서 알립니다'(2026-11-27 확인): 내용" → "내용"
LABEL_PREFIX = [
    re.compile(r"카카오골프예약\s*['\"‘’“”]\s*골프장에서\s*알립니다\s*['\"‘’“”]\s*(?:\([^()]*\))?\s*[:：]\s*"),
    re.compile(r"카카오골프예약\s*['\"‘’“”]\s*골프장에서\s*알립니다\s*['\"‘’“”]\s*(?:\([^()]*\))?\s*"),
    re.compile(r"\[\s*카카오[^\]]*?안내\s*\]\s*"),
]

# --- 2) 확인일·기준일 표기 -----------------------------------------------------
# "(2026-11-27 확인)", "(광산CC 공식 홈페이지, 2026-11-27 확인)", "(2026-11-26 기준)"
CONFIRM_PAREN = re.compile(
    r"\s*\([^()]*?(?:\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2})\s*(?:확인|기준)[^()]*?\)"
)
# "2026-11-27 확인 시 홈페이지에 …" 처럼 점검 시점을 이르는 말은 통째로 뺀다
DATE_MARK_AT = re.compile(r"(?<![가-힣\d])(?:\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2})\s*(?:확인|점검)\s*(?:시|당시|기준)\s*")
# "2026-11-26 확인: 7.8/10" 처럼 라벨 뒤에 콜론이 붙은 확인일
DATE_MARK_COLON = re.compile(r"(?<![가-힣\d])(?:\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2})\s*(?:확인|기준)\s*[:：]\s*")
BARE_DATE_MARK = re.compile(r"(?<![가-힣\d])\d{4}-\d{2}-\d{2}\s*(?:확인|기준)(?![가-힣])")

# --- 3) 수집 상태 설명 문장 ---------------------------------------------------
COLLECTION_SENTENCE = re.compile(
    r"보완했다|응답하지\s*않|도메인이\s*응답|접속되지\s*않|접속\s*차단|접속\s*불가|접속\s*실패|"
    r"페이지\s*차단|수집\s*실패|수집\s*불가|HTTP\s*[45]\d\d|응답\s*없음|타임\s*아웃"
)

# "2026년 10~11월 공지 미확인" 처럼 '우리가 공지를 못 찾았다'는 수집 상태만 적은 문장.
# 골프장이 안내한 내용이 아니므로 일반 화면 문장에서 뺀다(관리자 화면의 unconfirmed 목록에 남는다).
# 문장 처음부터 "… 공지 …"만 말하는 문장에만 적용한다 — 어떤 사실 뒤에 붙은 보조절은 건드리지 않는다.
NOTICE_COLLECTION_SENTENCE = re.compile(
    r"^(?:[^.\n]{0,30}?)(?:공지|공지사항)[^.\n]{0,60}?"
    r"(?:미확인|미인지|미게시|확인되지\s*않[^.\n]{0,6})(?:\s*\([^()]*\))?[.]?$"
)

# --- 4) 남은 채널 브랜드명 → 중립 표기 -----------------------------------------
BRAND = [
    (re.compile(r"카카오골프예약|카카오\s*골프예약"), "온라인 예약"),
    (re.compile(r"스마트스코어"), "공개 예약 채널"),
    (re.compile(r"그린피가이드"), "공개 요금 정보"),
    (re.compile(r"티픽골프장|티픽"), "공개 예약 채널"),
    # 치환 뒤 어색해지는 조사·중복 표현만 다듬는다
    (re.compile(r"온라인 예약에서"), "온라인 예약으로"),
    (re.compile(r"예약으로만\s*예약\s*접수"), "예약으로만 접수"),
]

SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
# "A — B" 처럼 대시로 이은 한 문장은 앞뒤를 따로 본다(수집 메모만 든 쪽만 빼고 나머지는 살린다)
DASH_SPLIT = re.compile(r"\s+[—–]\s+|" + r"\s*[—–]\s*")

# 후기 카드의 수집·관리 메모(어떤 URL을 교체했는지 등) — 일반 화면에는 평가 값만 둔다
MAINTENANCE = re.compile(r"수집\s*URL|후기\s*URL|v2\.\d|교체|해제했다|이전\s*수집")

FIELDS = ("recent_notice_text", "course_notes")


def _clauses(sentence: str) -> list[str]:
    return [c.strip() for c in DASH_SPLIT.split(sentence) if c and c.strip()]


def clean_text(text: str, maintenance: bool = False) -> str:
    out = text

    # 1) 채널 라벨 접두사 제거
    for pat in LABEL_PREFIX:
        out = pat.sub("", out)

    # 2) 수집 상태 설명만으로 된 문장(또는 대시로 나뉜 그 절)은 버린다
    kept: list[str] = []
    for sentence in (s for s in SENTENCE_SPLIT.split(out) if s.strip()):
        if maintenance and MAINTENANCE.search(sentence):
            continue
        parts = _clauses(sentence)
        alive = [
            p
            for p in parts
            if not COLLECTION_SENTENCE.search(p) and not NOTICE_COLLECTION_SENTENCE.search(p)
        ]
        if not alive:
            continue
        if len(alive) == len(parts):
            kept.append(sentence)
        else:
            kept.append(" — ".join(alive))
    out = " ".join(kept) if kept else ""

    # 3) 확인일·기준일 표기 제거
    out = CONFIRM_PAREN.sub("", out)
    out = DATE_MARK_AT.sub("", out)
    out = DATE_MARK_COLON.sub("", out)
    out = BARE_DATE_MARK.sub("", out)

    # 4) 남은 브랜드명은 중립 표기로
    for pat, rep in BRAND:
        out = pat.sub(rep, out)

    # 5) 문장부호·공백 정리
    out = re.sub(r"\(\s*\)", "", out)
    out = re.sub(r"\s+", " ", out)
    out = re.sub(r"\s+([.,])", r"\1", out)
    out = re.sub(r"^[\s·,\-—]+|^[.](?=\s)", "", out)
    return out.strip()



def clean_course(course: dict) -> tuple[dict, list[tuple[str, str, str]]]:
    """코스 하나를 정리하고 (변경 로그)를 돌려준다. 변경 로그는 관리자 필드에 남긴다."""
    changes: list[tuple[str, str, str]] = []
    br = course.get("briefing")
    if not isinstance(br, dict):
        return course, changes

    for fld in FIELDS:
        old = br.get(fld)
        if isinstance(old, str) and old.strip():
            new = clean_text(old)
            if new != old:
                changes.append((f"briefing.{fld}", old, new))
                if new:
                    br[fld] = new
                else:
                    # 메타 문구만 남아 있던 필드 → 빈 값(화면에서 줄 자체가 사라진다)
                    br[fld] = None

    alert = br.get("alert")
    if isinstance(alert, dict):
        for fld in ("summary", "detail"):
            old = alert.get(fld)
            if isinstance(old, str) and old.strip():
                new = clean_text(old)
                if new != old:
                    changes.append((f"briefing.alert.{fld}", old, new))
                    alert[fld] = new or None

    review = br.get("review")
    if isinstance(review, dict):
        old = review.get("note")
        if isinstance(old, str) and old.strip():
            new = clean_text(old, maintenance=True)
            if new != old:
                changes.append(("briefing.review.note", old, new))
                review["note"] = new or None

    notices = br.get("notices")
    if isinstance(notices, dict):
        for i, item in enumerate(notices.get("items") or []):
            if not isinstance(item, dict):
                continue
            old = item.get("title")
            if isinstance(old, str) and old.strip():
                new = clean_text(old)
                if new != old:
                    changes.append((f"briefing.notices.items[{i}].title", old, new))
                    item["title"] = new
    return course, changes


def walk(obj):
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from walk(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk(v)


# 일반 사용자 화면에 그대로 나가는 텍스트만 검사한다(관리자 전용 sources·evidence·unconfirmed 는 제외)
LEAK = re.compile(
    r"카카오골프예약|골프장에서\s*알립니다|스마트스코어|티픽|그린피가이드|보완했다|"
    r"\d{4}-\d{2}-\d{2}\s*확인|확인\s*\(\s*\d{4}-\d{2}-\d{2}"
)


def visible_texts(course: dict):
    br = course.get("briefing") or {}
    for fld in FIELDS:
        v = br.get(fld)
        if isinstance(v, str) and v:
            yield f"briefing.{fld}", v
    al = br.get("alert") or {}
    if isinstance(al, dict):
        for fld in ("summary", "detail"):
            v = al.get(fld)
            if isinstance(v, str) and v:
                yield f"briefing.alert.{fld}", v
    rv = br.get("review") or {}
    if isinstance(rv, dict):
        v = rv.get("note")
        if isinstance(v, str) and v:
            yield "briefing.review.note", v
    for i, item in enumerate((br.get("notices") or {}).get("items") or []):
        if isinstance(item, dict):
            v = item.get("title")
            if isinstance(v, str) and v:
                yield f"briefing.notices.items[{i}].title", v


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="수정 없이 남은 노출 건수만 확인")
    ap.add_argument("--dry", action="store_true", help="변경 전/후 미리보기(파일 수정 없음)")
    ap.add_argument("--src", default=SRC)
    args = ap.parse_args()

    with open(args.src, encoding="utf-8") as f:
        data = json.load(f)
    courses = data["courses"] if isinstance(data, dict) and "courses" in data else data

    leaks = 0
    for course in courses:
        for path, text in visible_texts(course):
            if LEAK.search(text):
                leaks += 1
                if args.check:
                    print(f"[LEAK] {course.get('master', {}).get('course_id')} {path}: {text[:160]}")

    if args.check:
        print(f"\n남은 노출 {leaks}건 / 구장 {len(courses)}곳")
        return 1 if leaks else 0

    total_changes = 0
    touched: set[str] = set()
    for course in courses:
        new_course, changes = clean_course(course)
        if changes:
            cid = (new_course.get("master") or {}).get("course_id") or "?"
            touched.add(str(cid))
            total_changes += len(changes)
            if args.dry:
                for path, old, new in changes:
                    print(f"--- {cid} {path}\n  OLD {old}\n  NEW {new}")

    print(f"정리 {total_changes}건 / 구장 {len(touched)}곳")

    if args.dry:
        return 0

    with open(args.src, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"저장 → {args.src}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
