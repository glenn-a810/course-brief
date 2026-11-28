#!/usr/bin/env python3
"""CourseBrief 정적 데이터 분할 빌더.

입력: 통합 데이터셋 JSON (기본값 data/golf/golf_courses_all_v29.json)
출력: repo 루트 기준
  data/v29/index.json            경량 인덱스(목록·검색·필터용, 전체 540행)
  data/v29/courses/{id}.json     구장별 상세 12키 JSON 540개
  data/v29/clusters.json         시설 클러스터(같은 부지 복수 코스) 28개
  data/v29/sido.json             시도 코드·건수

공개 배포용이므로 개인·내부 정보(내부 경로, 협업자 실명)는 이 단계에서 제거한다.
`--check` 로 생성 결과를 검증한다.
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import coverage_metric  # noqa: E402  (같은 디렉터리의 지표 정의)

KST = timezone(timedelta(hours=9))

# 공개 저장소에 남기면 안 되는 문자열 치환 (내부 워크스페이스 경로·협업자 이름)
SANITIZE_PATTERNS = [
    (re.compile(r"memory/clones/[0-9a-f]{8}-[a-z0-9]+/pickle/[0-9-]+/received/"), ""),
    # 협업자 실명이 들어간 출처 표기 → 중립 표기 (이름을 코드에 남기지 않도록 일반 패턴으로 처리)
    (re.compile(r"[가-힣]{2,4}\s*님\s*비서\s*조사"), "외부 데이터 검수"),
    (re.compile(r"[가-힣]{2,4}\s*님\s*비서\s*수신"), "외부 데이터 수신"),
    (re.compile(r"[가-힣]{2,4}\s*님\s*비서"), "외부 데이터 검수"),
    (re.compile(r"/workspace/"), ""),
]

STATUS_LABEL = {
    "operating": "영업중",
    "suspended": "영업중단",
    "closed": "폐업",
    "under_construction": "건설중",
    "planned": "미착공",
    "cancelled": "사업 취소",
}


def sanitize(obj):
    """문자열을 재귀적으로 순회하며 내부 경로·실명을 제거한다."""
    if isinstance(obj, str):
        out = obj
        for pat, rep in SANITIZE_PATTERNS:
            out = pat.sub(rep, out)
        return out
    if isinstance(obj, list):
        return [sanitize(v) for v in obj]
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    return obj


def fee_summary(course: dict) -> dict:
    """목록 화면용 그린피 요약. 공식 요금표가 있으면 공식, 없으면 실거래 관측 최저가."""
    fee = course.get("fee") or {}
    market = fee.get("market") or {}
    wd, we = fee.get("weekday"), fee.get("weekend")
    as_of = fee.get("as_of") or fee.get("checked_at")
    if isinstance(wd, (int, float)) or isinstance(we, (int, float)):
        basis = "official"
    else:
        wd = market.get("weekday_min")
        we = market.get("weekend_min")
        basis = "market" if (wd or we) else None
        as_of = None
    if not (wd or we):
        return None
    return {
        "weekday": int(wd) if isinstance(wd, (int, float)) else None,
        "weekend": int(we) if isinstance(we, (int, float)) else None,
        "basis": basis,
        "as_of": as_of,
    }


# 클럽·장비 상품명이 공지 목록에 섞여 들어온 경우(렌탈 상품 페이지를 공지로 수집) — 실제 운영 공지와 분리한다
PRODUCT_NOTICE = re.compile(
    r"(?i)(xxio|젝시오|mizuno|미즈노|honma|혼마|titleist|타이틀리스트|ping\b|\b핑\b|pxg|callaway|캘러웨어|캘러웨이|"
    r"taylormade|테일러메이드|cleveland|클리블랜드|odyssey|오디세이|scotty|스카티|cobra|코브라|bridgestone|"
    r"브릿지스톤|srixon|스릭슨|vokey|보키|드라이버|아이언|웨지|퍼터|풀세트|클럽세트|\biron\b|\bwedge\b|\bdriver\b|\bputter\b)"
)
# 수집 잡음(게시판 머리글만 긁힌 항목)
JUNK_NOTICE = re.compile(r"^(관리자|작성자|등록일|제목\b)")


def notice_date(item: dict) -> str | None:
    d = item.get("date")
    if isinstance(d, str) and len(d) >= 7:
        return d[:10]
    return None


def is_real_notice(item: dict) -> bool:
    """제목이 상품명·게시판 머리글인 항목은 운영 공지로 세지 않는다."""
    title = (item.get("title") or "").strip()
    if len(title) < 4 or JUNK_NOTICE.search(title):
        return False
    return not PRODUCT_NOTICE.search(title)


def _num(v) -> float | None:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def kga_slope(course: dict) -> dict | None:
    """L3 — KGA 코스레이팅에서 '구장 대표 슬로프'를 하나 뽑는다.

    슬로프 레이팅은 18홀 조합 × 티 × 성별 단위라 그대로는 정렬할 수 없다. 대표값 규칙:
      1) 남자 `Regular` 티의 슬로프를 18홀 조합별로 모아 **평균**한다(가장 흔한 골퍼 기준).
      2) `Regular` 라는 이름의 티가 없으면 남자 티 슬로프의 **중앙값**을 쓴다.
      3) 여자부만 있는 조합·티는 섞지 않는다(레이팅 기준이 다르다).
    값이 없으면 None → 인덱스에 필드를 넣지 않고, 화면은 배지를 그리지 않는다.
    """
    co = course.get("course") or {}
    kga = co.get("kga")
    if not isinstance(kga, dict):
        spec = (course.get("master") or {}).get("course_spec") or {}
        kga = spec.get("kga")
    if not isinstance(kga, dict):
        return None
    regular: list[float] = []
    regular_tee = ""
    male: list[float] = []
    for cb in kga.get("hole_combinations") or []:
        if not isinstance(cb, dict):
            continue
        for tee in cb.get("tees") or []:
            if not isinstance(tee, dict):
                continue
            if "남" not in str(tee.get("gender") or ""):
                continue
            slope = _num(tee.get("slope_rating"))
            if slope is None or not (40 <= slope <= 160):
                continue
            male.append(slope)
            name = str(tee.get("tee") or "")
            if re.search(r"regular|reg\b", name, re.I):
                regular.append(slope)
                if not regular_tee:
                    regular_tee = name
    if regular:
        return {"value": round(sum(regular) / len(regular), 1), "tee": regular_tee or "Regular", "combos": len(regular)}
    if male:
        male_sorted = sorted(male)
        n = len(male_sorted)
        median = male_sorted[n // 2] if n % 2 else (male_sorted[n // 2 - 1] + male_sorted[n // 2]) / 2
        return {"value": round(median, 1), "tee": "median", "combos": n}
    return None


def summary_fields(course: dict) -> dict:
    """목록 카드가 상세를 열지 않고도 판단할 수 있게 하는 요약 필드.

    사실 값을 바꾸지 않고, 상세 JSON 에서 카드·목록에 필요한 값만 뽑아 인덱스에 붙인다.
    인덱스는 목록 첫 화면에서 바로 받는 파일이라 크기를 아껴 짧은 키와 태그 코드를 쓴다.
    """
    m = course.get("master") or {}
    co = course.get("course") or {}
    fee = course.get("fee") or {}
    ops = course.get("ops") or {}
    fac = course.get("facilities") or {}
    br = course.get("briefing") or {}
    out: dict = {}

    par = _num(co.get("par")) or _num(m.get("par"))
    if par:
        out["par"] = int(par)
    length = _num(co.get("length_m"))
    if length:
        out["length"] = int(length)

    cart = _num((fee.get("cart") or {}).get("value"))
    if cart:
        out["cart"] = int(cart)
    caddie = _num((fee.get("caddie") or {}).get("value"))
    if caddie:
        out["caddie"] = int(caddie)

    def value(key: str, holder: dict) -> str | None:
        v = (holder.get(key) or {}).get("value") if isinstance(holder.get(key), dict) else None
        if isinstance(v, bool):
            return "가능" if v else None
        if isinstance(v, str) and v.strip() and v.strip() != "미확인":
            return v.strip()
        return None

    codes: list[str] = []
    nocaddie = value("nocaddie", ops)
    if nocaddie and "불가" not in nocaddie:
        codes.append("n")            # 노캐디
    two = value("two_player", ops)
    if two and "불가" not in two:
        codes.append("2")            # 2인 플레이
    night = co.get("night_light")
    if night is True or (isinstance(night, str) and night.strip()) or value("night", fac):
        codes.append("y")            # 야간 라운드
    if value("locker_sauna", fac) or value("sauna", ops):
        codes.append("s")            # 사우나
    if value("lodging", fac):
        codes.append("l")            # 숙박
    if value("shuttle", fac):
        codes.append("h")            # 셔틀·교통
    if value("practice", fac) or value("indoor_range", fac):
        codes.append("p")            # 연습장
    if value("food", fac):
        codes.append("f")            # 식당
    if codes:
        out["tags"] = "".join(codes)

    review = br.get("review") or {}
    score = _num(review.get("score_10"))
    if score is not None:
        out["rating"] = round(score, 1)
        count = _num(review.get("count"))
        if count:
            out["reviews"] = int(count)

    items = ((br.get("notices") or {}).get("items")) or []
    dates = sorted(d for d in (notice_date(i) for i in items if isinstance(i, dict) and is_real_notice(i)) if d)
    if dates:
        out["notice"] = dates[-1]
    if br.get("alert"):
        out["alert"] = True

    cov = course.get("coverage") or {}
    vals = [v for v in cov.values() if isinstance(v, (int, float)) and not isinstance(v, bool)]
    if vals:
        out["cov"] = int(round(100 * sum(vals) / len(vals)))

    slope = kga_slope(course)
    if slope:
        out["slope"] = slope
    return out


def coverage_averages(courses: list[dict]) -> dict:
    """영역별 평균 충실도 — 데이터 소개 페이지의 인포그래피가 쓴다.

    원본에 저장된 coverage 값을 믿지 않고 현재 필드 값에서 매번 다시 계산한다
    (`scripts/coverage_metric.py`). 병합 스크립트가 coverage 를 갱신하지 않아도
    `npm run data:build` 한 번이면 지표가 데이터와 일치한다.
    """
    return coverage_metric.averages(courses)


def index_record(course: dict) -> dict:
    m = course.get("master") or {}
    region = m.get("region") or {}
    holes = m.get("holes") or {}
    clusters = m.get("facility_cluster") or m.get("facility_id")
    if isinstance(clusters, dict):
        clusters = clusters.get("facility_id")
    aliases = [n for n in (m.get("name_variants") or []) if n and n != m.get("name")]
    aliases += [n for n in (m.get("former_names") or []) if n and n != m.get("name") and n not in aliases]
    rec = {
        "id": course["course_id"],
        "name": m.get("name"),
        "aliases": aliases or None,
        "sido": region.get("sido_short"),
        "sido_code": region.get("sido_code"),
        "sigungu": region.get("sigungu_name"),
        "status": m.get("status"),
        "holes": holes.get("total"),
        "type": m.get("type"),
        "cluster": clusters,
        "green_fee": fee_summary(course),
        "lat": m.get("lat"),
        "lng": m.get("lng"),
        "tel": m.get("tel"),
        "homepage": m.get("homepage"),
        "detail": bool((course.get("meta") or {}).get("has_detail")),
    }
    if m.get("status") != "operating":
        rec["status_label"] = STATUS_LABEL.get(m.get("status"), m.get("status"))
        rec["status_note"] = m.get("status_note") or m.get("expected_open")
    rec.update(summary_fields(course))
    return {k: v for k, v in rec.items() if v is not None}


def rental_providers(courses: list[dict]) -> dict:
    """구장별 nearby_delivery.providers 를 업체 단위로 합치고, 조사 노트의 상세를 붙인다."""
    curated = {  # 조사 노트(data/v29/rental_deliveries.md) 기준 상세
        "theb": {"name": "더비 (The B)", "url": "https://clubrentaltheb.qshop.ai/",
                 "price": "12시간 79,000원 기준 (3일+ -15%, 5일+ -20%, 카드 VAT 별도)",
                 "brands": "PXG·타이틀리스트·핑·테일러메이드·브릿지스톤 V300·미즈노·젝시오·혼마 (남성·여성·좌타 보유)",
                 "delivery": "24시간 무인 픽업/반납(1일 전 예약), 김포·시흥 매장 픽업 또는 유료 퀵, 제주 2세트 이상 무료배송",
                 "languages": "한국어 웹·상담(국내외 카드 결제 링크)"},
        "gangnamclub": {"name": "강남골프클럽렌탈", "url": "https://m.blog.naver.com/mosard80/222497927100",
                        "price": "1박2일 50,000원 / 2박3일 80,000원 (+1일 10,000원), 배송비 별도",
                        "brands": "타이틀리스트·테일러메이드·핑·캘러웨이·젝시오·미즈노·스카티카메론 (좌타·여성·VIP, 골프화·장갑·모자 무료)",
                        "delivery": "서울 서초 거점, 전 지역 상담 배송 · 유선 예약 위주",
                        "languages": "한국어"},
        "apioz": {"name": "아피오즈 (Apioz)", "url": "https://www.apioz.co.kr/en/korea-rental-delivery/premium-golf-club-rental-set",
                  "price": "일 120,000원 (최소 360,000원)",
                  "brands": "PING G440 + 브릿지스톤 V300 IX + 버크 TM50 (12클럽)",
                  "delivery": "서울 호텔·에어비앤비 배송 및 공항 수령",
                  "languages": "영어·중국어 번체·한국어"},
        "rentzone": {"name": "렌트존 (RENT ZONE)", "url": "https://golfrentzone.com/",
                     "price": "1일 48,000원(프리미엄 58,000원) / 2일 88,000원 / 3일 120,000원 / 4일 150,000원, 배송비 10,000원(10만원 이상 무료)",
                     "brands": "PING G440 MAX·캘러웨이 Quantum·테일러메이드 Qi4D·PXG·XXIO 14·혼마 BERES 10 (남성·여성·시니어)",
                     "delivery": "제주 전 지역 골프장 직접 배송·수거",
                     "languages": "한국어"},
        "cygolf": {"name": "싸이골프 (Cygolf)", "url": "http://cygolf.net/",
                   "price": "1일 50,000원(정상가)",
                   "brands": None,
                   "delivery": "제주 전 지역 골프장 배송·수거 (웹 타임아웃, 유선 확인)",
                   "languages": "한국어"},
        "skygolf": {"name": "스카이골프 (제주스카이골프)", "url": "http://www.jejuskygolf.com/",
                    "price": "1일 50,000~60,000원 (타이틀리스트 70,000원)",
                    "brands": None,
                    "delivery": "제주 전 지역, 티오프 30분 전 배송·수거",
                    "languages": "한국어"},
        "easyjeju": {"name": "이지제주", "url": "https://www.easyjeju.com/golfrental",
                     "price": "1일 40,000~50,000원대 (배송 무료)",
                     "brands": "여성·좌타 보유(핑 G425 MAX)",
                     "delivery": "제주 직접 배송(일부 상품 전화 확인 필요)",
                     "languages": "한국어"},
        "jejugolfrental": {"name": "제주골프렌탈", "url": "https://band.us/band/83664503",
                           "price": None, "brands": "혼마·마제스티 등",
                           "delivery": "제주공항 인근 매장 직접 픽업/반납", "languages": "한국어"},
    }
    agg: dict[str, dict] = {}
    for c in courses:
        nd = ((c.get("rental") or {}).get("nearby_delivery") or {})
        region = nd.get("region")
        for p in nd.get("providers") or []:
            pid = p.get("id")
            if not pid:
                continue
            e = agg.setdefault(pid, {"id": pid, "names": set(), "phones": set(), "regions": set(),
                                     "coverage": {}, "prices": set(), "statuses": set(), "courses": 0})
            if p.get("name"):
                e["names"].add(p["name"])
            if p.get("phone"):
                e["phones"].add(p["phone"])
            if region:
                e["regions"].add(region)
                prev = e["coverage"].get(region)
                cov = p.get("coverage")
                if prev != "O":
                    e["coverage"][region] = cov
            if p.get("price_headline"):
                e["prices"].add(p["price_headline"])
            if p.get("operating_status"):
                e["statuses"].add(p["operating_status"])
            e["courses"] += 1

    out = []
    for pid, e in sorted(agg.items(), key=lambda kv: -kv[1]["courses"]):
        cur = curated.get(pid, {})
        status = " / ".join(sorted(e["statuses"])) or None
        if pid == "apioz":
            status = "2026-11 기준 예약 중단(Sold Out)"
        out.append({
            "id": pid,
            "name": cur.get("name") or sorted(e["names"])[0],
            "phone": sorted(e["phones"])[0] if e["phones"] else None,
            "url": cur.get("url"),
            "regions": [r for r in ["수도권", "강원", "충청", "호남", "영남", "제주"] if r in e["regions"]],
            "coverage": e["coverage"],
            "price": cur.get("price") or (sorted(e["prices"])[0] if e["prices"] else None),
            "brands": cur.get("brands"),
            "delivery": cur.get("delivery"),
            "languages": cur.get("languages"),
            "status": status,
            "course_count": e["courses"],
        })
    return {
        "dataset": {"name": "해외 골퍼용 골프채 렌탈·딜리버리 업체", "version": "v29",
                    "verified_at": "2026-11-26", "count": len(out),
                    "source": "data/v29/rental_deliveries.md (공개 웹 리서치)"},
        "summary": "공항 터미널 내 상주 렌탈 데스크는 사실상 없고, ① 수도권·부산 거점 24시간 무인픽업+퀵 배송형 ② 제주 전 지역 골프장 직배송형 ③ 골프장 자체 현장 대여(풀세트 중앙값 50,000원)로 나뉩니다. 한진택배·아이콘골프·하이캐디·짐캐리 등은 골프백 운송·보관 서비스이며 클럽 렌탈은 제공하지 않습니다.",
        "providers": out,
    }


def build(src: str, out_root: str) -> dict:
    with open(src, encoding="utf-8") as f:
        data = json.load(f)

    raw_courses = data["courses"]
    courses = [sanitize(c) for c in raw_courses]

    # 0) 충실도 지표를 현재 필드 값에서 재계산한다(원본의 coverage 블록이 낡았을 수 있다).
    for c in courses:
        c["coverage"] = coverage_metric.coverage_for(c)

    v29 = os.path.join(out_root, "data", "v29")
    course_dir = os.path.join(v29, "courses")
    os.makedirs(course_dir, exist_ok=True)

    # 1) 구장별 상세 JSON (540개)
    written = 0
    for c in courses:
        path = os.path.join(course_dir, f"{c['course_id']}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(c, f, ensure_ascii=False, indent=1)
            f.write("\n")
        written += 1

    # 2) 인덱스
    status_counts = collections.Counter(c["master"].get("status") for c in courses)
    sido_counter = collections.Counter()
    sido_meta = {}
    sido_labels = collections.defaultdict(collections.Counter)
    for c in courses:
        r = c["master"].get("region") or {}
        code = r.get("sido_code")
        sido_counter[code] += 1
        sido_meta[code] = {"code": code, "name": r.get("sido_name")}
        if r.get("sido_short"):
            sido_labels[code][r["sido_short"]] += 1

    sido_list = []
    sido_shorts = {
        code: "·".join(label for label, _ in sorted(labels.items(), key=lambda kv: -kv[1]))
        for code, labels in sido_labels.items()
    }
    for code, meta in sorted(sido_meta.items(), key=lambda kv: (-sido_counter[kv[0]], sido_shorts.get(kv[0], ""))):
        # 통합특별시(전남·광주)처럼 한 코드에 약칭이 둘 이상이면 둘 다 표기한다.
        # 하나만 남기면 다른 지역 44곳이 그 라벨 아래 보이지 않는다.
        sido_list.append({**meta, "short": sido_shorts.get(code, ""), "count": sido_counter[code]})

    clusters = []
    for cl in data.get("facility_clusters", []):
        clusters.append({
            "id": cl["facility_id"],
            "name": cl.get("facility_name"),
            "members": cl.get("members", []),
            "basis": cl.get("basis"),
            "relationship": cl.get("relationship"),
        })

    built_at = datetime.now(KST).replace(microsecond=0).isoformat()
    index = {
        "dataset": {
            "name": "CourseBrief 정적 데이터 인덱스",
            "version": "v29",
            "schema": "coursebrief/v29-index-1",
            "built_at": built_at,
            "source_dataset": (data.get("dataset") or {}).get("name"),
            "source_version": (data.get("dataset") or {}).get("version"),
            "coverage": coverage_averages(courses),
            "counts": {
                "total": len(courses),
                "with_detail": sum(1 for c in courses if (c.get("meta") or {}).get("has_detail")),
                "master_only": sum(1 for c in courses if not (c.get("meta") or {}).get("has_detail")),
                **{k: v for k, v in status_counts.items()},
            },
            "fields": {
                "id": "구장 ID (kr-golf-NNNN)",
                "name": "대표 명칭",
                "aliases": "이명·구 명칭(검색 보조)",
                "sido / sido_code / sigungu": "시도(약칭)·행정표준코드·시군구",
                "status": "operating | suspended | closed | under_construction | planned | cancelled",
                "holes": "총 홀수",
                "type": "회원제 | 대중제 | 비회원제",
                "cluster": "시설 클러스터 ID(F001~, 같은 부지 복수 코스). clusters.json 참조",
                "green_fee": "그린피 요약(1인 18홀 비회원 기준). basis=official이면 공식 요금표, market이면 실거래 관측 최저가",
                "lat / lng": "WGS84",
                "tel": "대표 전화",
                "homepage": "공식 홈페이지",
                "detail": "true면 data/v29/courses/{id}.json 에 상세 12키 데이터 존재",
                "status_label / status_note": "비영업 구장에만 존재(영업중단·폐업·건설중·미착공 사유)",
                "par / length": "파 · 전장(m, 18홀 기준 정규화)",
                "cart / caddie": "카트·캐디피(원, 팀 기준) — 상세 요금 값이 있을 때만",
                "tags": "카드 배지 코드. n=노캐디 2=2인 y=야간 s=사우나 l=숙박 h=셔틀 p=연습장 f=식당",
                "rating / reviews": "라운더 평가(10점) · 집계 건수",
                "notice": "최근 운영 공지 날짜(YYYY-MM-DD). 상품·게시판 머리글 항목은 제외",
                "alert": "true면 확인이 필요한 운영 알림(휴장·공사 등) 존재",
                "cov": "7개 영역 평균 정보 충실도(0~100)",
                "slope": "KGA 대표 슬로프 레이팅 {value, tee, combos} — 남자 Regular 티 18홀 조합 평균(L3)",
            },
        },
        "sido": sido_list,
        "clusters": clusters,
        "courses": [index_record(c) for c in courses],
    }

    index_path = os.path.join(v29, "index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

    with open(os.path.join(v29, "clusters.json"), "w", encoding="utf-8") as f:
        json.dump({"dataset": {"version": "v29", "count": len(clusters)}, "clusters": clusters},
                  f, ensure_ascii=False, indent=1)
        f.write("\n")

    with open(os.path.join(v29, "sido.json"), "w", encoding="utf-8") as f:
        json.dump({"dataset": {"version": "v29", "count": len(sido_list)}, "sido": sido_list},
                  f, ensure_ascii=False, indent=1)
        f.write("\n")

    rental = rental_providers(courses)
    with open(os.path.join(v29, "rental_providers.json"), "w", encoding="utf-8") as f:
        json.dump(rental, f, ensure_ascii=False, indent=1)
        f.write("\n")

    return {"courses": written, "index_bytes": os.path.getsize(index_path),
            "status": dict(status_counts), "sido": dict(sido_counter),
            "clusters": len(clusters), "rental_providers": len(rental["providers"])}


def check(out_root: str) -> int:
    """생성 결과 자체 검증."""
    v29 = os.path.join(out_root, "data", "v29")
    idx = json.load(open(os.path.join(v29, "index.json"), encoding="utf-8"))
    courses = idx["courses"]
    errors = []

    ids = [c["id"] for c in courses]
    if len(ids) != len(set(ids)):
        errors.append("index: 중복 id")
    detail = [c["id"] for c in courses if c.get("detail")]
    for cid in detail:
        p = os.path.join(v29, "courses", f"{cid}.json")
        if not os.path.exists(p):
            errors.append(f"courses/{cid}.json 없음")
            continue
        obj = json.load(open(p, encoding="utf-8"))
        if obj["course_id"] != cid:
            errors.append(f"{cid}: course_id 불일치")
        missing = [k for k in ("course_id", "meta", "master", "course", "fee", "cancel",
                               "ops", "facilities", "rental", "briefing", "collection", "coverage")
                   if k not in obj]
        if missing:
            errors.append(f"{cid}: 12키 누락 {missing}")
    files = [f for f in os.listdir(os.path.join(v29, "courses")) if f.endswith(".json")]
    if len(files) != len(courses):
        errors.append(f"courses 파일 수 {len(files)} != index {len(courses)}")
    if idx["dataset"]["counts"]["total"] != len(courses):
        errors.append("counts.total 불일치")

    # 개인정보·내부경로 잔존 검사
    bad = re.compile(r"[가-힣]{2,4}\s*님\s*비서|memory/clones|/workspace/|99239e1f")
    for root, _dirs, fs in os.walk(v29):
        for fn in fs:
            p = os.path.join(root, fn)
            try:
                txt = open(p, encoding="utf-8").read()
            except UnicodeDecodeError:
                continue
            m = bad.search(txt)
            if m:
                errors.append(f"{p}: 금지 문자열 '{m.group(0)}'")

    # coverage 지표가 현재 필드 값과 일치하는지(낡은 값이 남지 않았는지) 확인
    for cid in detail:
        p = os.path.join(v29, "courses", f"{cid}.json")
        if not os.path.exists(p):
            continue
        obj = json.load(open(p, encoding="utf-8"))
        stored = obj.get("coverage") or {}
        fresh = coverage_metric.coverage_for(obj)
        stale = [a for a in coverage_metric.AREAS if stored.get(a) != fresh[a]]
        if stale:
            errors.append(f"{cid}: coverage 불일치 {stale} (저장 {stored.get(stale[0])} ≠ 재계산 {fresh[stale[0]]})")
    all_courses = [json.load(open(os.path.join(v29, "courses", f), encoding="utf-8")) for f in sorted(files)]
    expected = coverage_metric.averages(all_courses)
    got = idx["dataset"].get("coverage") or {}
    if got != expected:
        errors.append(f"index.dataset.coverage 불일치: {got} ≠ {expected}")
    print("coverage 평균 " + " · ".join(f"{a} {got.get(a, 0) * 100:.1f}%" for a in coverage_metric.AREAS))

    size_kb = os.path.getsize(os.path.join(v29, "index.json")) / 1024
    print(f"index.json {size_kb:.1f} KB / courses {len(files)}개 / total {len(courses)}")
    if size_kb > 300:
        errors.append(f"index.json 이 300KB 초과({size_kb:.1f}KB)")
    if errors:
        print("검증 실패:")
        for e in errors[:30]:
            print(" -", e)
        return 1
    print("검증 통과")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.join("data", "golf", "golf_courses_all_v29.json"))
    ap.add_argument("--out", default=".")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.check:
        return check(args.out)
    stats = build(args.src, args.out)
    print(json.dumps(stats, ensure_ascii=False, indent=1))
    return check(args.out)


if __name__ == "__main__":
    sys.exit(main())
