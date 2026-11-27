#!/usr/bin/env python3
"""2026-11-27 외부 수신 CourseBrief 182곳 공지·공식채널 통합본 교차검증 반영.

입력
  - data/source/golf_courses_all_v29.json      (현행 데이터)
  - 외부 수신 통합본 3-all_5_batches_found.json (구장별 recent_notice / new_homepage)

원칙
  1) 공식 1차 출처(official_site)를 우선 채택하고, 공식 게시판이 없거나 텍스트 공지가 없는
     구장만 카카오골프예약 '골프장에서 알립니다'로 보완한다(접두 표기로 출처를 화면에 남긴다).
  2) aggregator(오늘골프 등 2차 집계)는 채택하지 않는다. 나주CC·고양CC는 공식 사이트에서
     직접 공지를 확인해 공식 출처로 대체했다.
  3) new_homepage 10건은 실제 응답·리다이렉트·본문(구장명·주소·전화)을 확인한 뒤 채택하고,
     확인되지 않은 것은 현행 값을 유지한다.
  4) 통합운영(베네스트골프) 게시판에서 다른 구장 전용 공지가 섞여 들어온 항목은 오귀속으로 보고
     제거한다.
  5) 날짜 없는 기존 공지에는 수신본에서 확인된 게시일을 채워 넣는다.
"""
from __future__ import annotations

import collections
import json
import re

SRC = "data/source/golf_courses_all_v29.json"
RECEIVED = ("/workspace/memory/clones/99239e1f-shimiseul8/pickle/"
            "2026-11-27-2229/received/3-all_5_batches_found.json")
CHECKED = "2026-11-27T23:55:00+09:00"
CHECKED_D = "2026-11-27"

# ---------------------------------------------------------------- 1. 공식 홈페이지 (검증 완료)
#  구장 사이트 본문에서 구장명·주소·대표번호가 일치하고 실제 응답하는 URL만 채택.
HOMEPAGE = {
    # 르오네뜨CC: http://lehonnetecc.com/ 무응답, https://www.lehonnetecc.com/ 정상(본문 르오네뜨CC·061-362-2500 일치)
    "kr-golf-0004": "https://www.lehonnetecc.com/",
    # 안성베네스트 일반대중홀: golfsamsung.com 은 www DNS 소멸·인증서 오류, benestgolf.com 통합 사이트가 현행
    "kr-golf-0130": "https://www.benestgolf.com/reve/pc/main.do",
    # 웰링턴CC: wellingtoncountryclub.com/index.do 는 500 오류, wellingtoncc.co.kr/index.do 정상(그리핀·피닉스·와이번·효성 표기)
    "kr-golf-0198": "https://www.wellingtoncc.co.kr/index.do",
    # 서라벌GC: seorabolgc.com 은 그룹(서라벌·그레이스) 포털, 구장 공지·전화 일치하는 seorabolgc.co.kr 이 현행
    "kr-golf-0307": "https://www.seorabolgc.co.kr/index",
    # 뉴스프링빌Ⅱ: www.newspring.co.kr 은 이천·상주 선택 게이트웨이, 상주 구장 사이트는 sangju.newspring.co.kr
    "kr-golf-0323": "https://sangju.newspring.co.kr/Home/Index",
    # 안동레이크: hugreen.gtc.co.kr → golf.gtc.co.kr/ANDONGLAKE/main/index.asp 로 리다이렉트 확인
    "kr-golf-0326": "https://golf.gtc.co.kr/ANDONGLAKE/main/index.asp",
    # 포항CC: pohangcc.co.kr → www.pohangcc.com 리다이렉트 확인(본문 '포항 컨트리클럽')
    "kr-golf-0345": "http://www.pohangcc.com/",
}
# 확인했으나 현행 값이 이미 같아 변경하지 않는 건: 냉천(nc-golf.com), 케이밸리(kvalleycc.co.kr),
# 동여주(welfare.mil.kr 체력단련장 페이지)

