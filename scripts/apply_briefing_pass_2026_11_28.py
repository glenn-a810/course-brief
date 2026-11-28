#!/usr/bin/env python3
"""2026-11-28 공지·브리핑(briefing) 영역 전수 정리 반영.

입력
  - data/source/golf_courses_all_v29.json            (현행 데이터, v2.9.13)
  - 외부 수신 패치 0-all_540_briefing_patch.json      (327곳 briefing 하위 필드)

처리
  1) 수신 패치 병합 — 허용 필드(alert.summary/detail, recent_notice_text, course_notes)만 반영하고
     alert 의 구조 필드(type/level/period/confirmed/checked_at/source_url/source_file/raw)는 건드리지 않는다.
  2) 패치 검수에서 걸러낸 문구 보정 — 일반 화면 금지 표기('미확인')와 내부 집계 설명 제거.
  3) 휴장 공지가 notices 에만 있고 alert 가 비어 있던 7곳에 alert 신설(중복되는 공지 요약은 정리).
  4) notices.items 오염 정리 — 게시판 머리글·작성자/조회수·상호 고지문·갤러리 캡션·중고클럽 게시글 제거.
  5) 제목·문장의 장식 특수문자(★ ♥ ■ ※ 등) 제거.
  6) 데이터셋 버전 2.9.14 로 올리고 built_at 갱신.

사용
  python3 scripts/apply_briefing_pass_2026_11_28.py --patch <수신 패치 JSON 경로>
"""
from __future__ import annotations

import argparse
import json
import re
import sys

SRC = "data/source/golf_courses_all_v29.json"
VERSION = "2.9.14"
BUILT_AT = "2026-11-28T12:30:00+09:00"
ALLOWED = {"alert", "recent_notice_text", "course_notes"}
NOTE_KEY = "briefing_pass_2026_11_28"
NOTE_TEXT = "공지·브리핑 문구 정리(외부 검수 반영) — 휴장 알림 보강·게시판 잡음 제거"

# ---------------------------------------------------------------- 2. 패치 문구 보정
ALERT_TEXT = {
    # 공식 이용약관·동계 운영 현황 근거는 detail 로 내리고, 내부 집계(60곳 명단) 언급은 뺀다
    "kr-golf-0027": {
        "summary": "동계 휴장 없이 정상 운영",
        "detail": "공식 이용약관에 정기 휴장일이 없고 동계 휴장 공지도 따로 없어 겨울에도 운영하는 것으로 본다. "
                  "예약은 주중은 라운드 2달 전 해당 요일, 주말은 2달 전 수요일부터 열린다.",
    },
    # 일반 화면에 '미확인' 표기를 남기지 않는다
    "kr-golf-0315": {
        "summary": "12월 운영 확인 — 동계휴장 공지 없음",
        "detail": "동계 휴장 공지는 없고 관광공사·지도 정보는 연중무휴로 표기한다. "
                  "12월 할인 그린피(12/1~12/31)를 적용하고 첫 주 예약가가 85,000원대.",
    },
}

