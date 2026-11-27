#!/usr/bin/env python3
"""2026-11-27 보너스 배치: 응답 가능했던 HTTP0/404 구장 5곳 공지 채우기."""
import json, sys

SRC = "data/source/golf_courses_all_v29.json"
CHECKED = "2026-11-27T21:45:00+09:00"
REASON = "공식 홈페이지 확인(2026-11-27, 브라우저 직접 접속)"

GL = "https://www.goldlake.co.kr/board/notice"
PLZ = "https://www.plazacc.co.kr/plzcc/irsweb/golf2/customer/notice/list.do"
MID = "https://www.midasgolf.co.kr/Board/BoardList?lgubun=113&board_idx=1"
KOLON = "https://kolongolf.com/board/notice"
GC = "https://www.gochangcc.co.kr/html/company.asp#company04"

UPD = {
 "kr-golf-0009": dict(
  url=GL,
  items=[
   ("12월 07일(월) 대중제 예약관련 안내", "2026-11-06", "https://www.goldlake.co.kr/board/notice-view/12085"),
   ("12월 1박 2일 패키지", "2026-11-03", "https://www.goldlake.co.kr/board/notice-view/12077"),
   ("골드레이크 아마추어골프대회 예선 통과자(10월)", "2026-10-30", "https://www.goldlake.co.kr/board/notice-view/12073"),
  ],
  rnt="2026-11-06 12월 7일(월) 대중제 예약관련 안내, 2026-11-03 12월·11월 1박 2일 패키지, 2026-10-30 골드레이크 아마추어골프대회 예선 통과자(10월) 발표. 골프 딜리버리 서비스 안내도 홈에서 함께 게시."),
 "kr-golf-0184": dict(
  url=PLZ,
  items=[
   ("레스토랑(그릴) 동절기 운영(12/1~) [제주]", "2026-11-26", PLZ),
   ("12월 그린피 안내 [용인]", "2026-11-26", PLZ),
   ("레스토랑 운영시간안내(12/1~) [용인]", "2026-11-26", PLZ),
   ("시스템 정기점검으로 인한 온라인 서비스 중단 안내(2026.12.1) [전체]", "2026-11-26", PLZ),
   ("레스토랑 운영시간안내(11/10~) [용인]", "2026-11-05", PLZ),
   ("11월 야간 그린피 안내 [용인]", "2026-10-30", PLZ),
   ("2027년 연단체 접수 안내 [용인]", "2026-10-08", PLZ),
  ],
  rnt="2026-11-26 용인 12월 그린피 안내·레스토랑 운영시간(12/1~), 전체 시스템 정기점검으로 인한 온라인 서비스 중단(2026-12-01), 제주 그릴 동절기 운영(12/1~). 2026-11-05 레스토랑 운영시간(11/10~), 2026-10-30 11월 야간 그린피, 2026-10-08 2027년 연단체 접수."),
 "kr-golf-0192": dict(
  url=MID,
  items=[
   ("마이다스레이크 이천 26년도 12월 요금안내", "2026-11-10", "https://www.midasgolf.co.kr/Board/BoardView?lgubun=113&board_idx=1&bd_main_seq=1796"),
   ("[스타트하우스] 26년 겨울 시즌 메뉴 안내", "2026-11-06", "https://www.midasgolf.co.kr/Board/BoardView?lgubun=113&board_idx=1&bd_main_seq=1795"),
   ("[대식당] 26년 겨울 시즌 메뉴 안내", "2026-11-06", "https://www.midasgolf.co.kr/Board/BoardView?lgubun=113&board_idx=1&bd_main_seq=1794"),
   ("불법 매크로 및 부킹 판매 행위 근절을 위한 안내", "2026-10-26", "https://www.midasgolf.co.kr/Board/BoardView?lgubun=113&board_idx=1&bd_main_seq=1789"),
   ("26년도 11월 요금안내", "2026-10-13", MID),
   ("2026년 마이다스레이크 에어레이션 안내", "2026-09-11", MID),
  ],
  rnt="2026-11-10 12월 요금안내, 2026-11-06 스타트하우스·대식당 겨울 시즌 메뉴 안내(11월 중 적용), 2026-10-26 불법 매크로·부킹 판매 행위 근절 안내, 2026-10-13 11월 요금안내, 2026-09-11 2026년 에어레이션 안내. 12월 요금표는 공지 본문에서 확인."),
 "kr-golf-0299": dict(
  url=KOLON,
  items=[],
  rnt="스페셜오퍼 게시판 최신 6건: 골프장 휴장안내, 12월 1(화)~13(일) 이용요금, 12월 1(화)~13(일) 프로모션, 2인 30일 패키지, 11월 16~30일 이용요금(조회 3,934), 11월 16~30일 프로모션. 회원가입 없이 이용요금·프로모션별 상세를 볼 수 있고 게시판에는 작성일이 표시되지 않음. 골프클럽 대여·골프 딜리버리 안내도 함께 게시."),
 "kr-golf-0480": dict(
  url=GC,
  items=[
   ("1월 그린피 안내", "2026-11-27", GC),
   ("12월 15~31일 그린피 안내", "2026-10-30", GC),
   ("12월 1~14일 그린피 안내", "2026-10-30", GC),
   ("N골프 1억원 홀인원챌린지 4차", "2026-10-06", GC),
   ("11월 그린피 안내", "2026-09-28", GC),
   ("매일 셀렉스배 제31회 한국 시니어오픈", "2026-09-28", GC),
  ],
  rnt="2026-11-27 1월 그린피 안내, 2026-10-30 12월 1~14일·12월 15~31일 그린피 안내, 2026-10-06 N골프 1억원 홀인원챌린지 4차, 2026-09-28 11월 그린피 안내·제31회 한국 시니어오픈 개최. 홈 팝업에 노캐디 운영·홀인원 이벤트·11월~1월 요금 배너 게시."),
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
        if u["items"]:
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
        col["official_reason"] = REASON
        col["pages_collected"] = 2
        col["render_hint"] = "browser"
        col["plan_strategy"] = "browser_check(2026-11-27)"
    if set(UPD) - seen:
        print("MISSING:", sorted(set(UPD) - seen)); sys.exit(1)
    json.dump(data, open(SRC, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("updated", len(seen))


if __name__ == "__main__":
    main()