# ---------------------------------------------------------------- 2. 명칭·전화 (검증 완료)
NAME = {
    # 2025-07-01 광산구 직영 전환 → 광산CC. 구 명칭은 name_variants/former_names 에 보존.
    "kr-golf-0007": dict(name="광산CC", tel="062-960-1501",
                         former=["에콜리안광산골프장", "에콜리안 광산CC"]),
}
TEL = {
    # 함평엘리체 공식 사이트 푸터: 대표 061-320-7700 / FAX 061-320-7710 (입력값 7800 은 확인되지 않음)
    "kr-golf-0038": "061-320-7700",
}
TEL_NOTE = {
    "kr-golf-0038": "대표번호는 공식 홈페이지 표기(061-320-7700)로 정정. 예약 문의는 구장으로 확인 필요.",
}

# ---------------------------------------------------------------- 3. 동계휴장 (공식 공지 확인)
ALERTS = {
    "kr-golf-0116": {
        "type": "winter_closure", "level": "closure", "confirmed": True,
        "summary": "★ 2026-27 동계휴장: 2026-12-21(월)~2027-02-25(목) — 기간 중 라운드 불가",
        "detail": "공식 홈페이지 팝업으로 동계휴장 기간을 안내하고 있다(2026-11-27 확인). 봄 시즌 개장일은 아직 공지되지 않았다.",
        "period": {"from": "2026-12-21", "to": "2027-02-25", "reopen": None},
        "checked_at": CHECKED_D, "source_url": "https://www.haevichi.com/ccseoul/ko/",
    },
    "kr-golf-0157": {
        "type": "winter_closure", "level": "closure", "confirmed": True,
        "summary": "2027년 1월 동계휴장: 2027-01-01~01-31, 2월 예약은 정상 오픈",
        "detail": "공식 공지 '2027년 1월 동계 휴장 안내'(2026-11-18)로 1월 한 달 휴장을 안내한다. 휴장 기간은 기상 상황에 따라 변경될 수 있다.",
        "period": {"from": "2027-01-01", "to": "2027-01-31", "reopen": "2027-02-01"},
        "checked_at": CHECKED_D, "source_url": "https://www.ipocc.com/lounge/notice/detail/607",
    },
}

# ---------------------------------------------------------------- 4. 오귀속 정리 (통합운영 게시판)
DROP_TITLES = {
    # 베네스트골프 통합 공지에서 이 구장 전용이 아닌 타 구장 공지
    "kr-golf-0130": ["동래베네스트 겨울철 페어웨이 관리 안내",
                     "글렌로스 2026년 11월 이용요금 안내",
                     "글렌로스 2026년 10월 이용요금 안내",
                     "가평베네스트 캐디피 변경 안내"],
    "kr-golf-0171": ["동래베네스트 겨울철 페어웨이 관리 안내"],
}

