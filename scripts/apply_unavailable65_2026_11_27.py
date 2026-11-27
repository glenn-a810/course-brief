#!/usr/bin/env python3
"""2026-11-27 unavailable 65곳 배치 반영.

- official_site == unavailable 65곳을 브라우저·웹 검색으로 직접 확인한 결과(findings-65_2026-11-27.json)와
  카카오골프예약 '골프장에서 알립니다' 데이터를 반영한다.
- 공식 공지 게시판에서 텍스트 공지를 확인한 곳: briefing.notices/items + recent_notice_text + sources(공식) + official_site=ok
- 공식 채널이 없거나 텍스트 공지가 없는 곳: recent_notice_text(카카오 또는 확인 사실) + sources(카카오) + official_reason 갱신
"""
import json, sys

SRC = "data/source/golf_courses_all_v29.json"
FINDINGS = "docs/findings-65_2026-11-27.json"
KAKAO_CORE = "/workspace/tmp-kakao/kakao_core.json"
CHECKED = "2026-11-27T23:40:00+09:00"
CHECKED_D = "2026-11-27"

# 공식 공지 텍스트를 확보한 곳 (official_site=ok)
OFFICIAL_OK = {
    "kr-golf-0008", "kr-golf-0013", "kr-golf-0014", "kr-golf-0018", "kr-golf-0030",
    "kr-golf-0033", "kr-golf-0059", "kr-golf-0060", "kr-golf-0061", "kr-golf-0065",
    "kr-golf-0087", "kr-golf-0090", "kr-golf-0094", "kr-golf-0100", "kr-golf-0110",
    "kr-golf-0112", "kr-golf-0129", "kr-golf-0136", "kr-golf-0144", "kr-golf-0156",
    "kr-golf-0171", "kr-golf-0175", "kr-golf-0187", "kr-golf-0190", "kr-golf-0211",
    "kr-golf-0212", "kr-golf-0223", "kr-golf-0227", "kr-golf-0228", "kr-golf-0315",
    "kr-golf-0322", "kr-golf-0332", "kr-golf-0337", "kr-golf-0344", "kr-golf-0152",
    "kr-golf-0495", "kr-golf-0400", "kr-golf-0493", "kr-golf-0519",
}

# 카카오골프예약 '골프장에서 알립니다'로 보완한 곳 (kakao course id)
KAKAO = {
    "kr-golf-0071": "700", "kr-golf-0088": "18", "kr-golf-0112": "52",
    "kr-golf-0130": "4", "kr-golf-0185": "665", "kr-golf-0300": "233",
    "kr-golf-0309": "276", "kr-golf-0325": "265", "kr-golf-0327": "266",
    "kr-golf-0329": "482", "kr-golf-0331": "278", "kr-golf-0339": "472",
    "kr-golf-0340": "483", "kr-golf-0341": "258", "kr-golf-0499": "451",
}


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    F = json.load(open(FINDINGS, encoding="utf-8"))
    K = json.load(open(KAKAO_CORE, encoding="utf-8"))
    seen = set()
    for c in data["courses"]:
        cid = c["course_id"]
        if cid not in F:
            continue
        seen.add(cid)
        u = F[cid]
        br = c.setdefault("briefing", {})
        nt = br.setdefault("notices", {})
        col = c.setdefault("collection", {})

        if u.get("board"):
            nt["url"] = u["board"]
        if u.get("items"):
            nt["items"] = [{"title": t, "date": d, "url": u.get("board") or u.get("hp")}
                           for t, d in u["items"]]
            nt.setdefault("tags", {})
        if u.get("rnt"):
            br["recent_notice_text"] = u["rnt"]
        if u.get("reason"):
            col["official_reason"] = u["reason"]
        if u.get("hp"):
            c["master"]["homepage"] = u["hp"]

        srcs = br.get("sources")
        if not isinstance(srcs, list):
            srcs = []
        srcs = [s for s in srcs if not (isinstance(s, dict) and str(s.get("source", "")).startswith(("공식 공지사항(브라우저 확인)", "카카오골프예약")))]

        if cid in OFFICIAL_OK and u.get("items"):
            col["official_site"] = "ok"
            col["pages_collected"] = max(2, int(col.get("pages_collected") or 0))
            col["render_hint"] = "browser"
            col["plan_strategy"] = "browser_check(2026-11-27)"
            srcs.append({"source": "공식 공지사항(브라우저 확인)", "url": nt.get("url") or u.get("hp"), "checked_at": CHECKED_D})
        elif cid in KAKAO:
            kid = KAKAO[cid]
            url = f"https://www.kakao.golf/golf/{kid}"
            core = (K.get(kid) or {}).get("core", "").strip()
            if core and not u.get("items"):
                br["recent_notice_text"] = (u.get("rnt") + " " if u.get("rnt") else "") + \
                    f"카카오골프예약 '골프장에서 알립니다'(2026-11-27): " + core[:400]
            srcs.append({"source": "카카오골프예약 골프장에서 알립니다", "url": url, "checked_at": CHECKED_D})
            col["plan_strategy"] = "browser_check+kakao(2026-11-27)"
        br["sources"] = srcs
        br["collected_at"] = CHECKED

    missing = set(F) - seen
    if missing:
        print("MISSING:", sorted(missing))
        sys.exit(1)
    json.dump(data, open(SRC, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("updated", len(seen))


if __name__ == "__main__":
    main()
