#!/usr/bin/env python3
"""한국어 문장 어미를 해요체로 바꾸는 변환기 (CourseBrief 데이터·문구 공용).

원칙
- **어미만** 바꾼다. 숫자·날짜·금액·고유명사·목록 구조는 건드리지 않는다.
- 이미 해요체인 문장(`…해요` `…예요` `…있어요`)은 손대지 않는다(멱등).
- 확신할 수 없는 형태는 바꾸지 않고 그대로 둔다. 바꾼 내역은 `log` 로 돌려준다.

바꾸는 형태
  합니다 → 해요 / 됩니다 → 돼요 / 입니다 → 이에요·예요 / 있습니다 → 있어요
  없습니다 → 없어요 / 않습니다 → 않아요 / 했습니다 → 했어요 / 칩니다 → 쳐요
  잊습니다 → 잊어요 / 한다 → 해요 / 된다 → 돼요 / 이다 → 이에요·예요
  간다 → 가요 / 먹는다 → 먹어요 (모음 조화·받침 규칙)
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------- 한글 조합

# 중성(모음) 21자 — 유니코드 순서 그대로
V_A, V_AE, V_YA, V_YAE, V_EO, V_E, V_YEO, V_YE, V_O, V_WA, V_WAE, V_OE, V_YO, \
    V_U, V_WO, V_WE, V_WI, V_YU, V_EU, V_UI, V_I = range(21)

_FINALS = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ",
           "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ",
           "ㅌ", "ㅍ", "ㅎ"]
_F_NIEUN = _FINALS.index("ㄴ")
_F_BIEUP = _FINALS.index("ㅂ")

_SBASE = 0xAC00
_SLAST = 0xD7A3


def _split(ch: str) -> tuple[int, int, int] | None:
    code = ord(ch) - _SBASE
    if not (0 <= code <= _SLAST - _SBASE):
        return None
    return code // 588, (code % 588) // 28, code % 28


def _join(lead: int, vowel: int, final: int) -> str:
    return chr(_SBASE + lead * 588 + vowel * 28 + final)


def has_batchim(ch: str) -> bool:
    """받침이 있는 글자인가. 한글이 아니면 '받침 없음'로 본다."""
    parts = _split(ch)
    return bool(parts and parts[2])


def _strip_final(ch: str) -> str:
    parts = _split(ch)
    return ch if not parts else _join(parts[0], parts[1], 0)


# 모음 어간 + 아/어 축약표 (받침 없는 어간)
_CONTRACT = {
    (V_A, "a"): V_A,        # 가 + 아 → 가
    (V_O, "a"): V_WA,       # 오 + 아 → 와
    (V_EO, "e"): V_EO,      # 서 + 어 → 서
    (V_YEO, "e"): V_YEO,    # 켜 + 어 → 켜
    (V_U, "e"): V_WO,       # 주 + 어 → 줘
    (V_I, "e"): V_YEO,      # 마치 + 어 → 마쳐
    (V_EU, "e"): V_EO,      # 쓰 + 어 → 써
    (V_AE, "e"): V_AE,      # 보내 + 어 → 보내
    (V_E, "e"): V_E,
    (V_OE, "e"): V_WAE,     # 되 + 어 → 돼
    (V_YA, "e"): V_YAE,
}


def conjugate(stem: str) -> str:
    """어간 + 아요·어요 (모음 조화·받침·축약). 하다 → 해요."""
    if not stem:
        return "요"
    last = stem[-1]
    parts = _split(last)
    if parts is None:
        return stem + "요"
    lead, vowel, final = parts

    if final == 0 and last == "하":
        return stem[:-1] + "해요"

    if final == _FINALS.index("ㅆ"):
        return stem + "어요"   # 지났 → 지났어요 (과거 ㅆ 뒤에는 언제나 어요)

    use_a = vowel in (V_A, V_O)
    if final == 0:
        key = (vowel, "a" if use_a else "e")
        if key in _CONTRACT:
            return stem[:-1] + _join(lead, _CONTRACT[key], 0) + "요"
        return stem + ("아요" if use_a else "어요")
    return stem + ("아요" if use_a else "어요")


def _tail(stem_last: str) -> str:
    """어간 마지막 글자만 남았을 때 붙는 부분(예: 먹 → 어요, 가 → 요)."""
    c = conjugate(stem_last)
    return c[len(stem_last):]


# ---------------------------------------------------------------- 예외 사전

# 문장 끝 통째 표기 (숫자·기호는 그대로 둔다)
PHRASES: list[tuple[str, str]] = [
    ("하시기 바랍니다", "하시길 바라요"),
    ("하기를 바랍니다", "하기를 바라요"),
    ("바랍니다", "바라요"),
    ("주십시오", "주세요"),
    ("하십시오", "하세요"),
    ("십시오", "하세요"),
    ("아닙니다", "아니에요"),
    ("알려드립니다", "알려드려요"),
    ("축하드립니다", "축하드려요"),
    ("문의드립니다", "문의드려요"),
    ("감사드립니다", "감사드려요"),
    ("드립니다", "드려요"),
]

# 어간이 불규칙하거나 ㄹ 받침이 줄어 규칙만으로 어긋나는 문장 끝 표기
VOCAB: dict[str, str] = {
    "쓴다": "써요",
    "산다": "살아요",
    "판다": "팔아요",
    "만든다": "만들어요",
    "든다": "들어요",
    "부른다": "불러요",
    "모른다": "몰라요",
    "기른다": "길러요",
    "이른다": "일러요",
    "지른다": "질러요",
    "흐른다": "흘러요",
    "푼다": "풀어요",
    "보인다": "보여요",
    "선보인다": "선보여요",
    "들어간다": "들어가요",
    "둔다": "둬요",
    "본다": "봐요",
    "준다": "줘요",
    "쥔다": "쥐어요",
    "앉는다": "앉아요",
    "열린다": "열려요",
    "갈린다": "갈려요",
    "불린다": "불려요",
    "내세운다": "내세워요",
    "갖는다": "가져요",
    "지닌다": "지녀요",
    "이룬다": "이뤄요",
    "따른다": "따라요",
    "다룬다": "다뤄요",
    "머문다": "머물러요",
}

# 정해진 어미 — 긴 형태부터 차례로 바꾼다(순서가 중요하다)
FIXED_ENDINGS: list[tuple[str, str]] = [
    ("이었습니다", "이었어요"),
    ("되었습니다", "됐어요"),
    ("됐습니다", "됐어요"),
    ("였습니다", "였어요"),
    ("았습니다", "았어요"),
    ("었습니다", "었어요"),
    ("했습니다", "했어요"),
    ("없습니다", "없어요"),
    ("있습니다", "있어요"),
    ("않습니다", "않아요"),
    ("못합니다", "못해요"),
    ("안합니다", "안 해요"),
    ("됩니다", "돼요"),
    ("합니다", "해요"),
    ("되었습니다", "됐어요"),
    ("되었다", "됐어요"),
    ("됐다", "됐어요"),
    ("았다", "았어요"),
    ("었다", "었어요"),
    ("했다", "했어요"),
    ("없다", "없어요"),
    ("있다", "있어요"),
    ("않는다", "않아요"),
    ("않다", "않아요"),
    ("아니다", "아니에요"),
    ("한다", "해요"),
    ("하다", "해요"),
    ("된다", "돼요"),
]

# 문장 끝으로 볼 수 있는 경계
_END_CHARS = ".!?。…)]}([{\u300d\u300f\"'\u2019\n"
_BOUNDARY = r"(?=[" + re.escape(_END_CHARS) + r"]|$)"


_QUOTED = re.compile(r"(['\"])([^'\"\n]{1,200}?)\1")


def _convert_plain(text: str, log) -> str:
    out = text

    for a, b in PHRASES:
        out = re.sub(re.escape(a) + _BOUNDARY, b, out)

    for a, b in VOCAB.items():
        out = re.sub(r"(?<![가-힣])" + re.escape(a) + _BOUNDARY, b, out)

    for a, b in FIXED_ENDINGS:
        out = re.sub(re.escape(a) + _BOUNDARY, b, out)

    out = _copula(out, log)
    out = _plain_copula(out, log)
    out = _seumnida(out, log)    # …습니다 (받침 어간) — ㅂ니다 규칙보다 먼저
    out = _bnieup(out, log)      # …칩니다 · …됩니다 꼴 (ㅂ니다)
    out = _plain_nieun(out, log)  # …간다 · …먹는다
    return out


def convert_text(text: str, log: list[tuple[str, str]] | None = None) -> str:
    """문장 어미를 해요체로 바꾼다(숫자·구조·인용문은 그대로)."""
    if not text:
        return text
    # 따옴표 안(골프장이 쓴 문구 인용)은 바꾸지 않는다 — 인용을 고치면 근거가 아니게 된다
    parts: list[str] = []
    last = 0
    for m in _QUOTED.finditer(text):
        parts.append(_convert_plain(text[last:m.start()], log))
        parts.append(m.group(0))
        last = m.end()
    parts.append(_convert_plain(text[last:], log))
    return "".join(parts)


# ---------------------------------------------------------------- 세부 규칙


def _copula(text: str, log) -> str:
    """…입니다 → …이에요·예요. 앞 글자 받침으로 고른다(닫는 괄호·공백은 건너뛴다)."""
    res: list[str] = []
    i = 0
    while True:
        j = text.find("입니다", i)
        if j < 0:
            res.append(text[i:])
            break
        end = j + 3
        if end < len(text) and text[end] not in ".!?,;:)]}\"'\u2019 \n\t":
            res.append(text[i:end])
            i = end
            continue
        head = text[i:j]
        # 앞의 공백·닫는 괄호는 붙여 쓴다: '포함 입니다' → '포함이에요'
        trimmed = head.rstrip()
        core = trimmed
        while core and core[-1] in ")]}\u300d\u300f\"'\u2019":
            core = core[:-1]
        rep = "이에요" if core and has_batchim(core[-1]) else "예요"
        if log is not None:
            log.append(("입니다", rep))
        res.append(trimmed + rep)
        i = end
    return "".join(res)


def _plain_copula(text: str, log) -> str:
    """…구장이다 → …구장이에요 (문장 끝 평서형 서술격 조사)."""
    def repl(m: re.Match) -> str:
        prev = m.group(1)
        rep = "이에요" if has_batchim(prev) else "예요"
        if log is not None:
            log.append((prev + "이다", prev + rep))
        return prev + rep

    return re.sub(r"([가-힣])이다" + _BOUNDARY, repl, text)


def _bnieup(text: str, log) -> str:
    """받침 ㅂ 으로 끝나는 어간 + 니다 (예: 마칩니다 → 마쳐요)."""
    res: list[str] = []
    i = 0
    while True:
        j = text.find("니다", i)
        if j < 0:
            res.append(text[i:])
            break
        end = j + 2
        if j == 0 or end < len(text) and text[end] not in ".!?,;:)]}\"'’ \n\t":
            res.append(text[i:end])
            i = end
            continue
        prev = text[j - 1]
        parts = _split(prev)
        if prev == "습" or parts is None or parts[2] != _F_BIEUP:
            res.append(text[i:end])
            i = end
            continue
        replacement = conjugate(_strip_final(prev))
        if log is not None:
            log.append((prev + "니다", replacement))
        res.append(text[i:j - 1] + replacement)
        i = end
    return "".join(res)


def _seumnida(text: str, log) -> str:
    """…습니다 (받침 어간) → …어요·아요."""
    def repl(m: re.Match) -> str:
        prev = m.group(1)
        rep = conjugate(prev)
        if log is not None:
            log.append((prev + "습니다", rep))
        return rep

    return re.sub(r"([가-힣])습니다" + _BOUNDARY, repl, text)


def _plain_nieun(text: str, log) -> str:
    """…는다(받침 어간)·…ㄴ다(모음 어간)·…좋다(받침 형용사) → 해요체.

    `ㄴ다` 는 글자로 드러나지 않고 앞 글자의 받침 ㄴ 으로만 나타난다(가+ㄴ다=간다).
    그래서 문장 끝 `…다` 앞 글자의 받침을 보고 판단한다.
    """
    def repl_neunda(m: re.Match) -> str:
        prev = m.group(1)
        rep = conjugate(prev)
        if log is not None:
            log.append((prev + "는다", rep))
        return rep

    text = re.sub(r"([가-힣])는다" + _BOUNDARY, repl_neunda, text)

    def repl_nda(m: re.Match) -> str:
        prev = m.group(1)
        parts = _split(prev)
        if parts is None or parts[2] == 0:
            return m.group(0)
        if parts[2] == _F_NIEUN:
            stem = _strip_final(prev)
            rep = conjugate(stem)
        else:
            rep = conjugate(prev)
        if log is not None:
            log.append((prev + "다", rep))
        return rep

    return re.sub(r"([가-힣])다" + _BOUNDARY, repl_nda, text)


def to_haeyo(text: str) -> str:
    """편의 함수 — 기록 없이 변환만."""
    return convert_text(text, None)