# ---------------------------------------------------------------- 5. 개별 보정 (수동 확인)
#  수신 요약만으로는 화면에 남기기 어려운 구장은 직접 확인한 내용으로 대체한다.
MANUAL_TEXT = {
    # 나주CC: 공식 NEWS 는 비어 있고 요금표는 회원 로그인 후 열람. 이벤트 게시판에 '10월~11월 그린피 안내'(2026-10-01~11-30) 진행 중.
    "kr-golf-0010": "공식 홈페이지 이벤트 게시판에 '10월~11월 그린피 안내'(적용 2026-10-01~11-30)가 진행 중이다. 공지사항 게시판은 비어 있고 요금표는 회원 로그인 후 열람된다(2026-11-27 확인).",
    # 고양CC: 공식 사이트 공지사항·매월그린피 게시판 확인
    "kr-golf-0096": "공지사항에 2026년 골프연습장 동절기 운영시간 변경안내(2026-11-23)·2027년 연단체 모집안내(2026-11-03)·고양CC 헬로캐디 정식오픈 예약안내(2026-08-31)가, 매월그린피 게시판에 26년 12월 그린피 이용요금 안내(2026-11-23)가 게시되어 있다.",
    # 웰링턴: 회원제 사이트, 공지 메뉴 없음(직접 확인)
    "kr-golf-0198": "웰링턴CC는 효성중공업(주) 운영 회원제 구장으로 공식 홈페이지(wellingtoncc.co.kr)에 공지 게시판이 없다. 문의 031-645-1800.",
}
MANUAL_ITEMS = {
    "kr-golf-0010": [("10월~11월 그린피 안내(적용 2026-10-01~11-30)", None,
                      "https://www.najucc.com/community/event")],
    "kr-golf-0096": [("2026년 골프연습장 동절기 운영시간 변경안내", "2026-11-23",
                      "https://www.goyangcc.com/board/view/notice/10784"),
                     ("2027년 연단체 모집안내", "2026-11-03",
                      "https://www.goyangcc.com/board/view/notice/10746"),
                     ("고양CC 헬로캐디 정식오픈 예약안내", "2026-08-31",
                      "https://www.goyangcc.com/board/view/notice/10580"),
                     ("26년 12월 그린피 이용요금 안내", "2026-11-23",
                      "https://www.goyangcc.com/board/fee")],
}
# 기존 공지 문장에 남은 사실 오류(전화번호 등)를 바로잡는다
MANUAL_TEXT.update({
    # 광산CC: 대표번호가 062-960-1501 로 변경(구 062-616-5870)
    "kr-golf-0007": "광산CC(옛 에콜리안 광산CC)는 2025-07-01 광주 광산구 직영으로 전환하며 명칭을 광산CC로 바꿨다. 대표전화 062-960-1501, 예약은 매월 1·16일 19시 오픈, 노캐디 운영. 공식 누리집(gwangsancc.kr)은 2026-11-27 현재 도메인이 응답하지 않아 공지 확인은 카카오골프예약 안내로 보완했다. 카카오골프예약 '골프장에서 알립니다'(2026-11-27 확인): 일일 1회·월 4회 예약 제한(9홀·18홀 포함), 위약 벌점제 운영, 결제금액 카트비 불포함.",
    # 서라벌: 구장 소개 + 공지 요약
    "kr-golf-0307": "서라벌골프클럽은 경주 외동 45홀(힐·레이크·마운틴·밸리·파인) 대중제 코스로, 공식 홈페이지는 seorabolgc.co.kr이며 예약 문의 054-773-7000이다. 공지 배너에 12월 이용요금(12/1~12/13, 12/14~12/31)과 2027년 연단체(써클팀) 모집안내, 셀프(노캐디) 카트료·3부 캐디피 변경 안내를 게시 중이다(게시일 표기 없음, 2026-11-27 확인).",
})

