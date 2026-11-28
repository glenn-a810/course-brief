# CourseBrief 공개 데이터 API (v1)

CourseBrief의 골프장 데이터를 다른 사이트·앱·제휴 서비스에서 바로 쓸 수 있게 정적 JSON으로 공개합니다.
서버·키·가입이 없고, 모든 응답은 **읽기 전용**입니다.

- 기준 URL: `https://coursebrief.pages.dev`
- 데이터 출처: 문화체육관광부 「전국 골프장 현황」(공공데이터포털, 이용허락범위 제한 없음), 대한골프협회(KGA) 코스레이팅, 각 골프장이 공개한 홈페이지·공지·요금표
- 갱신: 데이터를 수집·검증한 뒤 빌드할 때마다 새로 생성됩니다(`dataset.built_at`).

> **참고값입니다.** 요금·운영 정보는 수집 시점의 공개 자료이며 골프장 정책에 따라 바뀝니다.
> 예약·결제 전 공식 채널에서 확인하세요. CourseBrief는 예약을 대행하지 않습니다.

---

## 1. 엔드포인트

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/v1/courses.json` | 540곳 경량 목록(한 번에 약 270KB) |
| GET | `/api/v1/courses/{id}.json` | 구장 1곳의 경량 레코드 + 링크 |
| GET | `/data/v29/courses/{id}.json` | 구장 1곳의 **상세 12키** 원본(스키마 `stage2c/1.0`) |
| GET | `/data/v29/schema.md` | 데이터 스키마 문서 |
| GET | `/data/v29/price_history.json` | 그린피 스냅샷 이력(값이 바뀐 날만) |
| GET | `/api/v1/courses.json` 의 `courses[].links.embed` | 구장 카드 임베드 페이지 |

CORS: `/api/v1/*` 는 `Access-Control-Allow-Origin: *` 입니다. 브라우저에서 바로 `fetch` 할 수 있습니다.
`/data/v29/*` 는 사이트가 직접 쓰는 원본이라 CORS 헤더가 없습니다 — 서버·앱에서 받을 때는 `/api/v1` 을 쓰세요.

```bash
curl -s https://coursebrief.pages.dev/api/v1/courses.json | head -c 400
curl -s https://coursebrief.pages.dev/api/v1/courses/kr-golf-0002.json
```

---

## 2. `/api/v1/courses.json`

```jsonc
{
  "dataset": {
    "name": "CourseBrief 공개 데이터 API",
    "schema": "coursebrief/api-1",
    "version": "2.9.16",              // 원본 데이터셋 버전
    "built_at": "2026-11-28T…Z",      // 이 파일을 만든 시각
    "data_built_at": "2026-11-28T14:50:00+09:00",
    "count": 540,
    "counts": { "total": 540, "operating": 512, "with_detail": 515, … },
    "license": "…",
    "notes": [ "…" ]
  },
  "courses": [ /* 아래 레코드 540개 */ ]
}
```

### courses[] 레코드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | string | `kr-golf-NNNN` (번호는 연속이 아님) |
| `name` | string | 대표 명칭(한국어 원문) |
| `aliases` | string[]? | 이명·구 명칭 |
| `sido` / `sido_code` / `sigungu` | string | 시도 약칭 · 행정표준코드 · 시군구 |
| `status` | enum | `operating` `suspended` `closed` `under_construction` `planned` `cancelled` |
| `holes` | number? | 총 홀수 |
| `type` | string? | `회원제` `대중제` `비회원제` |
| `green_fee` | object? | `{ weekday, weekend, basis, as_of }` — 1인 18홀 비회원 기준 |
| `cart` / `caddie` | number? | 카트·캐디피(원, **팀 기준**) |
| `tags` | string? | 배지 코드 `n`노캐디 `2`2인 `y`야간 `s`사우나 `l`숙박 `h`셔틀 `p`연습장 `f`식당 |
| `rating` / `reviews` | number? | 라운더 평가(10점) · 집계 건수 |
| `notice` | string? | 최근 운영 공지 날짜(`YYYY-MM-DD`) |
| `alert` | boolean? | 확인이 필요한 운영 알림 존재 |
| `cov` | number? | 7개 영역 평균 정보 충실도(0~100) |
| `slope` | object? | `{ value, tee, combos }` — KGA 대표 슬로프 레이팅(남자 Regular 티 18홀 조합 평균). 없으면 필드 없음 |
| `lat` / `lng` | number? | WGS84 |
| `tel` / `homepage` | string? | 골프장이 공개한 대표 전화 · 홈페이지 |
| `links` | object | `self` · `detail` · `page` · `embed` 절대 URL |

**값 규칙** — CourseBrief의 데이터 원칙이 API에도 그대로 적용됩니다.

- 값이 없으면 **필드가 없거나 `null`** 입니다. `0` 이 아닙니다.
- `green_fee.basis` 가 `market` 이면 공시가가 아니라 **공개 예약채널의 관측 최저가**입니다.
- `closed`·`suspended` 구장의 요금은 마지막 확인값입니다. 예약 가능한 가격으로 쓰지 마세요.

---

## 3. `/api/v1/courses/{id}.json`

```jsonc
{
  "dataset": { "schema": "coursebrief/api-1", "version": "2.9.16", "built_at": "…" },
  "course": { /* courses.json 과 같은 레코드 1개 */ }
}
```

상세 12키(코스 스펙·취소 규정·현장 운영·부대시설·브리핑·렌탈·근거)는 `course.links.detail` 에서 받습니다.
같은 파일을 두 벌 두면 한쪽이 낡을 수 있어 복제하지 않고 링크로 가리킵니다.

---

## 4. 구장 카드 임베드(iframe)

```html
<iframe src="https://coursebrief.pages.dev/embed/kr-golf-0002/"
        title="CourseBrief" width="360" height="220"
        style="border:0;max-width:100%;border-radius:16px" loading="lazy"></iframe>
