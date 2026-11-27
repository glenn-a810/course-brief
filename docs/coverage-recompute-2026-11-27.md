# 정보 충실도(coverage) 재계산 — 2026-11-27

`#/about`(관리자 모드)과 구장 상세 `08 데이터 정보`의 **영역별 정보 충실도 막대**가 쓰는 `coverage` 지표를
현재 데이터(v2.9.12) 기준으로 다시 계산했다. 원본에 저장돼 있던 값은 2026-11-27 14:40 최종 보완 패스에서
한 번 계산된 뒤 2차 사용자 자료 7개 배치(616값)가 반영되기 전 값이었고, 병합 스크립트가 `coverage` 를
갱신하지 않아 그대로 남아 있었다.

## 1. 원인

1. **낡은 값 고정** — `scripts/build_data_split.py` 는 원본의 `coverage` 블록을 읽어 평균만 냈다.
   `npm run data:build` 를 돌려도 지표는 다시 계산되지 않았다.
2. **값 판정 버그** — 원래 계산식은 필드가 `{"value": …}` 로 감싸진 경우만 "값 있음"으로 셌다. 그래서
   `value` 키 없이 구조로 담긴 값이 전부 "비어 있음"으로 집계됐다.
   - `master.nearest_ic {name, distance_km}` → 기본·입지에서 누락
   - `course.grass {tee, fairway, green}`, `course.kga {kga_name, code}` → 코스 스펙에서 누락
   - `briefing.notices {items}`, `briefing.review {score_10, count}` → 브리핑에서 누락
   - `rental.nearby_delivery {providers}` → 클럽 렌탈에서 누락

## 2. 고친 방식

- 지표 정의(`dataset.coverage_metric`)의 **7개 영역·필드 그룹은 그대로** 두고, "값이 있는가"만 정확히 판정한다
  (`scripts/coverage_metric.py`). 구조 안의 실제 내용을 보고, 출처·확인일·근거 같은 메타데이터만 있는
  딕셔너리는 비어 있는 것으로 센다. `false`·`0`·"불가"처럼 **없음을 확인한 답은 값으로 센다**.
- `npm run data:build` 가 구장별 `coverage` 를 **매번 현재 필드 값에서 다시 계산**해 상세 JSON에 쓰고,
  `index.json` 의 `dataset.coverage` 는 그 값들의 평균으로 만든다. `npm run data:check` 는 생성물의
  `coverage` 가 필드 값과 일치하는지, `dataset.coverage` 가 구장별 평균인지 검사한다.
- 원본 `data/source/golf_courses_all_v29.json` 의 `coverage` 블록도 `scripts/recompute_coverage.py` 로
  같은 값으로 맞췄다(사실 값은 변경 없음 — `coverage`·`coverage_metric`·`coverage_recomputed_at` 만 변경).

## 3. 결과 (540행 평균)

| 영역 | 이전(배포본) | 재계산 후 | 증감 | 주된 요인 |
| --- | ---: | ---: | ---: | --- |
| 기본·입지 `basic` | 82.8% | **92.9%** | +10.1p | `nearest_ic` 구조 값 반영, 2차 보강 |
| 코스 스펙 `course` | 34.1% | **52.3%** | +18.2p | `grass`·`kga` 구조 값 반영(잔디 225곳·KGA 265곳) |
| 요금·예약 `fee` | 79.1% | **79.9%** | +0.8p | 2차 보강의 주중 그린피 |
| 현장 운영 `ops` | 22.8% | **26.3%** | +3.5p | 2차 보강(2·3·5인, 노캐디, 매트 등) |
| 부대시설 `facility` | 24.8% | **24.8%** | — | 변동 없음 |
| 브리핑·공지 `briefing` | 22.2% | **35.9%** | +13.7p | `notices.items` 145곳·`review` 138곳 반영 |
| 클럽 렌탈 `rental` | 23.3% | **47.2%** | +23.9p | `nearby_delivery.providers` 515곳 반영 |
| **7개 영역 평균** | **41.3%** | **51.3%** | +10.0p | |

- 값이 바뀐 구장: **521 / 540곳**.
- 2차 보강분(+616값)이 지표에 직접 반영된 영역은 `ops`(+3.5p)와 `fee`(+0.8p)다. 나머지 상승분은
  위 2번의 판정 버그를 고친 결과다. 2차 보강의 주력 항목인 `cancel.cancel_policy`·`par`·`length_m`·
  `night_light` 는 이 지표의 7개 그룹에 포함되지 않아 수치에 들어오지 않는다(별도 필드 채움률로만 확인 가능).
- 분모는 기존과 같이 **540행 전체**(상세 515 + 마스터 요약 25)다. 상세가 없는 25곳은 `basic` 외 영역이
  0에 가깝게 잡힌다.

## 4. 재현

```bash
python3 scripts/recompute_coverage.py --check   # 원본이 낡았는지 확인(불일치 있으면 종료코드 1)
python3 scripts/recompute_coverage.py           # 원본 coverage 블록 갱신
npm run data:build                              # 생성물 재계산 + 자체 검증
```