MANUAL_ITEMS.update({
    # 광릉CC: 팝업 '주중반환안내' 대신 공지사항 게시판의 실제 글(2026-11-27 확인)
    "kr-golf-0112": [("동계기간 운영안내(12월~2월)", "2026-11-12",
                      "https://www.kwangneungcc.co.kr/html/center/center01_view.asp?b_idx=71"),
                     ("주중회원 입회기간 만료안내", "2026-11-09",
                      "https://www.kwangneungcc.co.kr/html/center/center01_view.asp?b_idx=71"),
                     ("2027년 연단체 모집안내", "2026-10-13",
                      "https://www.kwangneungcc.co.kr/html/center/center01_view.asp?b_idx=71")],
    "kr-golf-0026": [("디오션 C·C 18·36홀 골프패키지 235,000원~ (적용 2026-11-15~2027-01-31)", "2026-11-15",
                      "https://www.theoceanresort.co.kr/country")],
    "kr-golf-0193": [("성남~장호원 자동차전용도로·국도 37호선 건설로 접근성 개선 예정 안내", "2026-11-12",
                      "http://www.blackstoneresort.com/ic/BSListView?board_kind=notice&board_seq=1137&where=news_view")],
    "kr-golf-0342": [("외부 음식물 반입 금지 안내", "2026-07-22", "https://www.iwishcc.com/community/notice"),
                     ("카트비 및 캐디피 인상 안내", "2026-07-22", "https://www.iwishcc.com/community/notice"),
                     ("블랙박스 운영 안내", "2026-07-22", "https://www.iwishcc.com/community/notice")],
    "kr-golf-0484": [("2026년 12월 1일~13일 이용 요금 안내", "2026-11-17", "https://www.spahillscc.co.kr/lounge/notice/list"),
                     ("2027년 김제스파힐스CC 연단체 모집안내", "2026-10-29", "https://www.spahillscc.co.kr/lounge/notice/list"),
                     ("김제 스파힐스CC 홀인원 이벤트 시행", "2026-10-13", "https://www.spahillscc.co.kr/lounge/notice/list"),
                     ("2026년 11월 이용 요금 안내", "2026-10-20", "https://www.spahillscc.co.kr/lounge/notice/list")],
    "kr-golf-0501": [("26-27 장수스테이 객실 이용권 판매", "2026-11-23", "https://www.jangsugolf.com/blt/notice"),
                     ("12/01~12/13 2인라운드 이벤트", "2026-11-22", "https://www.jangsugolf.com/blt/notice"),
                     ("11월 마지막 3일 단풍이벤트", "2026-11-19", "https://www.jangsugolf.com/blt/notice"),
                     ("2026년 12월 그린피 안내", "2026-11-07", "https://www.jangsugolf.com/blt/notice")],
    "kr-golf-0506": [("12/14(월)~12/20(일) 그린피 안내", "2026-11-23", "https://www.creasvalley.com/lounge/notice/list"),
                     ("11/30(월)~12/13(일) 그린피 안내", "2026-11-09", "https://www.creasvalley.com/lounge/notice/list"),
                     ("11/16(월)~11/29(일) 그린피 안내·2027년 연단체 모집 마감", "2026-10-26", "https://www.creasvalley.com/lounge/notice/list"),
                     ("11/02(월)~11/15(일) 그린피 안내", "2026-10-12", "https://www.creasvalley.com/lounge/notice/list"),
                     ("크리스밸리 예약 인원 안내(상단 고정)", "2026-09-22", "https://www.creasvalley.com/lounge/notice/list")],
    # 동여주 체력단련장: 국군복지포털 공지사항에서 직접 확인한 실제 공지로 교체
    "kr-golf-0519": [("동여주체력단련장 분실물 안내", "2026-11-16", "https://www.welfare.mil.kr/health/content/content.do?m_code=253"),
                     ("동여주체력단련장 냉탕 미운영 안내", "2026-10-29", "https://www.welfare.mil.kr/health/content/content.do?m_code=253"),
                     ("2027년 체력단련장 예비역 단체팀 신청 세부안내", "2026-10-25", "https://www.welfare.mil.kr/health/content/content.do?m_code=253"),
                     ("체력단련장 동절기 공휴일 예비역 배정 제한 안내", "2026-10-25", "https://www.welfare.mil.kr/health/content/content.do?m_code=253"),
                     ("2027년도 체력단련장 예비역 단체팀 모집 안내", "2026-10-14", "https://www.welfare.mil.kr/health/content/content.do?m_code=253")],
})
MANUAL_ITEMS.update({
    # 해비치: 홈페이지 팝업 공지(게시판 목록 없음) — 팝업 원문에서 기간 확인(2026-11-27)
    "kr-golf-0116": [("동계휴장 안내(2026-12-21~2027-02-25)", None, "https://www.haevichi.com/ccseoul/ko/")],
    # 이포: 공지 상세(2027년 1월 동계 휴장 안내, 2026.11.18)
    "kr-golf-0157": [("2027년 1월 동계 휴장 안내(2027-01-01~01-31)", "2026-11-18",
                      "https://www.ipocc.com/lounge/notice/detail/607")],
    # 아시아나: 공지사항 487번 '동절기 휴장 안내' 2026/11/17 (게시판 직접 확인)
    "kr-golf-0177": [("동절기 휴장 안내", "2026-11-17",
                      "https://www.asianacc.co.kr/about_us/news.asp?code=01")],
})
MANUAL_NOTICE_URL = {
    # 베네스트골프 통합 사이트 공지사항(안성·글렌로스·가평·동래 공용)
    "kr-golf-0129": "https://www.benestgolf.com/reve/pc/board/notice.do",
    "kr-golf-0130": "https://www.benestgolf.com/reve/pc/board/notice.do",
    "kr-golf-0171": "https://www.benestgolf.com/reve/pc/board/notice.do",
    "kr-golf-0010": "https://www.najucc.com/community/event",
    "kr-golf-0096": "https://www.goyangcc.com/board/news",
    # 해비치: 팝업 공지(게시판 목록 없음) — 팝업 근거 페이지
    "kr-golf-0116": "https://www.haevichi.com/ccseoul/ko/",
    # 이포·아시아나: 공지사항 게시판
    "kr-golf-0157": "https://www.ipocc.com/lounge/notice/detail/607",
    "kr-golf-0177": "https://www.asianacc.co.kr/about_us/news.asp?code=01",
    "kr-golf-0307": "https://www.seorabolgc.co.kr/index",
}
# 수신본 없이 직접 확인해 공식 출처를 등록하는 구장
MANUAL_SOURCE = {
    "kr-golf-0010": "https://www.najucc.com/community/event",
    "kr-golf-0096": "https://www.goyangcc.com/board/news",
    "kr-golf-0198": "https://www.wellingtoncc.co.kr/index.do",
}