# ---------------------------------------------------------------- 3. alert 신설(휴장 공지 7곳)
NEW_ALERTS = {
    "kr-golf-0173": {
        "type": "winter_closure", "level": "closure", "confirmed": True,
        "summary": "동계 휴장 2026-12-28~2027-01-14, 2027-01-15 재개장",
        "detail": "공식 예약 페이지의 '동계 휴장 안내'(2026-11-23 게시)로 확인. 휴장 기간에는 라운드할 수 없다.",
        "period": {"from": "2026-12-28", "to": "2027-01-14", "reopen": "2027-01-15"},
        "checked_at": "2026-11-27",
        "source_url": "https://yi.blueone.com/reservation?subType=0&type=4",
        "source_file": "공식 예약 페이지 공지(2026-11-23)",
        "raw": "동계 휴장 안내(2026.12.28~2027.1.14, 재개장 1.15)",
    },
    "kr-golf-0097": {
        "type": "winter_closure", "level": "closure", "confirmed": True,
        "summary": "2027년 동계휴장 2027-01-04~01-24 (21일간), 01-25 재개장",
        "detail": "공식 공지 '2027년 동계휴장 안내'(2026-11-26)로 확인. 1월 4일(월)부터 24일(일)까지 21일간 휴장한다.",
        "period": {"from": "2027-01-04", "to": "2027-01-24", "reopen": "2027-01-25"},
        "checked_at": "2026-11-27",
        "source_url": "https://www.newkoreacc.co.kr/customer/customer01.asp",
        "source_file": "공식 공지 '2027년 동계휴장 안내'(2026-11-26)",
        "raw": "2027년 동계휴장 안내 — 2027년 1월 4일(월)부터 1월 24일(일)까지 21일간 휴장",
    },
    "kr-golf-0109": {
        "type": "winter_closure", "level": "closure", "confirmed": True,
        "summary": "동계휴장 2027-01-01~02-11, 02-12 개장 예정",
        "detail": "공식 공지 '동계 휴장 안내'(2026-11-24)로 확인. 기상 상황에 따라 일정이 변동될 수 있고, "
                  "예약 오픈일은 추후 문자·공지로 안내한다.",
        "period": {"from": "2027-01-01", "to": "2027-02-11", "reopen": "2027-02-12"},
        "checked_at": "2026-11-27",
        "source_url": "https://thesiena.co.kr/news/203",
        "source_file": "공식 공지 '동계 휴장 안내'(2026-11-24)",
        "raw": "휴장 2027-01-01(금)~2027-02-11(목), 개장 예정 2027-02-12(금), 기상 상황에 따라 변동",
    },
    "kr-golf-0135": {
        "type": "winter_closure", "level": "closure", "confirmed": True,
        "summary": "동계휴장 2027-01-04~02-10, 02-11 재개장",
        "detail": "공식 공지 '동계 휴장 안내'(2026-11-27)로 확인. 클럽하우스 일부와 코스 내 카트 도로를 정비한다. "
                  "12월 7일(월)과 12/31~1/3도 휴장한다.",
        "period": {"from": "2027-01-04", "to": "2027-02-10", "reopen": "2027-02-11"},
        "checked_at": "2026-11-27",
        "source_url": "https://www.pinecreek.co.kr/html_creek/board/notice_view.asp?b_idx=97",
        "source_file": "공식 공지 '동계 휴장 안내'(2026-11-27)",
        "raw": "동계 휴장 안내 — 2027-01-04(월)~2027-02-10(수), 클럽하우스 일부 및 코스 내 카트 도로 정비",
    },
    "kr-golf-0059": {
        "type": "closure", "level": "caution", "confirmed": True,
        "summary": "12월 21일(월) 하루 휴장",
        "detail": "공식 공지 '12월 21일(월) 휴장 안내'(2026-11-17)로 확인. 다음 날부터 정상 운영한다.",
        "period": {"from": "2026-12-21", "to": "2026-12-21", "reopen": "2026-12-22"},
        "checked_at": "2026-11-27",
        "source_url": "https://easyskycc.co.kr/blt/notice",
        "source_file": "공식 공지 '12월 21일(월) 휴장 안내'(2026-11-17)",
        "raw": "12월 21일(월) 휴장 안내(2026-11-17)",
    },
    "kr-golf-0462": {
        "type": "winter_closure", "level": "caution", "confirmed": True,
        "summary": "12/7부터 겨울 휴장 — 재개장 일정은 아직 공지 없음",
        "detail": "휘닉스 컨트리클럽과 같은 리조트로, 컨트리클럽 공지(2026 시즌 12/6 종료)에 맞춰 12월 7일부터 "
                  "겨울 휴장에 들어간다. 대중골프장 재개장 일정은 아직 공지되지 않았다.",
        "period": {"from": "2026-12-07", "to": None, "reopen": None},
        "checked_at": "2026-11-26",
        "source_url": "https://www.phoenixhnr.co.kr/",
        "source_file": "휘닉스 CC 공지 기준(같은 리조트)",
        "raw": "휘닉스 컨트리클럽과 함께 겨울 휴장(12/7~) 운영. 2026-27 상세 일정 미확인",
    },
    "kr-golf-0509": {
        "type": "winter_closure", "level": "caution", "confirmed": True,
        "summary": "동계휴장 공지 게시 — 상세 일정은 예약 전 확인",
        "detail": "공식 공지 '27년 동계휴장'(2026-10-19)이 게시되어 있다. 휴장 기간은 공지 본문 이미지로만 안내돼 "
                  "일정을 확인하지 못했으니 예약 전 공지를 확인해야 한다.",
        "period": {"from": None, "to": None, "reopen": None},
        "checked_at": "2026-11-27",
        "source_url": "https://www.trinityclub.co.kr/board/list",
        "source_file": "공식 공지 '27년 동계휴장'(2026-10-19, 본문 이미지)",
        "raw": "26~27년 동계휴장(2026-10-19)이 공지사항 최신 글(본문 이미지)",
    },
}

# alert 를 신설한 구장의 공지 요약 — alert 와 겹치는 문장을 걷어낸다(null 이면 숨김)
NOTICE_SUMMARY_AFTER_ALERT = {
    "kr-golf-0173": None,
    "kr-golf-0097": None,
    "kr-golf-0109": None,
    "kr-golf-0135": None,
    "kr-golf-0059": None,
    "kr-golf-0462": None,
    "kr-golf-0509": "• 11/10부터 화요일에도 개장\n• 클럽 부대서비스 요금 안내",
}

