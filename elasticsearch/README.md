# Elasticsearch 연동 (선택)

CourseBrief 웹은 **의존성 없이 브라우저에서 도는 정적 검색**으로도 충분히 동작합니다.
이 디렉터리는 검색 품질을 더 높이거나(형태소 분석·동의어·랭킹 튜닝) 서버 로그 기반 개선을 하려는 경우를 위한 **교체 가능한 검색 백엔드**입니다.

핵심 원칙: 사이트는 `SearchAdapter` 인터페이스(`shared/types/search.ts`)만 알면 되고, 검색 엔진은 갈아 끼울 수 있습니다.

```
web/assets/search.ts
  ├─ LocalSearchAdapter   (기본) 브라우저 검색 — 초성·부분일치·다중 토큰
  ├─ EsSearchAdapter      (선택) ES 프록시 호출, 실패 시 자동으로 Local 로 폴백
  └─ createSearchAdapter(config, ctx)
```

## 1. 구성 파일

| 파일 | 내용 |
| --- | --- |
| `mapping.json` | 인덱스 매핑. `nori_tokenizer`(decompound_mode: mixed) + `nori_readingform` 한국어 분석기, `name_chosung` 키워드 필드, `geo_point` 좌표 |
| `docker-compose.yml` | 로컬 테스트용 단일 노드 ES 8.15 (security off, nori 내장) |
| `ingest.mjs` | `data/v29/index.json` → `bulk.ndjson` 생성, `--push` 로 인덱스 생성·적재 |
| `bulk.ndjson` | 생성된 적재 파일 (540 docs) |
| `../functions/api/search.ts` | Cloudflare Pages Function 프록시 (브라우저에 키를 노출하지 않음) |

## 2. 로컬에서 5분 안에

```bash
npm run es:up                 # docker compose up -d (http://localhost:9200)
npm run es:bulk               # bulk.ndjson 생성
ES_URL=http://localhost:9200 node elasticsearch/ingest.mjs --push --recreate
curl -s 'localhost:9200/coursebrief-v29/_count?pretty'
```

적재 결과 확인:

```bash
curl -s -X POST 'localhost:9200/coursebrief-v29/_search?pretty' -H 'content-type: application/json' -d '{
  "size": 3,
  "_source": ["id","name","sido","sigungu","green_fee_weekend"],
  "query": { "bool": { "should": [
    { "match_phrase": { "name": { "query": "익산", "boost": 8 } } },
    { "multi_match": { "query": "익산", "fields": ["name^4","aliases^2","sigungu^1.5"] } }
  ], "minimum_should_match": 1 } }
}'
```

## 3. 웹에 연결

`web/index.html` 의 `app.js` 로드 앞에 설정을 추가합니다.

```html
<script>
  window.COURSEBRIEF_CONFIG = {
    search: { mode: "es", endpoint: "/api/search" }   // Pages Function 경유(권장)
  };
</script>
<script type="module" src="assets/app.js"></script>
```

- `endpoint` 가 `/api/search` 면 프록시가 ES DSL 로 변환해 호출합니다.
- `endpoint` 가 ES 주소(`https://…/_search`)면 `EsSearchAdapter` 가 ES DSL 을 직접 만들어 보냅니다(테스트용, 키 노출 주의).
- ES 가 2.5초 안에 응답하지 않거나 오류면 **자동으로 정적 검색으로 되돌아갑니다**(`lastFallback`).

## 4. Cloudflare Pages 에서

Pages 프로젝트 → Settings → Environment variables:

| 변수 | 예 |
| --- | --- |
| `ES_URL` | `https://<deployment>.es.<region>.aws.elastic.cloud` |
| `ES_API_KEY` | read-only API 키 (해당 인덱스만) |
| `ES_INDEX` | `coursebrief-v29` |

- Build command: `npm run build`, Output directory: `dist`
- `functions/` 디렉터리는 프로젝트 **루트**에 있어야 Pages Functions 로 배포됩니다(빌드 출력과 별개).
- ES 를 쓰지 않으면 이 디렉터리와 `functions/` 를 지워도 사이트는 그대로 동작합니다(0원 정적 호스팅).

## 5. 매핑 설계 메모

- **nori + decompound_mode: mixed** — "골프존카운티안성" 같은 합성어를 색인 시 복합어/분해어로 함께 저장해 "골프존 안성" 검색이 걸립니다.
- **name_chosung** — nori 는 자모 단독 질의(ㅇㅅ)를 잘 다루지 못합니다. 초성 검색은 별도 keyword 필드에서 `term`/`prefix` 로 처리합니다.
- **name.lower 정확 일치 boost 12** — 동명이인 구장(예: 여러 "골프존카운티 ○○")에서 정확한 이름을 최상위로.
- **strict 매핑** — 예상치 못한 필드가 들어오면 적재가 실패합니다. 스키마를 바꾸면 `mapping.json` 과 `ingest.mjs` 를 함께 고치세요.
- 샤드 1 · 레플리카 0 — 540 docs 규모에서는 단일 샤드가 가장 빠릅니다.