# 공식 공지 게시판은 확인했지만 최신 공지가 오래된 구장 — 수신 요약 문구를 그대로 쓰되
# "최근 공지 없음" 사실을 흐리지 않도록 기존 문장을 유지한다.
KEEP_CURRENT_TEXT = {
    "kr-golf-0013", "kr-golf-0014", "kr-golf-0030", "kr-golf-0061", "kr-golf-0065",
    "kr-golf-0094", "kr-golf-0100", "kr-golf-0144", "kr-golf-0152", "kr-golf-0175",
    "kr-golf-0185", "kr-golf-0187", "kr-golf-0223", "kr-golf-0227", "kr-golf-0289",
    "kr-golf-0332", "kr-golf-0337",
}

# 카카오 안내가 결제·정산 보일러플레이트뿐이라 운영 정보가 없는 구장 — 공지 요약을 만들지 않는다
KAKAO_SKIP = {"kr-golf-0025", "kr-golf-0330", "kr-golf-0322", "kr-golf-0331"}
# 위 목록에 더해, 안내문이 결제·정산 보일러플레이트뿐이면 요약을 만들지 않는다
BOILER_ONLY = re.compile(r'^(?:최종 결제금액|결제금액|카트비 불포함|이벤트 상품|특가·이벤트 상품)')
BOILER_WORDS = ("카트비 불포함", "이벤트 상품 이용", "중복적용 불가", "중복 불가", "정상가 기준", "홀별정산")


