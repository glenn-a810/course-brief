# 누락 필드 보완 배치 6(대구·경북) — 2026-11-27

외부 검수본으로 받은 **배치 6(대구·경북 56곳)** 누락 필드 조사 결과 **73건**을 검수해 빈 필드에 반영했다.
모든 항목이 비어 있던 필드였고(중복 0), 스키마·값 타당성·출처·인용을 확인한 뒤 **73건 / 24곳**을 채웠다.
다만 수신본의 출처 URL 17건이 인용문이 없는 다른 하위 페이지를 가리키고 있어 **실제 인용이 있는 페이지로 바로잡았고**, 값이 인용보다 넓게 서술된 7건은 확인된 범위로 줄이거나 오류를 고쳤다.

## 1. 반영 결과

| 구분 | 건수 |
| --- | ---: |
| 수신 | 73건 / 24곳 |
| **반영** | **73건 / 24곳** |
| 제외 | 0건 |
| 출처 URL 정정 | 17건 |
| 값 표현 정정 | 7건 |

- 데이터: `data/source/golf_courses_all_v29.json` (v2.9.6) → `npm run data:build`로 `data/v29/*` 재생성, `npm run es:bulk`로 `elasticsearch/bulk.ndjson` 재생성.
- 검증: `npm run data:build`·`typecheck`·`build`·`verify`·`data:check` 통과(69개 항목).

## 2. 채운 항목

| 영역 | 항목 | 건수 |
| --- | --- | ---: |
| 예약 | `cancel.open_cycle` 11 · `cancel.cancel_policy` 7 | 18 |
| 현장 운영 | `marshal_caddie` 7 · `checkin` 7 · `locker` 8 · `five_player` 3 · `three_player` 3 · `dress` 3 · `cart_entry` 2 · `cart_type` 1 · `pace` 1 · `bagdrop` 1 | 36 |
| 코스 | `grass.fairway` 5 · `grass.green` 1 · `grass.tee` 1 · `night_light` 1 | 8 |
| 부대시설 | `food` 10 · `practice` 1 | 11 |

값 표기는 기존 스키마를 그대로 따랐다.
- `ops.*`·`facilities.*`: `{ value, evidence[], source_url, source_type, confidence, value_from, checked_at }`
- `course.grass.*`: `{ value, evidence, source, url }`
- `cancel.cancel_policy`: `{ value, source, url, checked_at }`, `cancel.open_cycle`은 문자열
- `course.night_light`는 문자열

## 3. 출처 URL 정정 17건

수신본은 한 사이트 안에서도 인용문이 실제로 있는 하위 페이지가 아니라 대표 페이지(예: 이용요금)를 출처로 적은 경우가 있었다. 같은 공식 사이트 안에서 인용문이 확인된 페이지로 바꿨다.

| 구장 | 항목 | 정정 전 → 후 |
| --- | --- | --- |
| 해내다CC | `facilities.food` | `/View/Guide` → `/View/Facility` (The Prior 레스토랑) |
| 가든골프클럽 | `ops.locker` | `/swp/useReserv` → `/swp/useGuide` |
| 경주신라C.C | `ops.cart_entry`·`ops.pace` | `/swp/terms_use`·`/swp/charge` → `/swp/selfCart_info` |
| 디아너스C.C | `facilities.food`·`ops.cart_entry`·`ops.marshal_caddie` | `/03use/03_01.jsp` → `/03use/11_01.jsp` |
| 디아너스C.C | `ops.checkin` | → `/03use/10_01.jsp` (스마트 체크인) |
| 디아너스C.C | `ops.dress` | → `/03use/01_01.jsp` (클럽 출입 복장) |
| 선리치G.C | `ops.checkin` | `/guide-info/use-guide`(요금안내) → `/guide-info/etiquette` |
| 우리G.C | `course.night_light` | `/Guide/Fee` → `/Course/Course` (코스 공략도) |
| 우리G.C | `ops.checkin` | `/Guide/Fee` → `/Guide/Clause` |
| 대가야CC | `ops.cart_type`·`ops.locker` | `/Info/PayInfo.aspx` → `/Club/ClubInfo.aspx` |
| 애플밸리C.C | `ops.bagdrop` | `/use/reservation.asp` → `/use/guide.asp` |
| 오션비치C.C | `facilities.food` | `/Guide/Fees.asp` → `/Facilities/ShadowHouse.asp` |
| 오션비치C.C | `ops.locker` | `/Guide/Fees.asp` → `/Facilities/Sauna.asp` |

## 4. 값 표현 정정 7건

| 구장 | 항목 | 정정 내용 |
| --- | --- | --- |
| 해내다CC | `facilities.food` | "클럽하우스 레스토랑(The Prior) 운영, 티오프 전 식사 주문 가능" — 시설 페이지와 이용안내(1부 20분·2부 25분 전 주문)로 확인 |
| 디아너스C.C | `facilities.food` | "코스 내 그늘집 운영(9홀 티잉구역 태블릿·유선 주문)" — 클럽하우스 레스토랑 언급은 근거 밖이라 삭제 |
| 선리치G.C | `facilities.practice` | "골프연습장 운영(연습장 프로 우대요금)" — "드라이빙" 표기는 근거 없어 삭제 |
| 우리G.C | `course.night_light` | "페어웨이 조명(라이트) 설치 — 코스 공략도에 라이트 기준 안내" — "야간 라운드 운영"으로 단정하지 않음 |
| 구미C.C | `cancel.cancel_policy` | 주중은 3일 전 17시까지, 주말은 4일 전 17시까지 위약 없음으로 분리(수신본은 4일 전만 기재) |
| 구미C.C | `facilities.food` | "클럽하우스 대식당 운영(4인·개인 식사, 주류 메뉴)" — 근거 없는 스타트하우스(그늘집) 표기 삭제 |
| 오션비치C.C | `ops.locker` | "락카·사우나 운영(지하암반 천연온천)" — 요금표 문구가 아니라 시설 페이지 기준 |

## 5. 검수에서 확인한 원문

- **18홀 기준 파·전장**: 이번 배치에는 `course.par`·`course.length_m` 항목이 없어 정규화 대상이 없었다.
- **골프존카운티 파라미터**: 감포(1)·구미(50)·선산(28)·청통(58) 모두 페이지 상단에 구장명이 표시되는 주소만 사용했고, 감포·청통은 그린피가이드 페이지의 구장명·주소와도 일치했다.
- **그린피가이드 `gc-*`**: `gc-0332`=골프존카운티 감포, `gc-0333`=디아너스C.C, `gc-0330`=우리G.C, `gc-0349`=청통골프장, `gc-0373`=한맥C.C&노블리아, `gc-0322`=청하이스턴C.C로 각 페이지 제목·주소를 대조했다.
- **리조트형 `night_light`**: 우리G.C는 코스 공략도에 페어웨이 라이트가 명시된 경우만 채택했고, 마우나오션·블루원 등은 비워 두었다.
- **취소 규정**: 표가 이미지로만 게시된 골프존카운티 감포·구미·청통의 `cancel_policy`는 채우지 않았고(예약 오픈 문구만 텍스트 확인), 선산은 텍스트 표로 확인된 4일/3~2일/1일/당일 구분을 그대로 옮겼다.

## 6. 남은 미확보 사유

수신본 리포트와 같다. 접속 차단(403·시간초과)·로그인 전용(오션힐스 3곳)·이미지 전용 표 때문에 `ops.mat`·`ops.sauna`·`facilities.shuttle` 등은 비어 있고, 32곳은 신규 채움 0건이다.
