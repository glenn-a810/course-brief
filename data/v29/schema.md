# CourseBrief 데이터 스키마 (v29)

전국 골프장 **540곳**을 웹·앱에서 바로 불러 쓸 수 있게 나눈 정적 데이터 묶음입니다.
원본은 「전국 골프장 통합 데이터셋 v2.9」 단일 JSON이며, 이 디렉터리는 그것을 **목록용 경량 인덱스 + 구장별 상세**로 분할한 결과입니다.

- 스키마 버전: `coursebrief/v29-index-1` (구장 상세는 `stage2c/1.0` 12키)
- 기준일: 2026-11-26
- 구성: 상세 7개 영역 **515곳** + 마스터 요약 **25곳**(건설중·미착공) = **540곳**
- 출처: 문화체육관광부 「전국 골프장 현황」(2024-12-31 기준, 공공데이터포털·이용허락범위 제한 없음), 대한골프협회(KGA) 코스레이팅(2026-11-25 조회), 각 골프장 공식 홈페이지·공지·요금표 수집분
- 요금·운영 정보는 **참고값**입니다. 예약·결제 전 공식 채널에서 최종 확인하세요.

---

## 1. 파일 구조

```
data/v29/
├── index.json              540곳 경량 인덱스 (목록·검색·필터용, 약 200KB)
├── courses/{course_id}.json 구장별 상세 540개 (12키, 상세 없으면 master만)
├── clusters.json           시설 클러스터 28개 (같은 부지 복수 코스)
├── sido.json               시도 코드·건수 (17개)
├── rental_providers.json   클럽 렌탈·딜리버리 업체 8곳
├── rental_deliveries.md    렌탈 시장 조사 원문
└── schema.md               이 문서
```

`course_id`는 `kr-golf-NNNN` 형식의 불변 식별자입니다. 번호는 0001~0544 범위에 흩어져 있는데(540개), 중복 등록이 확인되어 병합된 구장의 번호가 비어 있기 때문입니다. **번호의 연속성을 가정하지 마세요.**

---

## 2. index.json

```jsonc
{
  "dataset": {
    "name": "CourseBrief 정적 데이터 인덱스",
    "version": "v29",
    "schema": "coursebrief/v29-index-1",
    "built_at": "2026-11-26T20:20:00+09:00",
    "source_dataset": "전국 골프장 통합 데이터셋",
    "source_version": "2.9",
    "counts": { "total": 540, "with_detail": 515, "master_only": 25,
                "operating": 512, "suspended": 1, "closed": 2,
                "under_construction": 5, "planned": 20 },
    "fields": { /* 필드 설명(자가 문서화) */ }
  },
  "sido":    [ { "code": "41", "name": "경기도", "short": "경기", "count": 151 }, … ],
  "clusters":[ { "id": "F020", "name": "익산컨트리클럽", "members": ["익산컨트리클럽","상떼힐CC"], "basis": "…", "relationship": "…" }, … ],
  "courses": [ /* 아래 레코드 540개 */ ]
}
```

### courses[] 레코드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | string | `kr-golf-NNNN` |
| `name` | string | 대표 명칭 |
| `aliases` | string[]? | 이명·구 명칭. 검색 보조용(없으면 필드 자체가 없음) |
| `sido` / `sido_code` | string | 시도 약칭 / 행정표준코드 |
| `sigungu` | string | 시군구 |
| `status` | enum | `operating` `suspended` `closed` `under_construction` `planned` |
| `status_label` / `status_note` | string? | 비영업 구장에만 존재. 사유·기간 |
| `holes` | number? | 총 홀수 |
| `type` | string? | `회원제` `대중제` `비회원제` |
| `cluster` | string? | 시설 클러스터 ID(`F001`~). 같은 부지 복수 코스 묶음 |
| `green_fee` | object? | 아래 참조. 값이 없으면 필드 없음 |
| `lat` / `lng` | number? | WGS84 |
| `tel` | string? | 대표 전화(골프장이 공개한 번호) |
| `homepage` | string? | 공식 홈페이지 |
| `detail` | boolean | `true`면 `courses/{id}.json` 에 12키 상세 존재 |

`green_fee` — 1인 18홀 비회원 기준:

| 필드 | 설명 |
| --- | --- |
| `weekday` / `weekend` | 그린피(원). 주말은 토·일·공휴일 기준 |
| `basis` | `official` = 공식 요금표 값, `market` = 공개 예약채널의 최근 관측 실거래 최저가 |
| `as_of` | 공식 값 확인일(`YYYY-MM-DD`) |

> `basis: "market"` 은 공시가가 아니라 **관측된 최저가**입니다. 정상가와 다를 수 있으니 화면에서는 "실거래 최저"로 표기하세요.
> `closed`·`suspended` 구장의 `green_fee` 는 마지막 확인값입니다. **예약 가능한 가격으로 표시하면 안 됩니다.**

---

## 3. courses/{id}.json — 12키 스키마 (`stage2c/1.0`)

```jsonc
{
  "course_id": "kr-golf-0002",
  "meta":      { name, schema, batch, has_detail, generated_at, normalized_at, coverage_metric },
  "master":    { 이름·주소·행정코드·좌표·전화·홈페이지·운영사·면적·개장·상태·클러스터·병합이력 },
  "course":    { holes, holes_received, course_names, membership_type, night_light, blocks,
                 grass{tee,fairway,green}, kga, kga_hole_est, extra_courses, hole_by_hole, length_m, par },
  "fee":       { weekday, weekend, weekday_text, weekend_text, basis, tax_included, cart, caddie,
                 as_of, source_url, note, sources[], market, official_green, official_table,
                 official_detail, member, checked_at },
  "cancel":    { cancel_policy, open_cycle, notes, evidence[], weather_evidence[] },
  "ops":       { nocaddie, two_player, three_player, five_player, marshal_caddie, cart_type,
                 cart_entry, bagdrop, mat, checkin, locker, sauna, dress, pace },   // 각 { value, evidence[] }
  "facilities":{ practice, indoor_range, food, snack_bar, locker_sauna, lodging, other, night,
                 closed_days, shuttle, proshop, ev_charge, gf_facilities[] },       // 각 { value, evidence[] }
  "rental":    { available, full_set, fee_text, brand, left_handed, shoes, nine_hole, range_finder,
                 reservation, source_url, evidence[], official, nearby_delivery{…} },
  "briefing":  { notices{url, items[], tags}, review, fee_change, recent_notice_text, course_notes,
                 alert{level,summary,detail,period,confirmed,…}, unconfirmed[], sources[], collected_at },
  "collection":{ official_site, official_reason, pages_collected, third_party{teepick,greenfeeguide},
                 render_hint, plan_strategy, browser_pages, browser_pdf[] },
  "coverage":  { basic, course, fee, ops, facility, briefing, rental }   // 0~1 채움률
}
```

### 값 표기 규칙 (가장 중요)

| 표기 | 의미 | 화면 처리 |
| --- | --- | --- |
| `null` / `[]` | **미확인** — 공개 정보에서 확인하지 못함 | "미확인"으로 표시. **"없음"으로 해석 금지** |
| `{ "value": …, "evidence": [...] }` | 확인된 값 + 원문 근거 | 값 표시, 근거는 접어서 제공 |
| `"value": "문구 확인(원문 근거)"` | 문구는 확인됐으나 정량화 불가 | 그대로 표시 |
| `"value": false` | 확인 결과 **불가/없음** | "불가"로 표시 |
| `browser:kr-golf-0002_fee-….pdf` | 수집 당시 아카이브 파일명(비공개) | 링크로 만들지 말 것 |
| `market.*` | 공시가가 아닌 관측 실거래 최저가 | "실거래 최저" 라벨 |

- 금액 단위: **원(KRW)**, 요금 기준: **1인·18홀·비회원** (9홀 전용 구장은 `fee.basis` 에 명시)
- 거리: km, 면적: ㎡, 길이: m·yd(필드별 표기)
- 좌표: WGS84, 시간대: Asia/Seoul
- `coverage` 는 7개 영역별 채움률입니다. 낮은 값은 "정보가 없다"는 뜻이며, 그 자체로 유용한 신호입니다.

---

## 4. status enum 처리 규칙