DATE_RE = r"(20\d{2})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})"
DATE_RE2 = r"(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?!\d)"
PATTERNS = [
    re.compile(r'["“”\']([^"“”\']{4,90})["“”\']\s*[(\[]?\s*' + DATE_RE + r'[)\]]?'),
    re.compile(DATE_RE + r'\s*[)\]:]?\s*["“”\']([^"“”\']{4,90})["“”\']'),
    re.compile(r'([가-힣A-Za-z0-9()\[\]★♥·,+&\s]{4,70}?)\s+' + DATE_RE + r'(?!\d)'),
    re.compile(DATE_RE + r'\s+([가-힣A-Za-z0-9()\[\]★♥·,+&\s]{4,70})$'),
    # 26.11.12 처럼 두 자리 연도로 적힌 게시일(공식 게시판 목록 표기)
    re.compile(r'["“”\']([^"“”\']{4,90})["“”\']\s*' + DATE_RE2),
    re.compile(DATE_RE2 + r'\s*[)\]:]?\s*["“”\']([^"“”\']{4,90})["“”\']'),
]
BAD_TOKENS = ("게시판", "등록일", "그 이전", "공지 적용", "코스 및 디저트메뉴", "Untitled",
              "관리자", "조회", "이전 글", "다음 글", "[1]", "[2]")
TRIM_PREFIX = re.compile(r'^(?:공지사항\s*메인\s*공지사항|메인\s*공지|제목|\[공지\]|공지)\s*')


def norm(s: str) -> str:
    return re.sub(r'[^0-9a-zA-Z가-힣]', '', s or '').lower()


