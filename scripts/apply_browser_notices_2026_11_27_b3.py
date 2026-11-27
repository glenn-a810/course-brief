#!/usr/bin/env python3
"""2026-11-27 3차 배치: 무응답(HTTP0)·404로 공지가 비어 있던 20곳 — 브라우저 직접 확인 결과 반영."""
import json, sys

SRC = "data/source/golf_courses_all_v29.json"
CHECKED = "2026-11-27T22:00:00+09:00"

UPD = {
 # ---------------------------------------------------------------- 전남
 "kr-golf-0037": dict(
  url="https://www.verthillcc.co.kr/board/list.asp?type=1",
  items=[
   ("아트 골프 카트", "2026-10-21", "https://www.verthillcc.co.kr/board/list.asp?type=1"),
   ("5인플레이 VIP카트 예약 진행", "2026-09-17", "https://www.verthillcc.co.kr/board/list.asp?type=1"),
   ("한국미드아마추어 골프대회 종료", "2026-04-30", "https://www.verthillcc.co.kr/board/list.asp?type=1"),
  ],
  rnt="2026-10-21 아트 골프 카트, 2026-09-17 5인플레이 VIP카트 예약 진행, 2026-04-30 한국미드아마추어 골프대회 종료. 공지 게시판 최신글이 10월 21일자로, 2026년 11~12월 그린피 공지는 아직 없다.",
  reason="공식 홈페이지 공지사항(verthillcc.co.kr/board/list.asp?type=1) 확인(2026-11-27, 브라우저 직접 접속)",
 ),
 "kr-golf-0040": dict(
  url="https://www.solaseadocc.com/sub/notice.asp",
  items=[
   ("♥2027 솔라시도 패키지 안내(1/1~1/31)♥", "2026-11-06", "https://www.solaseadocc.com/sub/notice.asp"),
   ("2027 연단체 모집안내", "2026-10-29", "https://www.solaseadocc.com/sub/notice.asp"),
   ("♥2026 솔라시도 패키지 안내(12/1~12/31)♥", "2026-10-07", "https://www.solaseadocc.com/sub/notice.asp"),
   ("♥2026 솔라시도 패키지 안내(11/1~11/30)♥", "2026-09-03", "https://www.solaseadocc.com/sub/notice.asp"),
   ("2026년 10,11월 그린피 안내", "2026-09-03", "https://www.solaseadocc.com/sub/notice.asp"),
   ("3부 야간라운드 운영안내", "2026-08-01", "https://www.solaseadocc.com/sub/notice.asp"),
  ],
  rnt="2026-11-06 2027 솔라시도 패키지(1/1~1/31), 2026-10-29 2027 연단체 모집, 2026-10-07 2026 솔라시도 패키지(12/1~12/31), 2026-09-03 2026 패키지(11/1~11/30)와 2026년 10·11월 그린피 안내, 2026-08-01 3부 야간라운드 운영안내. 12월 그린피 공지는 아직 따로 없다.",
  reason="공식 홈페이지 공지사항(solaseadocc.com/sub/notice.asp) 확인(2026-11-27, 브라우저 직접 접속)",
 ),
 "kr-golf-0041": dict(
  url="https://www.pinebeachcc.co.kr/board/list.asp?type=1",
  items=[],
  rnt="오시아노는 파인비치와 같은 법인(주식회사 파인비치)·같은 부지의 9홀 대중제 코스로 전용 공지 게시판이 없다. 파인비치 통합 공지사항에서 오시아노가 언급된 최신글은 2025-11-18 '오시아노 18H 프로모션'이고, 2026년 오시아노 전용 공지는 확인되지 않는다. 통합 게시판의 2026-10-30 11월 그린피·2027 LPGA 패키지 공지는 파인비치 기준이다.",
  reason="공식(파인비치) 홈페이지 확인(2026-11-27) — 오시아노 코스 페이지(/course/o.asp)는 열리지만 전용 게시판은 없다",
 ),
 "kr-golf-0042": dict(
  url="https://www.pinebeachcc.co.kr/board/list.asp?type=1",
  items=[
   ("11월 그린피안내", "2026-10-30", "https://www.pinebeachcc.co.kr/board/list.asp?type=1"),
   ("♥2027 파인비치 LPGA Experience Package(1/1~1/31)♥", "2026-10-30", "https://www.pinebeachcc.co.kr/board/list.asp?type=1"),
   ("2026 BMW 레이디스 챔피언십 개최 안내 및 셔틀버스안내", "2026-10-06", "https://www.pinebeachcc.co.kr/board/list.asp?type=1"),
   ("♥2026 파인비치 LPGA Experience Package(12/01~12/31)♥", "2026-09-30", "https://www.pinebeachcc.co.kr/board/list.asp?type=1"),
   ("10월 그린피안내", "2026-09-29", "https://www.pinebeachcc.co.kr/board/list.asp?type=1"),
   ("♥2026 파인비치 LPGA Experience Package(11/01~11/30)♥", "2026-08-28", "https://www.pinebeachcc.co.kr/board/list.asp?type=1"),
  ],
  rnt="2026-10-30 11월 그린피안내·2027 파인비치 LPGA Experience Package(1/1~1/31), 2026-10-06 2026 BMW 레이디스 챔피언십 개최 및 셔틀버스 안내, 2026-09-30 2026 LPGA Experience Package(12/1~12/31), 2026-09-29 10월 그린피안내, 2026-08-28 2026 LPGA 패키지(11/1~11/30).",
  reason="공식 홈페이지 공지사항(pinebeachcc.co.kr/board/list.asp?type=1) 확인(2026-11-27, 브라우저 직접 접속)",
 ),
 # ---------------------------------------------------------------- 대구·경북
 "kr-golf-0057": dict(
  url="https://www.gunicc.co.kr/multi_board/site/board/list.asp?groupcode=NOTICE",
  items=[
   ("[공지] 단부제 운영안내", "2026-11-25", "https://www.gunicc.co.kr/multi_board/site/board/list.asp?groupcode=NOTICE"),
   ("[공지] 구니CC 12월 변동요금(그린피)", "2026-11-24", "https://www.gunicc.co.kr/multi_board/site/board/list.asp?groupcode=NOTICE"),
   ("[공지] 구니CC 12월 변동요금(그린피)", "2026-11-13", "https://www.gunicc.co.kr/multi_board/site/board/list.asp?groupcode=NOTICE"),
   ("[공지] 캐디피 인상 안내", "2026-11-13", "https://www.gunicc.co.kr/multi_board/site/board/list.asp?groupcode=NOTICE"),
   ("[공지] 11월 단체팀 특별 할인 이벤트", "2026-11-06", "https://www.gunicc.co.kr/multi_board/site/board/list.asp?groupcode=NOTICE"),
   ("[공지] 구니CC 11월 변동요금(그린피)", "2026-10-30", "https://www.gunicc.co.kr/multi_board/site/board/list.asp?groupcode=NOTICE"),
   ("[공지] 구니CC 11월 변동요금(그린피)", "2026-10-13", "https://www.gunicc.co.kr/multi_board/site/board/list.asp?groupcode=NOTICE"),
   ("[공지] 2027년 연단체 모집안내", "2026-10-01", "https://www.gunicc.co.kr/multi_board/site/board/list.asp?groupcode=NOTICE"),
  ],
  rnt="2026-11-25 단부제 운영안내(본문 이미지), 2026-11-24·11-13 구니CC 12월 변동요금(그린피), 2026-11-13 캐디피 인상 안내, 2026-11-06 11월 단체팀 특별 할인 이벤트, 2026-10-30·10-13 11월 변동요금, 2026-10-01 2027년 연단체 모집안내. 월별 변동요금제라 매달 그린피를 공지한다.",
  reason="공식 홈페이지 공지사항(gunicc.co.kr 공지 게시판) 확인(2026-11-27, 브라우저 직접 접속)",
 ),
 "kr-golf-0058": dict(
  url="https://www.ophelgc.com/_Gunwi/Board/BoardList.aspx?cfgid=notice",
  items=[
   ("2027년 군위오펠GC 연부킹 단체팀 신청 안내", "2026-11-02", "https://www.ophelgc.com/_Gunwi/Board/BoardView.aspx?post=10831&cfgid=notice&page=1&gubun=3"),
   ("그린 통기 작업 안내", "2026-10-12", "https://www.ophelgc.com/_Gunwi/Board/BoardView.aspx?post=10819&cfgid=notice&page=1&gubun=3"),
   ("SUMMER EVENT", "2026-06-16", "https://www.ophelgc.com/_Gunwi/Board/BoardView.aspx?post=10793&cfgid=notice&page=1&gubun=3"),
   ("5월 예약안내", "2026-04-28", "https://www.ophelgc.com/_Gunwi/Board/BoardView.aspx?post=10776&cfgid=notice&page=1&gubun=3"),
   ("3부 야간라운드 오픈 및 노캐디 운영안내", "2026-02-13", "https://www.ophelgc.com/_Gunwi/Board/BoardView.aspx?post=10761&cfgid=notice&page=1&gubun=3"),
  ],
  rnt="2026-11-02 2027년 군위오펠GC 연부킹 단체팀 신청 안내, 2026-10-12 그린 통기 작업 안내, 2026-06-16 SUMMER EVENT, 2026-04-28 5월 예약안내. 게시판 상단 고정글로 2026-02-13 3부 야간라운드 오픈 및 노캐디 운영안내가 있다. 군위 게시판에는 12월 그린피 공지가 아직 없다.",
  reason="공식 홈페이지(오펠GC 통합, 군위오펠 공지 게시판) 확인(2026-11-27, 브라우저 직접 접속)",
 ),
 "kr-golf-0297": dict(
  url="https://www.daegucc.co.kr/Board/BoardList?board_idx=1",
  items=[
   ("[공지] 3부 야간 운영 종료 안내", "2026-11-20", "https://www.daegucc.co.kr/Board/BoardList?board_idx=1"),
   ("[공지] 12월 비회원 요금안내", "2026-11-20", "https://www.daegucc.co.kr/Board/BoardList?board_idx=1"),
   ("[공지] 제3회 대구C.C 회원 FATHER & SON 친선 골프대회 조편성", "2026-11-18", "https://www.daegucc.co.kr/Board/BoardList?board_idx=1"),
   ("[공지] 2027년 신규단체 모집 안내", "2026-11-03", "https://www.daegucc.co.kr/Board/BoardList?board_idx=1"),
   ("[공지] 11/13(금) 행사로 인한 예약안내", "2026-10-28", "https://www.daegucc.co.kr/Board/BoardList?board_idx=1"),
  ],
  rnt="2026-11-20 3부 야간 운영 종료 안내·12월 비회원 요금안내, 2026-11-18 회원 FATHER & SON 친선 골프대회 조편성, 2026-11-03 2027년 신규단체 모집 안내, 2026-10-28 11/13(금) 행사로 인한 예약안내. 3부 야간 라운드는 종료됐다.",
  reason="공식 홈페이지 공지사항(daegucc.co.kr/Board/BoardList?board_idx=1) 확인(2026-11-27, 브라우저 직접 접속)",
 ),
 "kr-golf-0306": dict(
  url="https://golf.gtc.co.kr/lounge/lounge_news.asp",
  items=[
   ("12월 티업시간 및 입장요금 할인 안내", "2026-11-24", "https://golf.gtc.co.kr/lounge/lounge_news.asp"),
   ("2027년 보문골프클럽 연단체 추가 모집 안내", "2026-11-10", "https://golf.gtc.co.kr/lounge/lounge_news.asp"),
   ("고객 만족도 조사", "2026-11-09", "https://golf.gtc.co.kr/lounge/lounge_news.asp"),
   ("11월 티업시간 및 입장요금 안내", "2026-10-15", "https://golf.gtc.co.kr/lounge/lounge_news.asp"),
   ("예약 취소 및 위약 규정 변경 안내", "2026-04-01", "https://golf.gtc.co.kr/lounge/lounge_news.asp"),
  ],
  rnt="2026-11-24 12월 티업시간 및 입장요금 할인 안내, 2026-11-10 2027년 보문골프클럽 연단체 추가 모집, 2026-11-09 고객 만족도 조사, 2026-10-15 11월 티업시간 및 입장요금 안내, 2026-04-01 예약 취소 및 위약 규정 변경 안내. 게시판 상단 고정글은 2023-04-13 보문GC 2인 라운드 불가 안내.",
  reason="공식(경상북도문화관광공사) 홈페이지 공지사항 확인(2026-11-27, 브라우저 직접 접속)",
 ),
 "kr-golf-0343": dict(
  url="https://www.palmyhillscc.co.kr/info/list.asp?type=8",
  items=[
   ("남코스 그늘집 화장실 환경개선 공사안내", "2026-11-02", "https://www.palmyhillscc.co.kr/info/list.asp?type=8"),
   ("2027년 1부 신규 단체팀 모집", "2026-10-28", "https://www.palmyhillscc.co.kr/info/list.asp?type=8"),
   ("남코스 스타트하우스 운영중단 안내", "2026-10-13", "https://www.palmyhillscc.co.kr/info/list.asp?type=8"),
   ("캐디피 인상 안내", "2026-10-13", "https://www.palmyhillscc.co.kr/info/list.asp?type=8"),
   ("예약 및 개인팀 그린피 안내", "2026-05-19", "https://www.palmyhillscc.co.kr/info/list.asp?type=8"),
  ],
  rnt="2026-11-02 남코스 그늘집 화장실 환경개선 공사안내, 2026-10-28 2027년 1부 신규 단체팀 모집, 2026-10-13 남코스 스타트하우스 운영중단 안내·캐디피 인상 안내. 최신 그린피 공지는 2026-05-19 예약 및 개인팀 그린피 안내다(월별 그린피 공지는 없다).",
  reason="공식 홈페이지 고객안내>새소식(palmyhillscc.co.kr/info/list.asp?type=8) 확인(2026-11-27, 브라우저 직접 접속)",
 ),
 # ---------------------------------------------------------------- 수도권
 "kr-golf-0066": dict(
  url="https://www.incheoncc.com/multi_board/site/board/list.asp?groupcode=NOTICE",
  items=[
   ("12월 할인 안내", "2026-11-20", "https://www.incheoncc.com/multi_board/site/board/list.asp?groupcode=NOTICE"),
   ("2027년도 연단체 배정 공고", "2026-11-18", "https://www.incheoncc.com/multi_board/site/board/list.asp?groupcode=NOTICE"),
   ("11월 할인 안내", "2026-10-27", "https://www.incheoncc.com/multi_board/site/board/list.asp?groupcode=NOTICE"),
   ("2027년도 단체신청 안내 & 신청서 다운", "2026-10-12", "https://www.incheoncc.com/multi_board/site/board/list.asp?groupcode=NOTICE"),
   ("그린 개선 작업 안내", "2026-09-19", "https://www.incheoncc.com/multi_board/site/board/list.asp?groupcode=NOTICE"),
  ],
  rnt="2026-11-20 12월 할인 안내, 2026-11-18 2027년도 연단체 배정 공고, 2026-10-27 11월 할인 안내, 2026-10-12 2027년도 단체신청 안내·신청서, 2026-09-19 그린 개선 작업 안내.",
  reason="공식 홈페이지 공지사항 확인(2026-11-27, 브라우저 직접 접속) — 종전 :1436 포트 없이 https://www.incheoncc.com/ 로 접속된다",
  homepage="https://www.incheoncc.com/",
 ),
 "kr-golf-0097": dict(
  url="https://www.newkoreacc.co.kr/customer/customer01.asp",
  items=[
   ("2027년 동계휴장 안내", "2026-11-26", "https://www.newkoreacc.co.kr/customer/customer01_view.asp?seq=639"),
   ("회원 비빌번호 정기 변경 및 개인정보 보호 안내", "2026-11-12", "https://www.newkoreacc.co.kr/customer/customer01.asp"),
   ("2026년 회원 친선 골프대회 이모저모", "2026-11-10", "https://www.newkoreacc.co.kr/customer/customer01.asp"),
   ("금연 안내", "2026-10-22", "https://www.newkoreacc.co.kr/customer/customer01.asp"),
   ("골프 연습장 이용안내", "2026-10-17", "https://www.newkoreacc.co.kr/customer/customer01.asp"),
  ],
  rnt="2026-11-26 2027년 동계휴장 안내 — 2027년 1월 4일(월)부터 1월 24일(일)까지 21일간 휴장. 2026-11-12 회원 비밀번호 정기 변경 및 개인정보 보호 안내, 2026-11-10 회원 친선 골프대회, 2026-10-22 금연 안내, 2026-10-17 골프 연습장 이용안내.",
  reason="공식 홈페이지 공지사항(newkoreacc.co.kr/customer/customer01.asp) 확인(2026-11-27, 브라우저 직접 접속)",
 ),
 "kr-golf-0119": dict(
  url="https://www.saltbay.co.kr/Board/List?cfgid=notice",
  items=[
   ("[공지] 2027년 솔트베이골프클럽 신규 2차 연단체 모집", "2026-11-23", "https://www.saltbay.co.kr/Board/List?cfgid=notice"),
   ("[공지] 2027년 솔트베이골프클럽 신규 연단체 모집", "2026-10-28", "https://www.saltbay.co.kr/Board/List?cfgid=notice"),
   ("[공지] 예약일 오픈 변경안내", "2026-04-10", "https://www.saltbay.co.kr/Board/List?cfgid=notice"),
   ("[공지] [공지] 26년 연단체 스탬프 이벤트", "2026-02-09", "https://www.saltbay.co.kr/Board/List?cfgid=notice"),
  ],
  rnt="2026-11-23 2027년 신규 2차 연단체 모집, 2026-10-28 2027년 신규 연단체 모집, 2026-04-10 예약일 오픈 변경안내, 2026-02-09 26년 연단체 스탬프 이벤트. 2026년 11~12월 그린피 공지는 게시판에 따로 없다.",
  reason="공식 홈페이지 공지사항(saltbay.co.kr/Board/List?cfgid=notice) 확인(2026-11-27, 브라우저 직접 접속) — 종전 saltbaydrivingrange.co.kr 도메인 대신 대표 도메인 사용",
  homepage="https://www.saltbay.co.kr/",
 ),
 "kr-golf-0134": dict(
  url="https://www.golfzoncounty.com/golfclub/notice?golfclubSeq=64",
  items=[
   ("이달의 그린피 이글몬트_12월 그린피 안내", "2026-11-04", "https://www.golfzoncounty.com/golfclub/notice?golfclubSeq=64"),
   ("연단체 이글몬트_2027년 연단체 모집 안내", "2026-10-27", "https://www.golfzoncounty.com/golfclub/notice?golfclubSeq=64"),
   ("이달의 그린피 이글몬트_11월 그린피 안내", "2026-10-02", "https://www.golfzoncounty.com/golfclub/notice?golfclubSeq=64"),
   ("안내 [이글몬트, 안성H, 안성W] 5인플레이 운영 안내", "2026-07-24", "https://www.golfzoncounty.com/golfclub/notice?golfclubSeq=64"),
  ],
  rnt="2026-11-04 이글몬트 12월 그린피 안내, 2026-10-27 이글몬트 2027년 연단체 모집 안내, 2026-10-02 11월 그린피 안내, 2026-07-24 이글몬트·안성H·안성W 5인플레이 운영 안내.",
  reason="골프존카운티 통합 홈페이지 공지사항(golfclubSeq=64) 확인(2026-11-27, 브라우저 직접 접속) — 종전 gcounty/info/main?cc_code=63 경로는 404",
  homepage="https://www.golfzoncounty.com/golfclub/main?golfclubSeq=64",
 ),
 "kr-golf-0137": dict(
  url="https://ansung.hanlimgolf.co.kr/html/board/notice_list.asp",
  items=[
   ("[한림안성] 12월 그린피", "2026-11-07", "https://ansung.hanlimgolf.co.kr/html/board/notice_view.asp?b_idx=38&Page=1&searchField=b_subject&searchValue="),
   ("[한림안성] 11월 그린피", "2026-10-10", "https://ansung.hanlimgolf.co.kr/html/board/notice_list.asp"),
   ("[한림안성] 10월 그린피(10/1~11/1)", "2026-09-06", "https://ansung.hanlimgolf.co.kr/html/board/notice_list.asp"),
   ("[한림안성] 9월 그린피", "2026-08-09", "https://ansung.hanlimgolf.co.kr/html/board/notice_list.asp"),
   ("[한림안성] 9홀 운영 안내", "2026-05-10", "https://ansung.hanlimgolf.co.kr/html/board/notice_list.asp"),
  ],
  rnt="2026-11-07 12월 그린피, 2026-10-10 11월 그린피, 2026-09-06 10월 그린피(10/1~11/1), 2026-08-09 9월 그린피, 2026-05-10 9홀 운영 안내. 매달 그린피를 공지한다.",
  reason="공식 홈페이지(ansung.hanlimgolf.co.kr) 공지·이벤트 확인(2026-11-27, 브라우저 직접 접속) — 종전 golfzoncounty cc_code=7 경로는 골프존카운티 안성W로 한림안성과 다른 구장",
  homepage="https://ansung.hanlimgolf.co.kr/",
 ),
 "kr-golf-0149": dict(
  url="https://www.victoriagc.co.kr/07member/notice.asp",
  items=[
   ("2027년 1월 ~ 3월 예약오픈일", "2026-11-27", "https://www.victoriagc.co.kr/07member/noticeView.asp?idx=300&PageNum=1&Column=&SearchString="),
   ("12월 그린피 안내", "2026-11-16", "https://www.victoriagc.co.kr/07member/noticeView.asp?idx=297&PageNum=1&Column=&SearchString="),
   ("11월 하반기 그린피 안내", "2026-11-16", "https://www.victoriagc.co.kr/07member/noticeView.asp?idx=296&PageNum=1&Column=&SearchString="),
   ("2027년 연단체 모집안내", "2026-10-21", "https://www.victoriagc.co.kr/07member/noticeView.asp?idx=292&PageNum=1&Column=&SearchString="),
   ("2026년 10월 ~ 12월 예약오픈일", "2026-09-03", "https://www.victoriagc.co.kr/07member/noticeView.asp?idx=290&PageNum=1&Column=&SearchString="),
  ],
  rnt="2026-11-27 2027년 1~3월 예약오픈일, 2026-11-16 12월 그린피·11월 하반기 그린피 안내, 2026-10-21 2027년 연단체 모집안내, 2026-09-03 2026년 10~12월 예약오픈일. 메인 팝업에 11월 하반기·12월 그린피·연단체·1~3월 오픈일 배너가 함께 게시된다.",
  reason="공식 홈페이지 공지사항(victoriagc.co.kr/07member/notice.asp) 확인(2026-11-27, 브라우저 직접 접속)",
 ),
 "kr-golf-0170": dict(
  url="https://www.hansung-cc.co.kr/html/members/members01_hcc.asp",
  items=[
   ("2026. 12월 동계 그린피 할인 현황", "2026-11-24", "https://www.hansung-cc.co.kr/html/members/members01_hcc_view.asp?b_idx=270&GotoPage=1"),
   ("추석맞이 특별세일 8+1", "2026-08-30", "https://www.hansung-cc.co.kr/html/members/members01_hcc_view.asp?b_idx=269&GotoPage=1"),
   ("여름시즌 대식당 단축메뉴 운영안내", "2026-07-30", "https://www.hansung-cc.co.kr/html/members/members01_hcc_view.asp?b_idx=268&GotoPage=1"),
  ],
  rnt="2026-11-24 2026년 12월 동계 그린피 할인 현황, 2026-08-30 추석맞이 특별세일 8+1, 2026-07-30 여름시즌 대식당 단축메뉴 운영안내. 메인 팝업에 2027년 1부 연단체 추가 모집 안내와 12월 동계 그린피 할인 현황이 게시된다.",
  reason="공식 홈페이지 공지사항(hansung-cc.co.kr) 확인(2026-11-27, 브라우저 직접 접속)",
 ),
 "kr-golf-0205": dict(
  url="https://kugolf.co.kr/board/notice",
  items=[
   ("2026년 12월 2차 이용요금", "2026-11-10", "https://kugolf.co.kr/board/notice"),
   ("2026년 12월 1차 이용요금", "2026-11-10", "https://kugolf.co.kr/board/notice"),
   ("2027년 신규 연단체 추가 모집 안내", "2026-11-06", "https://kugolf.co.kr/board/notice"),
   ("2026년 11월 2차 이용요금", "2026-11-04", "https://kugolf.co.kr/board/notice"),
   ("2026년 11월 1차 이용요금", "2026-10-08", "https://kugolf.co.kr/board/notice"),
   ("2026년 10월 이용요금", "2026-09-10", "https://kugolf.co.kr/board/notice"),
   ("그린 통기작업 안내", "2026-09-03", "https://kugolf.co.kr/board/notice"),
  ],
  rnt="2026-11-10 2026년 12월 1차·2차 이용요금, 2026-11-06 2027년 신규 연단체 추가 모집 안내, 2026-11-04 11월 2차 이용요금, 2026-10-08 11월 1차 이용요금, 2026-09-10 10월 이용요금, 2026-09-03 그린 통기작업 안내. 상단 고정글은 2026년 일반단체 신청·클럽하우스 메뉴.",
  reason="공식 홈페이지 공지사항(kugolf.co.kr/board/notice) 확인(2026-11-27, 브라우저 직접 접속) — http://www.kugolf.co.kr/ 는 https://kugolf.co.kr/ 로 넘어간다",
  homepage="https://kugolf.co.kr/",
 ),
 "kr-golf-0230": dict(
  url="https://www.hwaseonggc.com/board/list.asp?type=1",
  items=[
   ("2026년 12월 상반기 요금 안내", "2026-11-17", "https://www.hwaseonggc.com/board/list.asp?type=1"),
   ("2026년 11월 하반기 요금 안내", "2026-11-02", "https://www.hwaseonggc.com/board/list.asp?type=1"),
   ("2026년 11월 상반기 요금 안내", "2026-10-13", "https://www.hwaseonggc.com/board/list.asp?type=1"),
   ("2027년 화성골프클럽 연단체 모집", "2026-10-12", "https://www.hwaseonggc.com/board/list.asp?type=1"),
   ("2026년 10월 요금 안내", "2026-09-10", "https://www.hwaseonggc.com/board/list.asp?type=1"),
  ],
  rnt="2026-11-17 2026년 12월 상반기 요금 안내, 2026-11-02 11월 하반기 요금, 2026-10-13 11월 상반기 요금, 2026-10-12 2027년 연단체 모집, 2026-09-10 10월 요금 안내. 매달 상·하반기로 나눠 요금을 공지한다.",
  reason="공식 홈페이지 공지사항(hwaseonggc.com/board/list.asp?type=1) 확인(2026-11-27, 브라우저 직접 접속) — 모바일 경로 대신 대표 주소 사용",
  homepage="https://www.hwaseonggc.com/",
 ),
 # ---------------------------------------------------------------- 전북
 "kr-golf-0488": dict(
  url="https://www.golfzoncounty.com/golfclub/notice?golfclubSeq=55",
  items=[
   ("연단체 드래곤_2027년 연단체 모집안내", "2026-10-31", "https://www.golfzoncounty.com/golfclub/notice?golfclubSeq=55"),
   ("이달의 그린피 12월 패키지 안내", "2026-10-30", "https://www.golfzoncounty.com/golfclub/notice?golfclubSeq=55"),
   ("이달의 그린피 12월 그린피 안내", "2026-10-30", "https://www.golfzoncounty.com/golfclub/notice?golfclubSeq=55"),
   ("이달의 그린피 11월 패키지 안내", "2026-09-26", "https://www.golfzoncounty.com/golfclub/notice?golfclubSeq=55"),
   ("이달의 그린피 11월 그린피 안내", "2026-09-26", "https://www.golfzoncounty.com/golfclub/notice?golfclubSeq=55"),
  ],
  rnt="2026-10-31 드래곤 2027년 연단체 모집안내, 2026-10-30 12월 그린피·12월 패키지 안내, 2026-09-26 11월 그린피·11월 패키지 안내. 매달 그린피와 패키지를 함께 공지한다.",
  reason="골프존카운티 통합 홈페이지 공지사항(golfclubSeq=55) 확인(2026-11-27, 브라우저 직접 접속) — 종전 dragonlake.co.kr 은 golfzoncounty 404로 넘어간다",
  homepage="https://www.golfzoncounty.com/golfclub/main?golfclubSeq=55",
 ),
}


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    seen = set()
    for c in data["courses"]:
        cid = c["course_id"]
        if cid not in UPD:
            continue
        seen.add(cid)
        u = UPD[cid]
        br = c.setdefault("briefing", {})
        nt = br.setdefault("notices", {})
        nt["url"] = u["url"]
        nt["items"] = [{"title": t, "date": d, "url": l} for t, d, l in u["items"]]
        nt.setdefault("tags", {})
        br["recent_notice_text"] = u["rnt"]
        br["collected_at"] = CHECKED
        srcs = br.get("sources")
        if not isinstance(srcs, list):
            srcs = []
        srcs = [s for s in srcs
                if "공식 공지사항(브라우저 확인)" not in (s.get("source", "") if isinstance(s, dict) else str(s))]
        srcs.append({"source": "공식 공지사항(브라우저 확인)", "url": u["url"], "checked_at": "2026-11-27"})
        br["sources"] = srcs
        col = c.setdefault("collection", {})
        col["official_site"] = "ok"
        col["official_reason"] = u["reason"]
        col["pages_collected"] = 2
        col["render_hint"] = "browser"
        col["plan_strategy"] = "browser_check(2026-11-27)"
        if u.get("homepage"):
            c["master"]["homepage"] = u["homepage"]

    if set(UPD) - seen:
        print("MISSING:", sorted(set(UPD) - seen))
        sys.exit(1)
    json.dump(data, open(SRC, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("updated", len(seen))


if __name__ == "__main__":
    main()