| status | 라벨 | 2026-11-26 기준 | 화면 규칙 |
| --- | --- | --- | --- |
| `operating` | 영업중 | 512곳 | 기본 노출. 요금·예약 안내 표시 |
| `suspended` | **휴업(영업중단)** | **1곳 — 아벨CC(`kr-golf-0511`)** | 배지로 구분. 목록 기본 필터에서 제외. 요금은 "마지막 확인값"으로만 표시 |
| `closed` | 폐업 | 2곳 — 코스모스링스CC(`0031`), ㈜그랜드부민 꿈드림목장(`0400`) | 명시적 폐업 배지. 예약·요금 UI 비활성 |
| `under_construction` | 건설중 | 5곳 — 골드힐CC, 테라CC, 김해 진례, 부안 격포, 홍성 서부 | `expected_open` 표시 |
| `planned` | 미착공 | 20곳 | `expected_open`·`project_stage` 표시 |

**`suspended`(아벨CC) 처리 원칙**
- 2025-07 영업중단(기업회생) → 2025-12 와이제이 인수 → 2026-05-07 회생절차 종결. 2026-11-26 기준 재개장 공지·티타임 판매가 확인되지 않아 `suspended`로 둡니다.
- 과거 명칭 `칼레이트CC`는 `aliases`에 남아 있으므로 검색으로 도달할 수 있어야 합니다.
- 재개장이 확인되면 `operating`으로 바꾸고 `status_note`에 근거를 남깁니다. **임의로 영업중 처리하지 마세요.**
- `closed` 와 달리 `suspended` 는 "언제든 재개 가능"을 전제로 데이터를 지우지 않고 유지합니다.

---

## 5. 시설 클러스터 (`clusters.json`, `index.courses[].cluster`)

같은 부지에 있으나 **등록·요금·예약 창구가 분리된** 코스를 하나의 시설로 묶는 식별자입니다(28개, 60개 코스).

- 목록 화면: 클러스터 구성원을 **한 항목으로 묶고** 시설명 + **구성원 홀수 합계**를 표기합니다.
- 상세 화면: 각 코스는 별도 레코드로 존재하며, 상세 상단에 "같은 부지 시설 N개 코스" 안내와 구성원 링크를 노출합니다.
- **ID를 합치지 않습니다.** 그린피·예약·취소 규정이 다를 수 있으므로 데이터는 분리 유지합니다.

### F020 — 익산컨트리클럽 + 상떼힐CC (표준 예시)

```json
{
  "id": "F020",
  "name": "익산컨트리클럽",
  "members": ["익산컨트리클럽", "상떼힐CC"],
  "basis": "동일 소재지(전북 익산시 무왕로38길 111)·동일 사업자(익산관광개발㈜)",
  "relationship": "익산컨트리클럽 정규 18홀(동·서코스) + 같은 부지 부속 퍼블릭 6홀(문체부 등록명 상떼힐CC). 클럽 전체가 2004~2019년 상떼힐익산컨트리클럽이었고, 2019년 익산컨트리클럽으로 환원. 24홀 960,591㎡ 한 부지이나 그린피·예약은 18홀/6홀 분리 운영."
}
```

| 레코드 | 이름 | 홀수 | 화면 표기 |
| --- | --- | --- | --- |
| `kr-golf-0498` | 익산컨트리클럽 | 18 | 목록에서 대표. **"익산컨트리클럽 (24홀)"** 로 합산 표기 |
| `kr-golf-0496` | 상떼힐CC | 6 | 상세에서 "같은 부지 6홀 · 예약·요금 별도" 로 연결 |

- 목록 카드 제목: `익산컨트리클럽 (24홀)`, 부제: `익산컨트리클럽 18홀 + 상떼힐CC 6홀`
- 상세: 18홀과 6홀의 **그린피·예약 창구가 별도**임을 명시. 24홀로 한 번에 예약된다고 안내하면 안 됩니다.
- 같은 방식이 적용되는 다른 예: 오시아노골프클럽+파인비치골프링크스(위탁 운영, 27홀로 통합 판매), 센추리21(3개 코스), 용평리조트, 클럽72, 설해원 등.

클러스터를 쓰지 않는 소비자는 `cluster` 가 `null` 인 구장만 개별 항목으로 취급하면 됩니다.

---

## 6. 렌탈·딜리버리 (`rental_providers.json`)

해외 골퍼·장비 없는 라운드를 위한 클럽 렌탈 업체 8곳입니다. 구장별 `rental.nearby_delivery.providers` 는 **그 구장이 속한 권역에 배송 가능한 업체**만 담고 있습니다.