def parse_items(quote: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for p in PATTERNS:
        for m in p.finditer(quote or ""):
            g = m.groups()
            if len(g) != 4:
                continue
            if g[0].isdigit() and len(g[0]) == 4:
                y, mo, d, title = g
            elif g[0].isdigit() and len(g[0]) == 2:
                y, mo, d, title = g
                y = "20" + y
            else:
                title, y, mo, d = g
                if len(y) == 2:
                    y = "20" + y
            title = " ".join(str(title).split()).strip(" :·-/'\"")
            title = re.sub(r'^\d{1,4}\s+', '', title)
            title = re.sub(r'\s*관리자$', '', title)
            title = TRIM_PREFIX.sub('', title).strip()
            try:
                y, mo, d = int(y), int(mo), int(d)
            except ValueError:
                continue
            if not (2019 <= y <= 2027 and 1 <= mo <= 12 and 1 <= d <= 31):
                continue
            if len(title) < 4 or len(title) > 80:
                continue
            if any(t in title for t in BAD_TOKENS):
                continue
            if title.endswith(")") or title.startswith("("):
                continue
            if re.search(r'(?<!\d)\d{1,2}(일|월|년)?$', title) and "그린피" in title:
                continue
            if not re.search(r'[가-힣A-Za-z]{2}', title):
                continue
            date = f"{y:04d}-{mo:02d}-{d:02d}"
            if (title, date) not in out:
                out.append((title, date))
    return out


def first_clause(value: str) -> str:
    """수신 요약 첫 문장에서 공지 제목으로 쓸 구절을 뽑는다."""
    v = (value or "").split(" — ")[0]
    v = re.split(r'[,(]', v)[0]
    v = re.sub(r'^(카카오골프예약\s*"?골프장에서 알립니다"?\s*[—-]?\s*)', '', v)
    v = re.sub(r'\s*(게시|공지)\s*$', '', v).strip()
    return v[:80]


ORG_PREFIX = re.compile(r'^(?:카카오골프예약\s*)?["“”\']?골프장에서\s*알립니다["“”\']?\s*(?:\(카카오골프\))?\s*[—–-]?\s*')


def dedupe_sort(items: list[dict]) -> list[dict]:
    """같은 제목은 최신 게시일만 남기고 최신순으로 정렬한다(날짜 없는 항목은 뒤로)."""
    picked: dict[str, dict] = {}
    order: list[str] = []
    for it in items:
        key = norm(it.get("title"))
        if key in picked:
            if (it.get("date") or "") > (picked[key].get("date") or ""):
                picked[key] = it
        else:
            picked[key] = it
            order.append(key)
    out = [picked[k] for k in order]
    out.sort(key=lambda i: (i.get("date") or ""), reverse=True)
    return out


def main() -> None:
    data = json.load(open(SRC, encoding="utf-8"))
    courses = {c["course_id"]: c for c in data["courses"]}
    received = json.load(open(RECEIVED, encoding="utf-8"))
    by = collections.defaultdict(list)
    for r in received:
        by[r["course_id"]].append(r)

    stats = collections.Counter()
    for cid in sorted(by):
        c = courses[cid]
        br = c.setdefault("briefing", {})
        nt = br.setdefault("notices", {})
        col = c.setdefault("collection", {})
        recs = by[cid]

        # --- 홈페이지 / 명칭 / 전화
        if cid in HOMEPAGE and c["master"].get("homepage") != HOMEPAGE[cid]:
            c["master"]["homepage"] = HOMEPAGE[cid]
            col["official_reason"] = f"공식 홈페이지 주소 확인·정정({HOMEPAGE[cid]}, 2026-11-27)"
            stats["homepage"] += 1
        if cid in NAME:
            fix = NAME[cid]
            old = c["master"].get("name")
            c["master"]["name"] = fix["name"]
            if fix.get("tel"):
                c["master"]["tel"] = fix["tel"]
            variants = [v for v in (c["master"].get("name_variants") or []) if v != fix["name"]]
            for f in [old] + fix.get("former", []):
                if f and f not in variants and f != fix["name"]:
                    variants.insert(0, f)
            c["master"]["name_variants"] = variants
            c["master"]["former_names"] = fix.get("former", [])
            stats["name"] += 1
        if cid in TEL and c["master"].get("tel") != TEL[cid]:
            c["master"]["tel"] = TEL[cid]
            stats["tel"] += 1
        if cid in TEL_NOTE:
            c["master"]["factcheck_2026_11_27"] = TEL_NOTE[cid]

        # --- 기존 공지에서 오귀속 항목 제거
        items = list(nt.get("items") or [])
        if cid in DROP_TITLES:
            drop = set(DROP_TITLES[cid])
            kept = [i for i in items if (i.get("title") or "").strip() not in drop]
            if len(kept) != len(items):
                stats["dropped_items"] += len(items) - len(kept)
            items = kept
            note = ("통합운영(베네스트골프) 게시판에서 이 구장 전용이 아닌 타 구장 공지로 확인되어 "
                    "제외(2026-11-27 교차검증)")
            prev = c["master"].get("factcheck_2026_11_26")
            notes = [n for n in prev if isinstance(n, str)] if isinstance(prev, list) else []
            notes.append(note)
            c["master"]["factcheck_2026_11_26"] = notes

        official = [r for r in recs if r["field"] == "recent_notice" and r["source_type"] == "official_site"]
        kakao = [r for r in recs if r["field"] == "recent_notice" and r["source_type"] == "kakao_golf"]
        official.sort(key=lambda r: (r.get("notice_date") or ""), reverse=True)

        # --- 공지 목록
        if cid in MANUAL_ITEMS:
            items = [{"title": t, "date": d, "url": u} for t, d, u in MANUAL_ITEMS[cid]]
            stats["manual_items"] += 1
        elif official:
            rec = official[0]
            board = rec.get("source_url")
            parsed = parse_items(rec.get("quote") or "")
            # 통합본의 다른 official 레코드도 합친다(같은 구장·같은 게시판)
            for other in official[1:]:
                if other.get("source_url") == board:
                    for t, d in parse_items(other.get("quote") or ""):
                        if (t, d) not in parsed:
                            parsed.append((t, d))
            existing_by_norm = {norm(i.get("title")): i for i in items}
            if parsed:
                new_items = []
                for t, d in parsed:
                    hit = None
                    for k, i in existing_by_norm.items():
                        if k and (k in norm(t) or norm(t) in k):
                            hit = i
                            break
                    if hit is not None:
                        if not hit.get("date"):
                            hit["date"] = d
                        if not hit.get("url"):
                            hit["url"] = board
                        new_items.append(hit)
                    else:
                        new_items.append({"title": t, "date": d, "url": board})
                # 수신본에 없는 기존 항목은 (같은 게시판 공지라면) 뒤에 유지
                for i in items:
                    if i not in new_items:
                        new_items.append(i)
                items = new_items
                stats["items_parsed"] += 1
            elif not items:
                title = first_clause(rec.get("value") or "")
                if title and len(title) >= 4:
                    items = [{"title": title, "date": rec.get("notice_date") or None, "url": board}]
                    stats["items_single"] += 1
        nt["items"] = dedupe_sort(items)
        if cid in MANUAL_NOTICE_URL:
            nt["url"] = MANUAL_NOTICE_URL[cid]
        elif official and official[0].get("source_url") and not nt.get("url"):
            nt["url"] = official[0]["source_url"]
        elif official and official[0].get("source_url"):
            # 기존 url 이 죽은 주소(예: 리다이렉트 이전)면 수신본 게시판으로 교체
            cur_url = nt.get("url") or ""
            if cur_url and cur_url not in (official[0]["source_url"],) and "benestgolf" in cur_url:
                nt["url"] = official[0]["source_url"]
        nt.setdefault("tags", {})

        # --- 공지 요약 문구
        srcs = [s for s in (br.get("sources") or []) if isinstance(s, dict)]
        srcs = [s for s in srcs if not str(s.get("source", "")).startswith(
            ("공식 공지사항(교차검증 2026-11-27)", "카카오골프예약 골프장에서 알립니다(교차검증",
             "공식 공지사항(브라우저 확인)"))]
        if cid in MANUAL_TEXT:
            br["recent_notice_text"] = MANUAL_TEXT[cid]
        elif official and cid not in KEEP_CURRENT_TEXT:
            val = (official[0].get("value") or "").strip()
            extra = ""
            if len(official) > 1:
                extra = " " + "\n".join(f"- {o['value']}" for o in official[1:2] if o.get("value"))
            if val:
                br["recent_notice_text"] = val + extra
        elif official and cid in KEEP_CURRENT_TEXT:
            # 현행 요약이 더 구체적이면 유지하되, 최신 게시일이 더 최근이면 갱신
            cur = br.get("recent_notice_text") or ""
            cur_latest = max([i.get("date") for i in items if i.get("date")] or [""])
            rec_date = official[0].get("notice_date") or ""
            if not cur or (rec_date and rec_date > cur_latest):
                br["recent_notice_text"] = official[0].get("value") or cur

        if official or cid in MANUAL_SOURCE:
            srcs.append({"source": "공식 공지사항(교차검증 2026-11-27)",
                         "url": (official[0].get("source_url") if official else None)
                         or MANUAL_SOURCE.get(cid) or nt.get("url"),
                         "checked_at": CHECKED_D})
            col["official_site"] = "ok"
            stats["official"] += 1
        elif kakao and cid not in KAKAO_SKIP:
            core = ORG_PREFIX.sub("", (kakao[0].get("value") or "").strip())
            boiler = BOILER_ONLY.match(core) and sum(w in core for w in BOILER_WORDS) >= 2
            if core and not boiler and cid not in MANUAL_TEXT:
                cur = br.get("recent_notice_text") or ""
                prefix = "카카오골프예약 '골프장에서 알립니다'(2026-11-27 확인): "
                if not cur:
                    br["recent_notice_text"] = prefix + core
                elif not cur.startswith("카카오골프예약"):
                    br["recent_notice_text"] = cur.rstrip() + " " + prefix + core
            srcs.append({"source": "카카오골프예약 골프장에서 알립니다(교차검증 2026-11-27)",
                         "url": kakao[0].get("source_url"), "checked_at": CHECKED_D})
            stats["kakao"] += 1

        br["sources"] = srcs
        br["collected_at"] = CHECKED
        if cid in ALERTS:
            br["alert"] = ALERTS[cid]
            stats["alert"] += 1

    json.dump(data, open(SRC, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("courses:", len(by))
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
