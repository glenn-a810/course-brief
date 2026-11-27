#!/usr/bin/env python3
"""2026-11-27 브라우저 직접 확인 결과로 접속 차단/불가 구장의 공지사항을 채운다."""
import json, os, sys

SRC = "data/source/golf_courses_all_v29.json"
CHECKED = "2026-11-27T21:20:00+09:00"
REASON = "공식 홈페이지 확인(2026-11-27, 브라우저 직접 접속)"

S = "https://www.gayacc.com/notices"
B = "https://www.baystars.co.kr/html/service/service01_list.asp"
H = "https://www.haeundaebeachcc.com/board/boardList.do?groupcode=NOTICE"
U = "https://www.ulsancc.co.kr/board/view.asp?bod_name=gongji"
G = "https://www.gosungcc.com/07member/notice.asp"
BY = "https://www.woori-cc.co.kr/board/notice"
CJ = "https://www.hpnabicc.co.kr/html/customer/customer_01_list.asp"
HY = "https://www.hanyangcc.com/board/list.asp?type=1"
SE = "https://thesiena.co.kr/news?bn=%EB%8D%94+%EC%8B%9C%EC%97%90%EB%82%98+%EC%84%9C%EC%9A%B8+%EC%BB%A8%ED%8A%B8%EB%A6%AC%ED%81%B4%EB%9F%BD"
BE = "https://thesiena.co.kr/news?bn=%EB%8D%94+%EC%8B%9C%EC%97%90%EB%82%98+%EB%B2%A8%EB%A3%A8%ED%86%A0+%EC%BB%A8%ED%8A%B8%EB%A6%AC%ED%81%B4%EB%9F%BD"
PC = "https://www.pinecreek.co.kr/index_pinecreek.asp"
LS = "https://www.lakeside.kr/board/boardList.do?groupcode=NOTICE"
H1 = "https://www.h1club.co.kr/html/board/notice.asp"
PG = "https://www.paragio.co.kr/blt/notice"
BR = "https://www.boracc.com/info/news.asp"
MY = "http://www.miryangcc.co.kr/Board/BoardList.aspx?cfgid=notice"
DP = "https://www.dongpusancc.co.kr/community/notice.asp"
A1 = "https://www.a-onecc.co.kr/info_newnotice.asp"
DW = "https://dongwonresort.co.kr/_mobile/multi_board/site/board/list.asp?groupcode=NOTICE"
AD = "https://www.adelscott.co.kr/multi_board/site/board/list.asp?groupcode=NOTICE"
BN = "https://www.benestgolf.com/reve/pc/board/notice.do"
GC = "https://www.geochang.go.kr/golf/"

