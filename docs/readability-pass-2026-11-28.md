# 2026-11-28 상세 화면 가독성 패스 (v2.9.15)

폰트·코스 구성·긴 조건 문구 세 가지를 한 번에 정리했다. 배포: <https://coursebrief.pages.dev>
(커밋 `5f4d4fe` 웹, `8fd5f4d` 데이터).

## 1) 숫자·영문·한글 폰트를 Pretendard로 통일

- `web/assets/style.css` body 의 폰트 스택이 `"IBM Plex Sans", "Pretendard Variable", …` 순서여서
  라틴·숫자(`0-9`)가 전부 IBM Plex Sans 로, 한글만 Pretendard 로 렌더되고 있었다.
- 스택 맨 앞을 `"Pretendard Variable", Pretendard` 로 바꾸고, `web/index.html` 의
  IBM Plex Sans 웹폰트 요청(구글 폰트 CSS + preconnect 2건)을 삭제했다.
- 라이브 실측(390×844, Chromium): `body`·`.fee-card-value`·`.spec-facts dd` 의 computed
  `font-family` 첫 항목이 모두 `Pretendard Variable`, `document.fonts.check('16px "Pretendard Variable"')` = `true`,
  스타일시트 링크는 Pretendard CDN + `style.05c86643fa.css` 두 개뿐이다.

## 2) '코스 구성'에 구분자 없이 붙어 있던 15곳

540곳의 `course.blocks`·`master.course_spec.blocks` 를 전수 스캔해, 코스명이 붙어 있던 값을
코스별로 나눴다. 근거는 같은 파일의 KGA `nine_hole_courses`·`course_names` 와 공개 자료다.

| 구장 | 이전 | 이후 | 근거 |
| --- | --- | --- | --- |
| 0001 인서울27 | EASTWESTSOUTH | EAST · WEST · SOUTH | course_names |
| 0012 해피니스CC | HIDDENHEALING | 휴먼 · 해피 · 하트 · 힐링 · 히든 | 공식 45홀·서울신문 5개 코스 |
| 0035 푸른솔 | LAKEMOUNTAINHILL | 레이크 · 마운틴 · 힐 | KGA |
| 0046 화순CC | AUTUMNSPRING | 섬머 · 오텀 · 스프링 | KGA 9홀 3개 |
| 0087 가평 베네스트 | MAPLEPINEBIRCH | 메이플 · 파인 · 버치 | KGA |
| 0090 베뉴지CC | GNEWHILL | G · 휴 · 힐 | course_names |
| 0134 이글몬트CC | 이글몬트히든 | 히든 · 이글 · 몬트 | course_names |
| 0141 양평TPC | SOLARLUNARSTELLA | 스텔라 · 루나 · 솔라 | KGA |
| 0174 석천CC | TIGERLION | 석천 | 용인CC In 코스 단일 9홀(공개 자료) |
| 0194 비에이비스타 | 비스타라고보나호박몬티벨라 | 비스타 · 라고 · 보나 · 호박 · 몬티 · 벨라 | 공식·티픽·랭큐 6개 코스 |
| 0204 서원힐스 | EASTWESTSOUTH | 남 · 동 · 서 | course_names |
| 0221 필로스 | EASTWESTSOUTH | EAST · WEST · SOUTH | course_names |
| 0321 포도C.C | 샤인포도자두 | 샤인 · 포도 · 자두 | KGA+공개 |
| 0328 오션비치 | OCEANVALLEYBEACH | 오션 · 밸리 · 비치 | 공식 안내문 |
| 0346 오션힐스포항 | HILLPINEOCEAN | 오션 · 힐 · 파인 | course_names |

## 3) 심이슬 님 비서 가독성 패치 검수·병합 (349곳 / 540필드)

`scripts/apply_readability_pass_2026_11_28.py` 로 병합하며 다음을 확인했다.

- 경로가 실제로 있는 540필드만 반영(누락 0). `cancel.cancel_policy` 가 dict 인 구장은 `.value` 만 바꿔 구조를 유지.
- 문자열마다 숫자·금액·시각·기간 토큰을 이전/이후로 대조했다. 0-padding(`07일`→`7일`), `만원`→`원`,
  `1만7천`→`17,000원`, `오후 5시`→`17:00` 같은 표기 차이는 통과시키고, 값이 사라진 경우는 한 건씩 확인했다.
  - 통과시킨 10건은 모두 스크래핑 잔여물 제거다(게시판 표 머리글 `…4인 1팀 기준 예상 비용구분그린피…`,
    `경기 시간18홀 4시간 3`, `전국 18홀`로 끊긴 문장 등). 목록은 스크립트 `REVIEWED_DROPS` 에 남겼다.
- 내부 정정 메모(`v2.8 정정/정리`)를 0333·0378·0419·0358·0053·0283 에서 고객용 문장으로 바꿨다.
- 일반 화면에 나가는 필드에서 출처·확인일 메타(66건)를 걷어냈다. 수집 근거는 `fee.sources`·`fee.value_check`·
  `cancel.evidence` 같은 관리자 필드에 그대로 남아 있다.

## 4) UI: 긴 조건 문구를 줄바꿈·불릿으로

- `style.css` 에 `.policy-text, .source-line, .fee-card-note, .fact-list dd, .spec-facts dd, .tile-value,
  .inline-fact > span { white-space: pre-line; }` 를 추가해 `\n• ` 형태가 줄글 한 덩어리로 붙지 않게 했다.
- `cancelTimeline()` 이 `주중 3일 전` 뿐 아니라 `평일·주말 모두 7일 전` 표기도 읽도록 보강
  (무료 취소 D-day 막대가 사라지던 15곳 복구).

## 5) 검증

- `npm run data:build` · `npm run build` · `npm run verify`(69항목) · `npm run data:check` 통과.
- `scripts/check_visible_text_2026_11_28.py` 로 540곳 전수 스캔:
  내부 정정 메모 0건 · 출처/확인일 메타 0건 · 구분자 없이 붙은 코스 구성 0건.
- 라이브(390×844) DOM 실측: 베네스트 `코스 구성` = `메이플 · 파인 · 버치`,
  `예약 오픈` 문단 5줄·불릿 5개, `취소·위약` 8줄, 오션비치 `코스 구성` = `오션 · 밸리 · 비치`,
  콘솔 오류 0건.

### 캡처 (`docs/shots-2026-11-28/`)

- `readability-390-benest-02spec.png` — 02 코스 스펙(숫자 Pretendard + 구분된 코스 구성)
- `readability-390-benest-01fee-open.png` — 01 요금·예약 예약 오픈 불릿
- `readability-390-benest-01fee-cancel.png` — 01 요금·예약 취소·위약 불릿 + D-day 막대
- `readability-390-oceanbeach-02spec.png` — 오션 · 밸리 · 비치
- `readability-390-hanmaek-01fee-cards.png` — 카트·캐디피 메모(내부 정정 메모 제거 확인)

## 남은 것

- 요금표 값 자체가 `official` 플레이스홀더인 16곳(0480~0513), 취소 필드에 다른 항목이 섞인 6곳 등은
  이번 범위 밖이라 손대지 않았다(비서 리포트의 잔여 목록과 동일).
