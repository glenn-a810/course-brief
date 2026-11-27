# 누락 필드 보완 배치 2(수도권 B) — 2026-11-27

외부 검수본으로 받은 **배치 2(경기 81곳)** 누락 필드 조사 결과 156건을 검수해 빈 필드에만 반영했다.
이미 값이 있던 필드는 덮어쓰지 않았고, 출처와 값이 어긋나는 항목은 제외했다.

## 1. 반영 결과

| 구분 | 건수 |
| --- | ---: |
| 수신 | 156건 / 58곳 |
| **반영** | **135건 / 56곳** |
| 제외 | 21건 (사유는 §3) |

- 데이터: `data/source/golf_courses_all_v29.json` (v2.9.2) → `npm run data:build`로 `data/v29/*` 재생성, `npm run es:bulk`로 `elasticsearch/bulk.ndjson` 재생성.
- 검증: `npm run data:build`·`typecheck`·`build`·`verify`·`data:check` 통과(69개 항목).

## 2. 채운 항목

| 영역 | 항목 | 건수 |
| --- | --- | ---: |
| 예약 | `cancel.open_cycle` 37 · `cancel.cancel_policy` 17 | 54 |
| 요금 | `fee.weekday` 1 · `fee.weekend` 1 · `fee.cart` 2 · `fee.caddie` 1 | 5 |
| 코스 | 잔디(`fairway` 7·`green` 3·`tee` 1) · `night_light` 3 · `par` 2 · `length_m` 2 | 18 |
| 현장 운영 | `two_player` 9 · `three_player` 7 · `five_player` 3 · `checkin` 5 · `cart_type` 4 · `marshal_caddie` 4 · `dress` 3 · `locker` 3 · `sauna` 2 · `nocaddie` 2 · `mat` 1 · `pace` 1 | 44 |
| 부대시설 | `food` 8 · `lodging` 3 · `practice` 2 · `shuttle` 1 | 14 |

값은 기존 스키마 표기를 그대로 따랐다.
- `ops.*`·`facilities.*`: `{ value, evidence[], source_url, source_type, confidence, checked_at }`
- `course.grass.*`: `{ value, evidence, source, url }` (기존 잡음 근거는 확인된 인용문으로 교체)
- `fee.cart`·`fee.caddie`: `{ value, raw, source, url }` (캐디는 `none: false`)
- `cancel.cancel_policy`: `{ value, source, url, checked_at }`, `cancel.open_cycle`은 문자열
- `fee.weekday`·`fee.weekend`: 원 단위 정수 + `fee.basis`·`as_of`·`sources`에 출처 기록

### 18홀 기준 정규화

- `kr-golf-0164` 골드CC: 36홀 총 파 144 → **72**, 총 전장 12,364m(챔피언 6,327 + 마스터 6,037) → **6,182m**. `master.par`·`master.course_spec`도 함께 맞췄다.
- `kr-golf-0182` 지산퍼블릭: 9홀 단독 구장이라 **2,255m(9홀)** 그대로 반영(규칙: 9홀 단독만 9홀, 18홀 이상은 18홀 기준).
- `kr-golf-0230` 화성골프클럽: 9홀 파 35 그대로 반영.
- `kr-golf-0216` 포레스트힐: 원문이 **포레스트 6홀 코스**의 오픈 일정이라 값에 그 범위를 명시했다.

## 3. 제외한 21건

### 3-1. 출처가 다른 구장을 가리키는 경우 (14건)

그린피가이드 페이지 번호가 수신본에 적힌 구장이 아니라 **같은 권역의 다른 구장**을 가리켰다. 실제 페이지를 열어 구장명·주소로 확인했다.

| 수신 구장 | 실제 출처 페이지 | 건수 |
| --- | --- | ---: |
| kr-golf-0194 비에이비스타골프장(회원제) | `gc-0083` = 비에이비스타C.C.**대중제**(`kr-golf-0195`, 같은 값 이미 보유) | 4 |
| kr-golf-0215 코브스윙 | `gc-0106` = **필로스골프클럽**(`kr-golf-0221`) | 8 |
| kr-golf-0218 포천아도니스 대중골프장 | `gc-0107` = 포천아도니스 C.C **회원제**(`kr-golf-0217`) | 1 |
| kr-golf-0182 지산퍼블릭 | `gc-0027` = 지산CC **회원제**(`kr-golf-0181`, 기존 값은 "전면 노캐디") | 1 |

### 3-2. 필드가 묻는 것과 다른 내용 (4건)

- `kr-golf-0160`·`kr-golf-0162` `ops.five_player`: 5인승 카트 승차정원·1팀 1캐디 설명으로 5인 플레이 가능 여부를 말하지 않음.
- `kr-golf-0183` `ops.three_player`: 인터넷 예약 시 동반자 3인 입력 규칙.
- `kr-golf-0185` `ops.three_player`: 2인 플레이 추가요금 설명(같은 문장은 `two_player`에 반영).

### 3-3. 값 기준이 스키마와 맞지 않는 경우 (3건)

- `kr-golf-0154` 신라CC `fee.weekday`·`fee.weekend`: 원더클럽 **통합회원** 10월 요금표의 범위값(180,000~260,000 / 260,000~330,000)이라 "1인 18홀 비회원 정상가"로 표시할 수 없음. 같은 표의 카트비 100,000원(1팀)은 회원 구분과 무관해 반영.
- `kr-golf-0157` 이포골프장 `ops.cart_type`: 1990년 "리모콘 전동카 도입" 기사로 현재 카트 종류의 근거가 되지 못함.

## 4. 남은 미확보 사유

수신본 리포트와 같은 이유다. `ops.bagdrop`·`ops.mat`·`ops.marshal_caddie`·`facilities.shuttle`은 홈페이지에 거의 게시되지 않고, 회원제 구장의 위약·예약 규정 상당수는 로그인 후에만 공개된다. 예약실 전화 확인이 남은 경로다.