UPD = {
 "kr-golf-0353": dict(
  url=S,
  items=[
   ("12월 비회원 할인 요금 안내 (12/14~31)", "2026-11-27", "https://www.gayacc.com/notices/54"),
   ("비정상 예약에 대한 징계 규정 안내", "2026-11-25", S),
   ("2027년도 회원제 고정서클(신규) 등록 안내", "2026-11-18", S),
   ("가야CC 내 영업용 시설 부지 그늘집 3개소 임대 공고", "2026-11-16", "https://www.gayacc.com/notices/43"),
   ("12월 비회원 할인 요금 안내 (12/1~13)", "2026-11-16", "https://www.gayacc.com/notices/1"),
   ("2027년도 회원제 고정서클(기존) 등록 안내", "2026-10-27", S),
   ("2027년도 퍼블릭 서클 모집", "2026-10-16", "https://www.gayacc.com/notices/30"),
  ],
  rnt="2026-11-27 12월 비회원 할인요금(12/14~31): 회원제 1부 월요일 08:00 이전 13만·08:01~09:00 14만·09:01~11:00 18만·11:01~2부 21만원(화·금 동일), 라이트1 14만·라이트2 12만원, 토·공휴일 08:00 이전 21만원. 2026-11-25 비정상 예약 징계 규정, 2026-11-18 2027년 회원제 고정서클(신규) 등록, 2026-11-16 12월 할인요금(12/1~13)·그늘집 3개소 임대 공고, 2026-10-16 2027년 퍼블릭 서클 모집."),
 "kr-golf-0078": dict(
  url=B,
  items=[
   ("2026.12.14~12.31 그린피 안내", "2026-11-13", "https://www.baystars.co.kr/html/service/service01_view.asp?b_idx=105"),
   ("2026.12.01~12.13 그린피 안내", "2026-11-04", "https://www.baystars.co.kr/html/service/service01_view.asp?b_idx=104"),
   ("27년도 연단체 모집", "2026-10-20", "https://www.baystars.co.kr/html/service/service01_view.asp?b_idx=103"),
   ("2026.11.01~11.30 그린피 안내", "2026-10-06", "https://www.baystars.co.kr/html/service/service01_view.asp?b_idx=102"),
   ("캐디피 인상 안내", "2026-10-05", "https://www.baystars.co.kr/html/service/service01_view.asp?b_idx=101"),
  ],
  rnt="2026-11-13 12월 14~31일 그린피 안내, 2026-11-04 12월 1~13일 그린피 안내, 2026-10-20 2027년 연단체 모집, 2026-10-06 11월 그린피 안내, 2026-10-05 캐디피 인상 안내. 그린피표는 공지 본문 이미지로 게시되며 홈 팝업으로도 11월·12월 그린피·VIP리무진카트·캐디피 변경 안내 중."),
 "kr-golf-0055": dict(
  url=H,
  items=[
   ("12월 9~10일 (수~목) 2부 영업안내", "2026-11-18", "https://www.haeundaebeachcc.com/board/boardView.do?groupcode=NOTICE&bbsno=721&seq=0&depth=0&kind=1"),
   ("[공지] 동계특별이벤트", "2026-11-11", "https://www.haeundaebeachcc.com/board/boardView.do?groupcode=NOTICE&bbsno=717&seq=0&depth=0&kind=1"),
   ("12월 14일 ~ 31일 운영안내", "2026-11-05", "https://www.haeundaebeachcc.com/board/boardView.do?groupcode=NOTICE&bbsno=716&seq=0&depth=0&kind=1"),
   ("12월 1일 ~ 12월 13일 운영안내", "2026-10-29", "https://www.haeundaebeachcc.com/board/boardView.do?groupcode=NOTICE&bbsno=715&seq=0&depth=0&kind=1"),
   ("11월 9~10일 (월~화) 2부 영업안내", "2026-10-23", H),
   ("2027년 연간단체 모집 안내", "2026-10-16", H),
  ],
  rnt="2026-11-18 12월 9~10일(수·목) 2부 영업안내, 2026-11-11 동계특별이벤트(조회 1,694), 2026-11-05 12월 14~31일 운영안내, 2026-10-29 12월 1~13일 운영안내, 2026-10-23 11월 9~10일 2부 영업안내. 2027년 연간단체 모집 안내(2026-10-16)는 홈 팝업으로 게시 중. 12월 잔여타임은 마운틴·오션코스 별로 홈에서 확인."),
 "kr-golf-0083": dict(
  url=U,
  items=[
   ("2027년 12월 비사원 입장료 안내", "2026-11-23", "https://www.ulsancc.co.kr/board/view_content.asp?idx=19281&bod_name=gongji"),
   ("평일 조조 비회원 입장객 조식 무료 제공 안내", "2026-11-06", "https://www.ulsancc.co.kr/board/view_content.asp?idx=19280&bod_name=gongji"),
   ("2026년 11월 비사원 입장료 안내", "2026-10-19", "https://www.ulsancc.co.kr/board/view_content.asp?idx=19278&bod_name=gongji"),
   ("정규 써클 모집 안내", "2026-10-08", "https://www.ulsancc.co.kr/board/view_content.asp?idx=19277&bod_name=gongji"),
  ],
  rnt="2026-11-23 12월 비사원(비회원) 입장료 안내 — 게시 제목은 '2027년 12월'로 올라와 있으나 첨부 그린피 팝업 파일은 2026년 12월 기준. 1부 주중 11만~17.2만원·토·일·공휴일 16만~22만원, 2부 주중 13만~17.2만원·주말 18만~22만원, 카트비 팀당 10만원·캐디피 1·2부 팀당 14만원(3부 15만원) 별도. 2026-11-06 평일 조조 비회원 입장객 조식 무료 제공, 2026-10-19 11월 비사원 입장료, 2026-10-08 정규 써클 모집."),
 "kr-golf-0352": dict(
  url=G,
  items=[
   ("12월 1일 ~ 13일 그린피 안내", "2026-11-16", "https://www.gosungcc.com/07member/noticeView.asp?idx=113&PageNum=1&Column=&SearchString="),
   ("11월 3부 할인이벤트", "2026-11-02", "https://www.gosungcc.com/07member/noticeView.asp?idx=112&PageNum=1&Column=&SearchString="),
   ("11월 1일 ~ 30일 그린피 안내", "2026-10-16", "https://www.gosungcc.com/07member/noticeView.asp?idx=111&PageNum=1&Column=&SearchString="),
  ],
  rnt="2026-11-16 12월 1~13일 그린피 안내, 2026-11-02 11월 3부 할인 이벤트 — 11/4~11/30 3부(16:30~18:36) 팀당 월~목 22만·금 26만·토·공휴일 30만·일 26만원(카트비 포함), 기존 예약 자동 적용·타 할인 중복 불가, 18홀 기준, 3팀 미만이면 9홀 진행 또는 환불, 무료취소는 3일 전 17시까지. 2026-10-16 11월 1~30일 그린피 안내."),
 "kr-golf-0034": dict(
  url=BY,
  items=[
   ("패밀리카드 출시", "2026-09-16", BY),
   ("2026 여름 그린피 할인 이벤트", "2026-07-13", BY),
   ("26년 2인 플레이 운영안내", "2026-07-05", BY),
  ],
  rnt="2026년 10~11월 신규 공지 없음. 게시판 최신은 2026-09-16 '패밀리카드 출시', 2026-07-13 '2026 여름 그린피 할인 이벤트', 2026-07-05 '26년 2인 플레이 운영안내'. 2인 플레이 안내는 홈 팝업으로도 게시 중."),
 "kr-golf-0039": dict(
  url=CJ,
  items=[
   ("12월 21일~ 그린피 할인 안내", "2026-11-26", "https://www.hpnabicc.co.kr/html/customer/customer_01_view.asp?b_idx=122"),
   ("11월 30일~ 그린피 할인 안내", "2026-11-02", "https://www.hpnabicc.co.kr/html/customer/customer_01_view.asp?b_idx=121"),
   ("10월 31일~ 그린피 할인", "2026-10-02", "https://www.hpnabicc.co.kr/html/customer/customer_01_view.asp?b_idx=120"),
   ("10월 3일~ 그린피 할인 안내", "2026-09-03", "https://www.hpnabicc.co.kr/html/customer/customer_01_view.asp?b_idx=119"),
  ],
  rnt="2026-11-26 12월 21일~ 그린피 할인 안내, 2026-11-02 11월 30일~ 그린피 할인, 2026-10-02 10월 31일~ 그린피 할인. 홈 팝업에 규정 변경·레스토랑 운영·5인 플레이·2026년 연단체·예약 오픈일 변경 안내를 함께 게시."),
 "kr-golf-0099": dict(
  url=HY,
  items=[
   ("현관(경비) 및 사내단순업무용역 통합 관리업체 선정 입찰공고", "2026-11-27", "https://www.hanyangcc.com/board/view.asp?type=1&idx=16899"),
   ("사내 세탁물 처리 용역업체 선정 입찰공고", "2026-11-27", "https://www.hanyangcc.com/board/view.asp?type=1&idx=16898"),
   ("한양CC 전기차 충전시설 이설 및 증설 공사 입찰공고", "2026-11-13", "https://www.hanyangcc.com/board/view.asp?type=1&idx=16896"),
   ("(마감) 2027 동남아 4개국 친선대회 및 푸켓 골프투어 참가자 모집", "2026-11-12", "https://www.hanyangcc.com/board/view.asp?type=1&idx=16895"),
   ("클럽하우스 재건축 준공 및 사용승인 완료 안내", "2026-11-09", "https://www.hanyangcc.com/board/view.asp?type=1&idx=16894"),
   ("12월 예약 안내", "2026-11-04", "https://www.hanyangcc.com/board/view.asp?type=1&idx=16893"),
   ("2027년 한양컨트리클럽 신규 연단체 신청 안내", "2026-10-26", "https://www.hanyangcc.com/board/view.asp?type=1&idx=16891"),
  ],
  rnt="2026-11-27 현관(경비)·사내단순업무용역 통합관리업체 선정 입찰공고와 사내 세탁물 처리 용역업체 입찰공고, 2026-11-13 전기차 충전시설 이설·증설 공사 입찰공고, 2026-11-09 클럽하우스 재건축 준공·사용승인 완료 안내, 2026-11-04 12월 예약 안내, 2026-10-26 2027년 신규 연단체 신청 안내. 2026-11-12 2027 동남아 4개국 친선대회·푸켓 골프투어 참가자 모집은 마감."),
 "kr-golf-0109": dict(
  url=SE,
  items=[
   ("[안내] 동계 휴장 안내", "2026-11-24",
    "https://thesiena.co.kr/news/203?bn=%EB%8D%94+%EC%8B%9C%EC%97%90%EB%82%98+%EC%84%9C%EC%9A%B8+%EC%BB%A8%ED%8A%B8%EB%A6%AC%ED%81%B4%EB%9F%BD"),
   ("[안내] 매크로 등 불법 예약 프로그램 사용 금지 안내", "2026-10-13", SE),
   ("[공지] 캐디피 인상 안내", "2026-07-28", SE),
   ("[안내] 4인 1조 운영 기준 및 요금 적용 안내", "2026-02-18", SE),
  ],
  rnt="2026-11-24 동계 휴장 안내 — 휴장 2027-01-01(금)~2027-02-11(목), 개장 예정 2027-02-12(금), 기상 상황에 따라 변동될 수 있고 예약 오픈일은 추후 문자·홈페이지로 안내. 2026-10-13 매크로 등 불법 예약 프로그램 사용 금지 안내, 2026-07-28 캐디피 인상 안내, 2026-02-18 4인 1조 운영 기준·요금 적용 안내. 12월 요금 공지는 아직 없음."),
 "kr-golf-0150": dict(
  url=BE,
  items=[
   ("2026년 12월 요금 안내", "2026-10-27",
    "https://thesiena.co.kr/news/202?bn=%EB%8D%94+%EC%8B%9C%EC%97%90%EB%82%98+%EB%B2%A8%EB%A3%A8%ED%86%A0+%EC%BB%A8%ED%8A%B8%EB%A6%AC%ED%81%B4%EB%9F%BD"),
   ("[공지] 2027년 연단체 모집 안내", "2026-10-12", BE),
   ("2026년 11월 요금 안내", "2026-10-01", BE),
   ("1박 2일 골프 패키지 이용약관", "2026-08-13", BE),
   ("[공지] 예약시스템 변경 안내", "2026-03-30", BE),
  ],
  rnt="2026-10-27 12월 요금 안내, 2026-10-12 2027년 연단체 모집 안내, 2026-10-01 11월 요금 안내, 2026-08-13 1박 2일 골프 패키지 이용약관, 2026-03-30 예약시스템 변경 안내. 월별 요금표는 공지 본문에서 확인."),
 "kr-golf-0135": dict(
  url=PC,
  items=[
   ("동계 휴장 안내", "2026-11-27", "https://www.pinecreek.co.kr/html_creek/board/notice_view.asp?b_idx=97"),
   ("파인크리크 1월 이용요금 안내", "2026-11-23", PC),
   ("휴장안내 (12월 7일 월요일)", "2026-11-11", PC),
   ("2027년 신규 연단체 모집", "2026-11-03", PC),
   ("파인크리크 12월 이용요금 안내", "2026-10-26", PC),
  ],
  rnt="2026-11-27 동계 휴장 안내 — 2027-01-04(월)~2027-02-10(수), 클럽하우스 일부 및 코스 내 카트 도로 정비. 2026-11-23 1월 이용요금 안내, 2026-11-11 12월 7일(월) 휴장 안내, 2026-11-03 2027년 신규 연단체 모집, 2026-10-26 12월 이용요금 안내. 예약 달력 기준 11/29~12/6 대부분 예약 가능, 12/7·12/31~1/3은 휴장."),
 "kr-golf-0172": dict(
  url=LS,
  items=[
   ("PAR3홀 홀인원 광고주 모집 안내", "2026-10-19", LS),
   ("꼭 알아야 할 2026 로컬룰 변경 및 신설", "2026-04-28", LS),
   ("제40기 결산공고", "2026-03-26", LS),
   ("클럽하우스 처마 보수공사 안내", "2026-01-16", LS),
   ("명의개서수수료 변경 안내 (2026.02.15 시행)", "2026-01-16", LS),
  ],
  rnt="2026-10-19 PAR3홀 홀인원 광고주 모집 안내, 2026-04-28 2026 로컬룰 변경·신설, 2026-03-26 제40기 결산공고, 2026-01-16 클럽하우스 처마 보수공사·명의개서수수료 변경 안내. 11월 팝업은 예약 미이행(No-show) 회원 웹예약 영구정지 안내."),
 "kr-golf-0197": dict(
  url=H1,
  items=[
   ("KLPGA 대회 일정 관련 예약안내", "2026-09-07", H1),
   ("리턴 챌린지 이벤트", "2026-07-16", H1),
   ("단부제 운영 안내", "2026-07-03", H1),
  ],
  rnt="2026년 10~11월 신규 공지 없음. 게시판 최신은 2026-09-07 KLPGA 대회 일정 관련 예약안내, 2026-07-16 리턴 챌린지 이벤트, 2026-07-03 단부제 운영 안내. 홈 팝업은 코스 내 금연 안내."),
 "kr-golf-0336": dict(
  url=PG,
  items=[
   ("12월 그린피 안내", "2026-10-31", PG),
   ("11월 그린피 안내", "2026-10-07", PG),
   ("2027년 연단체 신청 안내", "2026-09-22", PG),
  ],
  rnt="2026-10-31 12월 그린피 안내, 2026-10-07 11월 그린피 안내, 2026-09-22 2027년 연단체 신청 안내. 홈 배너에도 11월·12월 그린피 안내를 함께 게시."),
 "kr-golf-0516": dict(
  url=HY,
  items=[
   ("현관(경비) 및 사내단순업무용역 통합 관리업체 선정 입찰공고", "2026-11-27", "https://www.hanyangcc.com/board/view.asp?type=1&idx=16899"),
   ("사내 세탁물 처리 용역업체 선정 입찰공고", "2026-11-27", "https://www.hanyangcc.com/board/view.asp?type=1&idx=16898"),
   ("한양CC 전기차 충전시설 이설 및 증설 공사 입찰공고", "2026-11-13", "https://www.hanyangcc.com/board/view.asp?type=1&idx=16896"),
   ("클럽하우스 재건축 준공 및 사용승인 완료 안내", "2026-11-09", "https://www.hanyangcc.com/board/view.asp?type=1&idx=16894"),
   ("12월 예약 안내", "2026-11-04", "https://www.hanyangcc.com/board/view.asp?type=1&idx=16893"),
  ],
  reason="서울한양컨트리클럽(hanyangcc.com)과 같은 사이트로 연결 — 공지도 동일(2026-11-27 확인)",
  rnt="seoulcc.co.kr 접속 시 서울한양컨트리클럽 홈으로 연결되며 공지도 같음. 2026-11-27 입찰공고 2건(현관·경비 용역, 세탁물 처리), 2026-11-13 전기차 충전시설 이설·증설 공사, 2026-11-09 클럽하우스 재건축 준공·사용승인 완료, 2026-11-04 12월 예약 안내, 2026-10-26 2027년 신규 연단체 신청 안내."),
 "kr-golf-0080": dict(
  url=BR,
  items=[
   ("12월 운영시간 안내", "2026-11-13", "https://www.boracc.com/info/news.asp?view_yn=Y&kind=NN1&bbsno=496"),
   ("12월 그린피 안내", "2026-11-13", "https://www.boracc.com/info/news.asp?view_yn=Y&kind=NN1&bbsno=495"),
   ("11월 그린피 안내", "2026-10-07", "https://www.boracc.com/info/news.asp?view_yn=Y&kind=NN1&bbsno=494"),
   ("2027년 신규서클 모집안내", "2026-10-02", "https://www.boracc.com/info/news.asp?view_yn=Y&kind=NN1&bbsno=493"),
   ("11월 운영시간 안내", "2026-10-02", "https://www.boracc.com/info/news.asp?view_yn=Y&kind=NN1&bbsno=492"),
  ],
  rnt="2026-11-13 12월 운영시간·12월 그린피 안내, 2026-10-07 11월 그린피 안내, 2026-10-02 11월 운영시간·2027년 신규서클 모집안내(10/12부터 선착순, 1부 그린피 6시대 12만~13만원·7시대 13만~14만원, 2부 13:40 이전 17만~19만원, 1부 서클은 셀프라운드(노캐디) 카트료 12만원)."),
 "kr-golf-0363": dict(
  url=MY,
  items=[
   ("12월 그린피 안내", "2026-11-23", "http://www.miryangcc.co.kr/Board/BoardView.aspx?post=2844&cfgid=notice"),
   ("11월 이벤트 안내", "2026-10-27", "http://www.miryangcc.co.kr/Board/BoardView.aspx?post=2843&cfgid=notice"),
   ("10월 그린피 안내", "2026-09-28", "http://www.miryangcc.co.kr/Board/BoardView.aspx?post=2841&cfgid=notice"),
  ],
  rnt="2026-11-23 12월 그린피 안내, 2026-10-27 11월 이벤트 안내, 2026-09-28 10월 그린피 안내. 홈 팝업에 12월 그린피·연단체 수지모집·음식물 반입금지·레스토랑 메뉴 안내를 게시."),
 "kr-golf-0368": dict(
  url=DP,
  items=[
   ("(주)국제식품배 제24회 부산MBC 골프대회 선발전 경기결과", "2026-08-10", DP),
   ("(주)국제식품배 제24회 부산MBC 골프대회 선발전 조편성", "2026-08-07", DP),
   ("2026년도 클럽챔피언 선발 선수권대회 안내", "2026-07-27", DP),
   ("2026년 경남도지사배 아마추어골프 선수권대회 안내", "2026-07-24", DP),
  ],
  rnt="2026년 10~11월 신규 공지 없음. 게시판 최신은 2026-08-10 (주)국제식품배 제24회 부산MBC 골프대회 선발전 경기결과, 2026-08-07 선발전 조편성, 2026-07-27 클럽챔피언 선발 선수권대회 안내. 2026-06-08 캐디피 인상 안내 이후 요금 관련 공지 없음."),
 "kr-golf-0372": dict(
  url=A1,
  items=[
   ("2027년 연단체 모집 공고문", "2026-11-07", "https://www.a-onecc.co.kr/info_newnoticeView.asp?bType=news&Bid=225"),
   ("리무진카트 운영 안내", "2026-10-29", "https://www.a-onecc.co.kr/info_newnoticeView.asp?bType=news&Bid=224"),
   ("예약자 본인 미내장 관련 조치 안내", "2026-10-12", "https://www.a-onecc.co.kr/info_newnoticeView.asp?bType=news&Bid=222"),
   ("대회기간 운영 안내", "2026-09-08", "https://www.a-onecc.co.kr/info_newnoticeView.asp?bType=news&Bid=221"),
   ("예약 및 취소 규정 변경 안내", "2026-05-05", A1),
  ],
  rnt="2026-11-07 2027년 연단체 모집 공고문, 2026-10-29 리무진카트 운영 안내, 2026-10-12 예약자 본인 미내장 관련 조치 안내(고정 공지), 2026-09-08 대회기간 운영 안내, 2026-05-05 예약·취소 규정 변경 안내(고정 공지)."),
 "kr-golf-0382": dict(
  url=DW,
  items=[
   ("그린피 안내(2026년 12월 21일~31일)", "2026-11-06", DW),
   ("그린피 안내(2026년 12월 1일~20일)", "2026-11-06", DW),
   ("동계시즌 서울-통영 리무진 운행", "2026-10-28", DW),
   ("스탬프 이벤트", "2026-10-13", DW),
   ("교통통제 협조 안내 [2026 통영 그란폰도]", "2026-10-02", DW),
   ("교통통제 협조 안내 [2026 통영 월드 트라이애슬론컵 대회]", "2026-10-02", DW),
  ],
  rnt="2026-11-06 12월 1~20일·12월 21~31일 그린피 안내, 2026-10-28 동계시즌 서울-통영 리무진 운행, 2026-10-13 스탬프 이벤트, 2026-10-02 통영 그란폰도·월드 트라이애슬론컵 교통통제 협조 안내. 같은 게시판에 리조트 공지(카라반·조식뷔페)도 함께 올라옴."),
 "kr-golf-0385": dict(
  url=AD,
  items=[
   ("핫한 동계 챌린지", "2026-11-24", "https://www.adelscott.co.kr/multi_board/site/board/view.asp?groupcode=NOTICE&kind=0&bbsno=392&seq=0&depth=0&open_state=1"),
   ("12월 그린피 안내", "2026-10-31", AD),
   ("단풍사진 콘테스트", "2026-10-09", AD),
   ("2027 연단체 모집", "2026-09-30", "https://www.adelscott.co.kr/multi_board/site/board/view.asp?groupcode=NOTICE&kind=0&bbsno=387&seq=0&depth=0&open_state=1"),
   ("11월 그린피 안내", "2026-09-30", AD),
  ],
  rnt="2026-11-24 핫한 동계 챌린지 — 이벤트 기간 12/14~2/28, 1박 2일 패키지 36홀(18+18) 일~목 22만·금~토 24만·토~일 26만원, 45홀 28만~32만원, 54홀 34만~38만원, 그린피·카트비·숙박(라운지)·조식 포함(캐디피·식음료 별도), 2일 이상 진행 시 조식 무료, 노캐디·2인 플레이 가능·중복할인 불가. 2026-10-31 12월 그린피 안내, 2026-09-30 2027 연단체 모집·11월 그린피 안내."),
 "kr-golf-0049": dict(
  url=BN,
  reason="삼성물산 리조트부문 베네스트골프 공지사항에서 확인(2026-11-27)",
  items=[
   ("동래베네스트 겨울철 페어웨이 관리 안내", "2026-10-30", BN),
   ("글렌로스 2026년 11월 이용요금 안내", "2026-10-02", BN),
   ("안성베네스트 (챌린지코스) 2026년 11월 이용요금 안내", "2026-10-02", BN),
   ("Npay 제휴 안내", "2026-09-20", BN),
   ("노쇼 등에 대한 위약금 제도 시행 안내", "2026-09-01", BN),
  ],
  rnt="2026-10-30 동래베네스트 겨울철 페어웨이 관리 안내(베네스트골프 공지사항), 2026-10-02 글렌로스·안성베네스트 11월 이용요금 안내, 2026-09-20 Npay 제휴 안내, 2026-09-01 노쇼 등 위약금 제도 시행 안내. 클럽 단독 사이트 대신 삼성물산 베네스트골프 공지사항에서 동래베네스트 소식을 함께 게시."),
 "kr-golf-0349": dict(
  url=GC,
  reason="거창군 직영 홈페이지 확인(2026-11-27)",
  items=[
   ("동절기 그린 착색제 작업 안내", "2026-11-26", "https://www.geochang.go.kr/golf/board/view/NOTICE/23002"),
   ("동절기 한파에 따른 9홀 2인 플레이 한시 운영 안내", "2026-11-25", "https://www.geochang.go.kr/golf/board/view/NOTICE/22952"),
   ("음식물 반입 제한", "2026-11-09", "https://www.geochang.go.kr/golf/board/view/NOTICE/21952"),
   ("12월 군민의 날 예약 관련 안내", "2026-10-22", "https://www.geochang.go.kr/golf/board/view/NOTICE/20954"),
   ("11월 이용요금 및 공지사항", "2026-09-28", "https://www.geochang.go.kr/golf/board/view/NOTICE/19952"),
  ],
  rnt="2026-11-26 동절기 그린 착색제 작업 안내, 2026-11-25 동절기 한파에 따른 9홀 2인 플레이 한시 운영 안내, 2026-11-09 음식물 반입 제한, 2026-10-22 12월 군민의 날 예약 관련 안내, 2026-09-28 11월 이용요금 및 공지사항."),
}


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    courses = data["courses"]
    seen = set()
    for c in courses:
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
        srcs.append({"source": "공식 공지사항(브라우저 확인)", "url": u["url"], "checked_at": "2026-11-27"})
        br["sources"] = srcs
        col = c.setdefault("collection", {})
        col["official_site"] = "ok"
        col["official_reason"] = u.get("reason", REASON)
        col["pages_collected"] = 2
        col["render_hint"] = "browser"
        col["plan_strategy"] = "browser_check(2026-11-27)"
    missing = set(UPD) - seen
    if missing:
        print("MISSING:", sorted(missing)); sys.exit(1)
    json.dump(data, open(SRC, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("updated", len(seen), "courses")


if __name__ == "__main__":
    main()