```

- 구장명·지역·홀수·이용형태·주말(없으면 주중) 그린피·배지·슬로프만 담은 **약 2.4KB**짜리 정적 문서입니다(스크립트 없음).
- 밝은/어두운 모드에 자동 대응하고, 카드를 누르면 CourseBrief의 해당 구장 페이지가 새 창으로 열립니다.
- `/embed/*` 는 프레임 허용(`X-Frame-Options` 해제, `frame-ancestors *`)이고 `noindex` 입니다.
  운영 주소는 `/c/{id}/` 페이지이고, 앱 안 미리보기는 `#/embed/{id}` 입니다.

---

## 5. 캐시·갱신 지침

| 경로 | 캐시 |
| --- | --- |
| `/api/v1/*` | `public, max-age=300` (5분) |
| `/data/v29/courses/*` | `public, max-age=86400` (1일) |
| `/embed/*` | `public, max-age=3600` |

- 하루 한 번 이상 새로 받으려면 위 캐시를 그대로 쓰세요. 더 자주 필요하면 `?v={built_at}` 를 붙이세요.
- 목록은 `dataset.built_at` 이 바뀌었는지로 갱신 여부를 판단할 수 있습니다.
- 과도한 요청은 정적 호스팅(Cloudflare)이 처리하지만, 제휴로 대량 사용할 때는 미리 알려 주세요.

---

## 6. 쓰면 안 되는 방식

| 항목 | 이유 |
| --- | --- |
| 실시간 티타임 재고 조회 | CourseBrief는 재고 데이터를 갖고 있지 않습니다 |
| 예약·결제 대행 | 약관·정산·개인정보 책임이 발생합니다. 링크로만 연결하세요 |
| 값이 없는 칸을 0·"없음"으로 표시 | CourseBrief에서 `null` 은 "미확인"입니다 |
| 수집분 재판매 | 공공데이터(문체부) 부분은 자유 이용이지만, 골프장 홈페이지에서 수집한 문장은 인용 범위를 넘기지 마세요 |
