#!/usr/bin/env python3
"""2026-11-28 상세 화면 가독성 패스 반영 (v2.9.15).

입력
  - data/source/golf_courses_all_v29.json            (현행 데이터, v2.9.14)
  - 외부 수신 패치 0-all_540_readability_patch.json   (349곳 / 540필드)

처리
  1) 수신 패치 병합 — 경로가 실제로 있는 항목만 반영하고, 문자열 항목은
     숫자·시각·기간 토큰이 사라지지 않았는지 대조한다(0-padding 정리·'만원'→'원' 표기 확장 같은
     표기 차이는 허용, 값 자체가 달라지는 경우는 중단).
  2) '코스 구성'(course.blocks / master.course_spec.blocks)에 구분자 없이 붙어 있던 코스명을
     코스별로 분리한다. 근거는 같은 파일의 KGA nine_hole_courses·course_names 와 공개 자료.
  3) 일반 화면에 노출되는 필드에서 내부 정정 메모(v2.8 정정/정리)와 수집 출처·확인일 메타를 걷어낸다.
     (수집 근거 자체는 fee.sources·fee.value_check·cancel.evidence 등 관리자 필드에 그대로 남는다)
  4) 데이터셋 버전 2.9.15 로 올리고 built_at 갱신.

사용
  python3 scripts/apply_readability_pass_2026_11_28.py --patch <수신 패치 JSON> --check   # 검사만
  python3 scripts/apply_readability_pass_2026_11_28.py --patch <수신 패치 JSON>          # 반영
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import sys

SRC = "data/source/golf_courses_all_v29.json"
VERSION = "2.9.15"
BUILT_AT = "2026-11-28T14:10:00+09:00"
NOTE_KEY = "readability_pass_2026_11_28"
NOTE_TEXT = "요금·취소·운영 문구 불릿 정리(외부 검수 반영) — 숫자·금액·시각·위약 조건 대조"

# ---------------------------------------------------------------- 2. 코스 구성 분리
# blocks 에 구분자 없이 붙어 있던 값 → 코스별 이름. 괄호는 근거.
BLOCK_SPLITS: dict[str, list[str]] = {
    # course_names "EAST·WEST·SOUTH 각 9홀", 등록 27홀
    "kr-golf-0001": ["EAST", "WEST", "SOUTH"],
    # 공식 홈페이지 45홀(회원제 18 + 대중제 27), 서울신문 5개 코스: 휴먼·해피·하트·힐링·히든
    "kr-golf-0012": ["휴먼", "해피", "하트", "힐링", "히든"],
    # KGA nine_hole_courses = 힐·레이크·마운틴 (LAKEMOUNTAINHILL)
    "kr-golf-0035": ["레이크", "마운틴", "힐"],
    # KGA nine_hole_courses = 섬머·오텀·스프링 (AUTUMNSPRING 은 2개만 표기된 값)
    "kr-golf-0046": ["섬머", "오텀", "스프링"],
    # KGA 메이플·파인·버치 (MAPLEPINEBIRCH)
    "kr-golf-0087": ["메이플", "파인", "버치"],
    # course_names "G·휴·힐", KGA G·휴·힐 (GNEWHILL)
    "kr-golf-0090": ["G", "휴", "힐"],
    # course_names "히든·이글·몬트 각 9홀" (이글몬트히든)
    "kr-golf-0134": ["히든", "이글", "몬트"],
    # course_names "스텔라·루나·솔라 각 9홀" (SOLARLUNARSTELLA)
    "kr-golf-0141": ["스텔라", "루나", "솔라"],
    # 공식·공개 자료: 용인CC 의 In 코스인 단일 9홀 '석천' 코스 (원문 값 TIGERLION 은 타 구장 혼입)
    "kr-golf-0174": ["석천"],
    # 공식·티픽·랭큐: 54홀 6개 코스 — 몬티·벨라·비스타·라고·보나·호박
    "kr-golf-0194": ["비스타", "라고", "보나", "호박", "몬티", "벨라"],
    # course_names "남·동·서 각 9홀", KGA 남·동·서 (EASTWESTSOUTH)
    "kr-golf-0204": ["남", "동", "서"],
    # course_names "EAST·WEST·SOUTH 각 9홀"
    "kr-golf-0221": ["EAST", "WEST", "SOUTH"],
    # KGA 샤인·포도 + 자두 = 27홀 3개 코스 (샤인포도자두)
    "kr-golf-0321": ["샤인", "포도", "자두"],
    # 공식 안내문 "Ocean 코스 · Valley 코스 · Beach 코스" (OCEANVALLEYBEACH)
    "kr-golf-0328": ["오션", "밸리", "비치"],
    # course_names "오션·힐·파인 각 9홀" (HILLPINEOCEAN)
    "kr-golf-0346": ["오션", "힐", "파인"],
}

# ---------------------------------------------------------------- 3-a. 내부 정정 메모
# 화면에 그대로 나가던 v2.8 정정/정리 문장을, 고객이 읽을 문장으로 바꾼다.
MEMO_REWRITES: dict[str, dict[str, str]] = {
    "kr-golf-0333": {
        "fee.cart.note": "팀 카트비 100,000원(셀프카트 120,000원+세팅비 20,000원). 공식 요금표의 '기본(최저) 요금 50,000원'은 1인 기준입니다.",
        "fee.caddie.note": "팀 캐디피 150,000원. 공식 요금표의 '기본(최저) 30,000원(락카 이용료 포함)'은 1인 기준입니다.",
    },
    "kr-golf-0378": {
        "fee.basis": None,   # 아래 MEMO_STRIP 으로 'v2.8 정리:' 절만 잘라낸다
    },
    "kr-golf-0358": {
        "fee.basis": "1인·18홀 비회원 기준(공식 이용요금표, 2026-04-01 적용). 카트·캐디·대여료는 별도.",
    },
    "kr-golf-0419": {
        "fee.note": "12월 운영안내(2026-11-05) 기준 최고가 250,000원. '최대 27만원'은 극성수기(7·8월) 토·일·공휴일 요금. 전 타임 최소 3인, 5일 전 예약 5팀 미만 시 휴장.",
    },
}

MEMO_STRIP = re.compile(r"\s*v2\.\d+\s*(?:정정|정리)\s*:.*$", re.S)

# 메타를 걷어낸 뒤 문장이 어색해지는 곳 — 공지 문장을 그대로 다듬는다
TEXT_FIXES: dict[tuple[str, str], str] = {
    ("kr-golf-0053", "fee.note"): (
        "• 공식 요금표는 월별 할인 그린피(회원 기준)로만 게시\n"
        "• 정상그린피 210,000/250,000원은 공식 페이지에 게시되어 있지 않음\n"
        "• 실제 결제가는 월별 공지·예약 화면 기준\n"
        "• 2026년 12월 회원 그린피: 주중 130,000~180,000원 · 주말 160,000~200,000원"
    ),
    ("kr-golf-0283", "fee.note"): (
        "• 공식 요금표에 카트비·캐디피가 없어 공개 요금 정보의 대조값으로 채웠다(2026-11)\n"
        "• 그린피는 공식 요금표 기준"
    ),
    ("kr-golf-0358", "fee.note"): (
        "• 문체부 등록은 9홀이지만 공식 요금표는 18홀 단일 코스 기준 단일가\n"
        "• 3인 플레이 시 갤러리 1인 입장 가능(주중 110,000·주말 120,000)"
    ),
    ("kr-golf-0512", "briefing.alert.detail"): (
        "2026-07 코스 공사가 끝났고, 2026-09 클럽하우스 사용승인 절차를 거쳐 "
        "2026-10 '내년 상반기 개장 준비' 보도가 나왔다. 정식 개장·요금 공지는 아직 게시되지 않았다."
    ),
}

# ---------------------------------------------------------------- 3-b. 노출 필드에서 걷어낼 출처·확인일 메타
BRAND_NAMES = [
    (re.compile(r"카카오골프예약|카카오\s*골프예약"), "온라인 예약"),
    (re.compile(r"스마트스코어"), "공개 예약 채널"),
    (re.compile(r"그린피가이드"), "공개 요금 정보"),
    (re.compile(r"티픽골프장|티픽"), "공개 예약 채널"),
]
META_PATTERNS = [
    re.compile(r"\s*\([^()]*?\d{4}-\d{2}-\d{2}[^()]*?(?:확인|기준)[^()]*?\)"),
    re.compile(r"(?<![가-힣\d])\d{4}-\d{2}-\d{2}\s*(?:확인|기준)\s*[:：]?\s*"),
]
# 일반 화면에 나가는 필드(관리자 전용 sources·evidence·value_check 는 건드리지 않는다)
PUBLIC_FIELDS = [
    "fee.weekday_text", "fee.weekend_text", "fee.note", "fee.basis",
    "fee.cart.note", "fee.cart.text", "fee.caddie.note", "fee.caddie.text",
    "cancel.open_cycle", "cancel.notes", "cancel.cancel_policy", "cancel.cancel_policy.value",
    "course.course_names",
]


def get_path(obj, path):
    cur = obj
    for k in path.split("."):
        if isinstance(cur, dict) and k in cur:
            cur = cur[k]
        else:
            return None
    return cur


def set_path(obj, path, value):
    keys = path.split(".")
    cur = obj
    for k in keys[:-1]:
        cur = cur[k]
    cur[keys[-1]] = value


def flatten(obj, prefix=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from flatten(v, f"{prefix}.{k}" if prefix else k)
    else:
        yield prefix, obj


NUM = re.compile(r"\d[\d,]*(?:\.\d+)?%?")


def numeric_tokens(text: str):
    """표기 차이(0-padding, 만원→원)를 흡수한 숫자 토큰 집합."""
    out = collections.Counter()
    for tok in NUM.findall(text):
        t = tok.rstrip("%").replace(",", "")
        if t.isdigit():
            t = str(int(t))
        out[t] += 1
    return out


# 패치에서 일부러 버린 스크래핑 잔여물 — 숫자가 사라지지만 정보가 아니므로 통과시킨 항목
REVIEWED_DROPS: dict[tuple[str, str], str] = {
    # 요금표 표 머리글 조각("...4인 1팀 기준 예상 비용구분그린피(1인)1인 부담...")만 걷어냄
    ("kr-golf-0060", "cancel.cancel_policy.value"): "게시판 스크래핑 잔여물(경기 시간18홀 4시간 3)",
    ("kr-golf-0212", "cancel.cancel_policy.value"): "표 머리글 잔여물(272,500원 문자열 동반 제거)",
    ("kr-golf-0179", "cancel.cancel_policy.value"): "설계·부대시설 잔여물 혼입 문장 제거",
    ("kr-golf-0343", "cancel.cancel_policy.value"): "전국 18홀 통계 잔여물 제거",
    ("kr-golf-0065", "facilities.closed_days.value"): "문장 앞 번호('2') 제거",
    ("kr-golf-0314", "cancel.cancel_policy.value"): "'014인'으로 붙어 있던 표 머리글을 '4인 1팀 기준'으로 분리",
    ("kr-golf-0320", "cancel.cancel_policy.value"): "'014인'으로 붙어 있던 표 머리글을 '4인 1팀 기준'으로 분리",
    ("kr-golf-0494", "ops.three_player.value"): "'1만7천 원' → '17,000원' 표기 확장",
    ("kr-golf-0496", "cancel.cancel_policy"): "'오후 5시' → '17:00' 24시간 표기",
    ("kr-golf-0498", "cancel.cancel_policy"): "'오후 5시' → '17:00' 24시간 표기",
    ("kr-golf-0497", "cancel.cancel_policy"): "문장 앞 번호('1)') 제거",
}


def check_numbers(cid, path, old, new, problems, reviewed):
    """값이 달라진 숫자가 있으면 기록한다(만원/천원 표기는 원 단위로 환산해 비교).

    같은 숫자가 문장 구조 정리로 한 번만 남는 경우(예: '평일 07일 전 … 주말 07일 전 …'
    → '평일·주말 모두 7일 전 …')는 값이 보존된 것이므로 통과시킨다.
    """
    old_t, new_t = numeric_tokens(old), numeric_tokens(new)
    lost = {tok: cnt for tok, cnt in old_t.items() if tok not in new_t}
    for tok in list(lost):
        try:
            num = float(tok)
        except ValueError:
            continue
        # '1만' → '10,000', '3.5만' → '35,000' 처럼 단위를 풀어 쓴 경우
        if str(int(num * 10000)) in new_t or str(int(num * 1000)) in new_t:
            del lost[tok]
    if not lost:
        return
    if (cid, path) in REVIEWED_DROPS:
        reviewed.append((cid, path, sorted(lost), REVIEWED_DROPS[(cid, path)]))
        return
    problems.append((cid, path, lost, old[:160], new[:160]))


DATE = r"\d{4}-\d{2}(?:-\d{2})?"
META_CONFIRM = re.compile(rf"{DATE}\s*(?:재)?(?:확인|대조\s*확인|기준)")
KEEP_EFFECTIVE = re.compile(rf"{DATE}\s*(?:시행|적용)")
COLLECTION_META = re.compile(r"1차\s*확인|최초\s*확인|미확인|수집\s*실패|공식\s*예약안내")


def _clean_paren(inner: str) -> str | None:
    """괄호 안 문구에서 수집·확인 메타만 걷어낸다. 남는 조각이 없으면 None(괄호 삭제).

    숫자 천단위 쉼표('15,000원')를 쪼개지 않도록 ', ' 기준으로만 나눈다.
    """
    meta_like = (
        META_CONFIRM.search(inner)
        or COLLECTION_META.search(inner)
        or any(r.search(inner) for r, _ in BRAND_NAMES)
        or (re.search(DATE, inner) and "확인" in inner)
    )
    if not meta_like:
        return inner
    kept = []
    for part in re.split(r",\s+", inner):
        part = part.strip()
        if not part or COLLECTION_META.search(part):
            continue
        # 확인일과 함께 적힌 출처 라벨("2026-11-01 공식 요금표 확인")은 통째로 메타다
        if re.search(DATE, part) and re.search(r"(?:대조\s*)?확인\s*$", part):
            continue
        part = re.sub(r"\s*확인\s*$", "", part)
        part = META_CONFIRM.sub("", part)
        part = re.sub(r"\s*(?:재)?조회\s*", " ", part)
        for rex, rep in BRAND_NAMES:
            part = rex.sub(rep, part)
        part = re.sub(r"\s*[,;]\s*$", "", part).strip(" -—·,")
        part = re.sub(r"[ \t]{2,}", " ", part).strip()
        if not part or re.fullmatch(DATE, part):
            continue
        kept.append(part)
    return ", ".join(kept)


def clean_meta(text: str) -> str:
    out = text

    def paren(m: re.Match) -> str:
        inner = _clean_paren(m.group(1))
        return "" if inner is None else f"({inner})"

    out = re.sub(r"\(([^()]*)\)", paren, out)
    # 괄호 밖에 남은 확인일 표기: "2026-11-27 확인.", "2026-11-26 확인 시 …"
    out = re.sub(rf"\s*{DATE}\s*(?:재)?확인\s*(?:시|당시)?\s*[.,]?", "", out)
    out = re.sub(rf"\s*{DATE}\s*기준\s*[.,]?", "", out)
    for rex, rep in BRAND_NAMES:
        out = rex.sub(rep, out)
    # 문장부호·불릿 표기 정리
    out = re.sub(r"[,;]\s*\.", ".", out)
    out = re.sub(r"\(\s*\)", "", out)
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"\s+([.,])", r"\1", out)
    out = re.sub(r"\.{2,}", ".", out)
    out = re.sub(r"(?m)^•(?=\S)", "• ", out)
    lines = []
    for line in out.split("\n"):
        stripped = line.strip()
        if stripped in ("", "•", "·", "▪"):
            continue
        if re.fullmatch(r"\([^()]{1,24}\)", stripped) and COLLECTION_META.search(stripped):
            continue  # 출처 라벨만 남은 줄
        lines.append(line.rstrip())
    return "\n".join(lines).strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--patch", required=True, help="수신 패치 JSON 경로")
    ap.add_argument("--src", default=SRC)
    ap.add_argument("--check", action="store_true", help="파일 수정 없이 검사 결과만 출력")
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

    stats = collections.Counter()
    problems: list[tuple] = []
    reviewed: list[tuple] = []
    touched: set[str] = set()

    # 1) 패치 병합 -----------------------------------------------------------
    for cid, tree in patch.items():
        course = by_id[cid]
        for path, new in flatten(tree):
            cur = get_path(course, path)
            if cur is None:
                problems.append((cid, path, "missing", "(없음)", repr(new)[:80]))
                continue
            if isinstance(cur, str) and isinstance(new, str):
                check_numbers(cid, path, cur, new, problems, reviewed)
                set_path(course, path, new)
                stats["patched"] += 1
                touched.add(cid)
            elif isinstance(cur, dict) and isinstance(new, str):
                # cancel.cancel_policy 가 dict 인 구장은 .value 만 문자열이다(구조 유지)
                problems.append((cid, path, "type", type(cur).__name__, "str"))
            elif isinstance(cur, (int, float)) and isinstance(new, (int, float)):
                set_path(course, path, new)
                stats["patched"] += 1
                touched.add(cid)
            else:
                problems.append((cid, path, "type", type(cur).__name__, type(new).__name__))

    if stats["patched"] != 540:
        problems.append(("<all>", "-", "count", "540", str(stats["patched"])))

    # 2) 코스 구성 분리 ------------------------------------------------------
    for cid, blocks in BLOCK_SPLITS.items():
        course = by_id[cid]
        spec = course.get("course") or {}
        master_spec = (course.get("master") or {}).get("course_spec") or {}
        old = spec.get("blocks")
        if old == blocks:
            continue
        spec["blocks"] = blocks
        if "blocks" in master_spec:
            master_spec["blocks"] = blocks
        stats["blocks"] += 1
        touched.add(cid)

    # 3-a) 내부 정정 메모 ----------------------------------------------------
    for cid, rewrites in MEMO_REWRITES.items():
        course = by_id[cid]
        for path, text in rewrites.items():
            cur = get_path(course, path)
            if not isinstance(cur, str):
                problems.append((cid, path, "missing", "(없음)", "memo rewrite"))
                continue
            new = text if text is not None else MEMO_STRIP.sub("", cur).strip()
            if new == cur:
                continue
            set_path(course, path, new)
            stats["memo"] += 1
            touched.add(cid)

    # 3-b) 출처·확인일 메타 --------------------------------------------------
    for cid in list(by_id):
        course = by_id[cid]
        paths = list(PUBLIC_FIELDS)
        for sec in ("ops", "facilities"):
            for key, val in (course.get(sec) or {}).items():
                if isinstance(val, dict):
                    for leaf in ("value", "text"):
                        if isinstance(val.get(leaf), str):
                            paths.append(f"{sec}.{key}.{leaf}")
        for path in paths:
            cur = get_path(course, path)
            if not isinstance(cur, str) or not cur:
                continue
            new = clean_meta(cur)
            if new and new != cur:
                set_path(course, path, new)
                stats["meta"] += 1
                touched.add(cid)
        cancel = course.get("cancel") or {}
        if isinstance(cancel.get("cancel_policy"), dict):
            for path in ("cancel.cancel_policy.value",):
                cur = get_path(course, path)
                if isinstance(cur, str) and cur:
                    new = clean_meta(cur)
                    if new and new != cur:
                        set_path(course, path, new)
                        stats["meta"] += 1
                        touched.add(cid)

    # 3-c) 문장 다듬기 -------------------------------------------------------
    for (cid, path), text in TEXT_FIXES.items():
        course = by_id.get(cid)
        if not course:
            continue
        cur = get_path(course, path)
        if isinstance(cur, str) and cur != text:
            set_path(course, path, text)
            stats["fix"] += 1
            touched.add(cid)

    # 남은 메모·메타 재확인 --------------------------------------------------
    leftover = []
    LEAK_MEMO = re.compile(r"v2\.\d\s*(?:정정|정리)")
    for cid, course in by_id.items():
        for path in PUBLIC_FIELDS:
            cur = get_path(course, path)
            if isinstance(cur, str) and (LEAK_MEMO.search(cur) or META_PATTERNS[1].search(cur)):
                leftover.append((cid, path, cur[:120]))

    print(f"패치 병합 {stats['patched']}필드 / 코스 구성 분리 {stats['blocks']}곳 / "
          f"내부 메모 정리 {stats['memo']}건 / 출처·확인일 메타 {stats['meta']}건 / "
          f"문장 다듬기 {stats['fix']}건 / "
          f"손댄 구장 {len(touched)}곳")
    if reviewed:
        print(f"\n검수 후 통과시킨 숫자 제거 {len(reviewed)}건(스크래핑 잔여물)")
        for cid, path, lost, why in reviewed:
            print(f"  {cid} {path} {lost} — {why}")
    if leftover:
        print(f"\n남은 메모·메타 {len(leftover)}건")
        for row in leftover[:20]:
            print("  ", row[0], row[1], row[2])
    if problems:
        print(f"\n검수 필요 {len(problems)}건")
        for cid, path, why, old, new in problems[:40]:
            print(f"  {cid} {path} [{why}]\n    OLD {old}\n    NEW {new}")

    if args.check:
        return 1 if problems else 0
    if problems:
        print("\n검수 필요 항목이 있어 반영하지 않았습니다.", file=sys.stderr)
        return 2

    # 4) 버전 갱신 -----------------------------------------------------------
    meta = ds["dataset"]
    meta["version"] = VERSION
    meta["built_at"] = BUILT_AT
    meta["master_version"] = (
        f"{VERSION} (2026-11-28 상세 화면 가독성 패스 — 요금·취소·운영 문구 불릿 정리 349곳, "
        "코스 구성 구분자 정리 15곳, 내부 메모·수집 메타 제거)"
    )
    for cid in touched:
        course_meta = by_id[cid].setdefault("meta", {})
        course_meta[NOTE_KEY] = NOTE_TEXT

    with open(args.src, "w", encoding="utf-8") as f:
        json.dump(ds, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"저장 → {args.src}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