# ---------------------------------------------------------------- 4. notices.items 잡음 제거
NOTICE_DROP = {
    # 게시판 표 머리글만 긁힌 항목(실제 제목 없음)
    "kr-golf-0301": [
        "이 표는 제목, 작성자, 작성일로 구성되었습니다.",
    ],
    # '등록일 :' 라벨만 긁힌 행
    "kr-golf-0314": ["등록일 :"],
    # 푸터 상호·대표자 고지문과 서비스 소개문이 공지로 들어옴
    "kr-golf-0318": [
        "상호: (주)지씨선산 대표자명: 서상현 사업장소재지: 경상북도 구미시 산동면 강도로 953-73 전화번호: 054-473-6200",
        "골프장 예약, 부킹 등 대 고객 서비스(직영 골프장 및 티스캐너 서비스)",
    ],
    # 코스 갤러리 게시판 캡션(2011년)
    "kr-golf-0319": [
        "코스갤러리", "백호 2번, 백호 6...", "거북 2번 러프지역에...", "거북5번 그린",
        "거북 4번 그린에서...", "거북 2번 그린 무지...", "청룡3번, 백호6번...",
    ],
    # 작성자·조회수 라벨
    "kr-golf-0320": ["관리자 | HIT : 66 |", "관리자 | HIT : 113 |", "관리자 | HIT : 224 |"],
    # 사용클럽(중고 클럽)·명단 게시글 — 공지 아님
    "kr-golf-0328": [
        "사용클럽", "젝시오 8번아이언", "세인트나인 1번", "김**, 황**, 권**",
        "이*순, 김*수, 김*연", "혼마 8번 아이언", "김*욱,김*람,김*석",
        "Taylormade9 Iron", "로마로 7번 아이언", "마제스티 8번 아이언",
    ],
}

# ---------------------------------------------------------------- 4b. 게시판 잡음 제목(전수)
#  관리자·작성자·등록일 라벨, 게시판 표 머리글 — 실제 제목이 아니라 표/목록 UI 텍스트다.
JUNK_TITLE = re.compile(
    r"^(?:관리자|작성자|등록일|제목)\s*(?:\||\uff5c|:|：|$|관리자|HIT|\([A-Za-z0-9])"
    r"|^이 표는\s*제목"
)
# 게시판 글번호가 제목 앞에 붙은 경우("142 2027 연단체 모집") — 두 자리 이하 숫자만 지운다(연도·날짜 보존)
BOARD_NO = re.compile(r"^\d{1,3}\s+(?=\S)")

# ---------------------------------------------------------------- 5. 장식 특수문자
DECOR = re.compile(r"[★☆♥♡■□◆◇▶◀●○◎※▣▤▥▦▧▨▩♣♠]")
DECOR_TRAIL = re.compile(r"^\s*[\[\(]?\s*[\-–—:]+\s*$")


def strip_decor(text: str) -> str:
    out = DECOR.sub(" ", text)
    out = re.sub(r"\s{2,}", " ", out)
    return out.strip()