| 필드 | 설명 |
| --- | --- |
| `id`, `name`, `phone`, `url` | 업체 식별자·명칭·공개 연락처·홈페이지 |
| `regions` | 서비스 권역(`수도권` `강원` `충청` `호남` `영남` `제주`) |
| `coverage` | `{ 권역: "O" \| "조건부" \| "X" \| "미확인" }` — `조건부`는 조건이 붙어 가능 |
| `price` | 대표 요금(업체 공개 기준) |
| `brands` | 취급 클럽 브랜드(좌타·여성 보유 여부 포함) |
| `delivery` | 배송·픽업 방식 |
| `languages` | 상담·예약 지원 언어 |
| `status` | 영업 상태(예: 아피오즈는 2026-11 기준 예약 중단) |
| `course_count` | 이 업체가 권역 매핑된 구장 수 |

- 공항 터미널 내 상주 렌탈 데스크는 사실상 없습니다.
- 재고·개별 견적·실제 배송 가능 여부는 전화·카카오톡 상담으로만 확인됩니다(데이터에 `미확인`으로 남김).
- 업체 연락처는 **업체가 공개한 사업자 번호**만 수록했습니다.

---

## 7. 검색

### 정적 검색 (기본, 0원)

`web/assets/search.ts` 의 `LocalSearchAdapter` 가 브라우저에서 인덱스를 검색합니다(타입 계약: `shared/types/search.ts`).

- 한글 **초성 검색**(`ㅇㅅ` → 익산, 인서울…), 부분 일치, 공백 분리 다중 토큰 AND
- 필드 가중치: 이름 일치 > 이름 접두 > 이름 포함 > 이명 > 초성 > 시군구 > 시도 > 이용형태 > ID
- 필터(지역·상태·이용형태·홀수·그린피)는 검색 결과 위에 별도 적용

### Elasticsearch (선택)

`elasticsearch/` 에 nori 한국어 분석기 기준 매핑, bulk NDJSON 생성·적재 스크립트, `docker-compose.yml`, ES 어댑터(`EsSearchAdapter`)가 있습니다. `shared/types/search.ts` 의 `SearchAdapter` 계약만 같으면 교체할 수 있습니다.

```js
// 교체 방법 (index.html 앞에 설정 추가)
window.COURSEBRIEF_CONFIG = { search: { mode: "es", endpoint: "/api/search" } };
```

ES 가 응답하지 않으면 자동으로 정적 검색으로 되돌아갑니다. 자세한 절차는 `elasticsearch/README.md`.

---

## 8. 갱신·검증

```bash
npm run data:build   # data/source/golf_courses_all_v29.json → data/v29/* 재생성
npm run data:check   # 12키 무결성·개수·금지 문자열·인덱스 300KB 이하 검증
npm run typecheck    # TypeScript(웹·Pages Functions) 타입 검사
npm run build        # typecheck 후 dist/ 생성 (웹 번들 + 데이터)
npm run verify       # 빌드 산출물 검증
```

갱신 주기 권고: 요금·공지는 **월 1회**, 상태(폐업·개칭)는 **분기 1회**, KGA 레이팅은 **반기 1회**.

## 9. 한계

- 문체부 원본은 2024-12-31 기준이라 신규·폐업 골프장이 반영되지 않을 수 있습니다(상태는 별도 조사로 보정).
- KGA 레이팅은 회원사 중심 276개 골프장만 존재하며, 9홀 단독 코스는 "핸디캡 산정 불가"로 등록된 경우가 있습니다.
- 공지 본문이 이미지인 골프장이 많아 제목·날짜만 수집된 경우가 있습니다.
- 좌표 정밀도는 `master.geo_confidence`(high/medium/low)로 구분되며, 건설 예정지는 주소 지오코딩 오차가 있습니다.

## 10. 공개 배포 처리

이 저장소는 공개 저장소입니다. 분할 과정에서 다음을 제거·치환했습니다.

- 내부 작업 경로(`memory/…`, `clones/…`) → 파일명만 남김
- 협업자 실명이 들어간 출처 표기 → `외부 데이터 검수` / `외부 데이터 수신`
- 개인 계정 정보(이메일·개인 전화번호) 없음. 수록된 연락처는 **골프장·업체가 공개한 사업자 번호**뿐입니다.