def clean_notice_title(title: str) -> str:
    t = strip_decor(title)
    t = re.sub(r"\s+([,.)\]])", r"\1", t)
    return t.strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--patch", required=True, help="수신 패치 JSON 경로")
    ap.add_argument("--src", default=SRC)
    args = ap.parse_args()

    with open(args.src, encoding="utf-8") as f:
        ds = json.load(f)
    with open(args.patch, encoding="utf-8") as f:
        patch = json.load(f)

    by_id = {c["course_id"]: c for c in ds["courses"]}
    unknown = [k for k in patch if k not in by_id]
    if unknown:
        print(f"알 수 없는 course_id: {unknown[:5]}", file=sys.stderr)
        return 2

    stats = {"alert": 0, "recent_notice_text": 0, "course_notes": 0, "alert_new": 0,
             "drop": 0, "decor": 0}
    touched: set[str] = set()

    # 1) 수신 패치 병합
    for cid, fields in patch.items():
        bad = set(fields) - ALLOWED
        if bad:
            print(f"{cid}: 허용되지 않은 필드 {bad}", file=sys.stderr)
            return 2
        br = by_id[cid]["briefing"]
        for key, val in fields.items():
            if key == "alert":
                cur = br.get("alert")
                if not isinstance(cur, dict):
                    print(f"{cid}: alert 가 없어 구조 필드를 보존할 수 없음", file=sys.stderr)
                    return 2
                if not isinstance(val, dict) or set(val) - {"summary", "detail"}:
                    print(f"{cid}: alert 패치에 허용 외 키 {set(val) - {'summary', 'detail'}}",
                          file=sys.stderr)
                    return 2
                cur.update({k: v for k, v in val.items() if v is not None})
                stats["alert"] += 1
            else:
                br[key] = val
                stats[key] += 1
        touched.add(cid)

    # 2) 패치 문구 보정
    for cid, fields in ALERT_TEXT.items():
        by_id[cid]["briefing"]["alert"].update(fields)
        touched.add(cid)

    # 3) alert 신설 + 공지 요약 정리
    for cid, alert in NEW_ALERTS.items():
        br = by_id[cid]["briefing"]
        if br.get("alert"):
            print(f"{cid}: 이미 alert 가 있음", file=sys.stderr)
            return 2
        br["alert"] = dict(alert)
        br["recent_notice_text"] = NOTICE_SUMMARY_AFTER_ALERT[cid]
        stats["alert_new"] += 1
        touched.add(cid)

    # 4) notices.items 잡음 제거
    for cid, drops in NOTICE_DROP.items():
        br = by_id[cid]["briefing"]
        notices = br.get("notices") or {}
        items = notices.get("items") or []
        wanted = set(drops)
        kept, removed = [], []
        for it in items:
            if isinstance(it, dict) and (it.get("title") or "").strip() in wanted:
                removed.append(it.get("title"))
            else:
                kept.append(it)
        notices["items"] = kept
        br["notices"] = notices
        stats["drop"] += len(removed)
        if removed:
            touched.add(cid)
        if len(removed) < len(wanted):
            missing = wanted - set(removed)
            print(f"{cid}: 지우려던 제목을 찾지 못함 {sorted(missing)}", file=sys.stderr)
            return 2

    # 5) 제목 정리 — 잡음 제목 제거, 글번호·장식 문자 제거, 중복·잘린 제목 정리
    for c in ds["courses"]:
        br = c.get("briefing") or {}
        notices = br.get("notices") or {}
        items = [i for i in (notices.get("items") or []) if isinstance(i, dict)]
        changed = False

        kept = []
        for it in items:
            title = (it.get("title") or "").strip()
            if JUNK_TITLE.search(title):
                stats["drop"] += 1
                changed = True
                continue
            kept.append(it)
        items = kept

        # 글번호·장식 문자
        for it in items:
            title = it.get("title") or ""
            new = clean_notice_title(BOARD_NO.sub("", title))
            if new != title:
                it["title"] = new
                changed = True
                stats["decor"] += 1

        # 같은 제목·같은 날짜 중복
        seen, uniq = set(), []
        for it in items:
            key = ((it.get("title") or "").strip(), (it.get("date") or "").strip())
            if key in seen:
                stats["drop"] += 1
                changed = True
                continue
            seen.add(key)
            uniq.append(it)
        items = uniq

        # 잘린 제목("...")은 같은 제목의 온전한 항목이 따로 있을 때만 지운다
        full = [(it.get("title") or "").strip() for it in items]
        trimmed = []
        for it in items:
            t = (it.get("title") or "").strip()
            if t.endswith(("...", "…")) and any(o.startswith(t[:-3].strip()) and len(o) > len(t) for o in full):
                stats["drop"] += 1
                changed = True
                continue
            trimmed.append(it)
        items = trimmed

        if changed:
            notices["items"] = items
            br["notices"] = notices
            touched.add(c["course_id"])
        for key in ("recent_notice_text", "course_notes"):
            v = br.get(key)
            if isinstance(v, str) and DECOR.search(v):
                br[key] = strip_decor(v)
                changed = True
                stats["decor"] += 1
        alert = br.get("alert")
        if isinstance(alert, dict):
            for key in ("summary", "detail"):
                v = alert.get(key)
                if isinstance(v, str) and DECOR.search(v):
                    alert[key] = strip_decor(v)
                    changed = True
                    stats["decor"] += 1
        if changed and c["course_id"] not in touched:
            touched.add(c["course_id"])

    # 6) 버전·이력
    for cid in touched:
        by_id[cid]["meta"][NOTE_KEY] = NOTE_TEXT
    ds["dataset"]["version"] = VERSION
    ds["dataset"]["built_at"] = BUILT_AT
    ds["dataset"]["master_version"] = (
        f"{VERSION} (2026-11-28 공지·브리핑 문구 정리 — 327곳 패치 검수 반영, 휴장 알림 7곳 신설, "
        "게시판 잡음·장식 문자 제거)")

    with open(args.src, "w", encoding="utf-8") as f:
        json.dump(ds, f, ensure_ascii=False, indent=1)
        f.write("\n")

    print(json.dumps({"version": VERSION, "touched": len(touched), **stats}, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
