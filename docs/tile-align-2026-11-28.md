# 카드·타일 내부 상단 정렬 수정 (2026-11-28)

## 문제
같은 그리드 행에 놓인 카드·타일이 옆 카드 때문에 늘어날 때, 카드 **내부** 콘텐츠가 세로 중앙으로
내려와 보였다. `03 현장 운영`의 2열 타일에서 `2인 플레이`(여러 줄) 옆 `체크인`(한 줄)의 라벨·값이
타일 가운데에 걸려 아이콘과 첫 줄이 어긋났다.

원인은 카드 내부 그리드의 `align-content` 기본값(stretch)과 `.tile-body`의 `align-content: center`.

## 수정 (`web/assets/style.css`)
| 컴포넌트 | 변경 |
| --- | --- |
| `.tile` | `align-items: start; align-content: start` 추가 |
| `.tile-body` | `align-content: center` → `start` |
| `.grass-card` | `align-items: center` → `start` + `align-content: start`, 점(dot)은 `align-self: start` |
| `.fee-card`, `.stat`, `.provider`, `.principle`, `.extra-course`, `.review-card`, `.brief-block` | `align-content: start` 추가 |
| `.fee-hero` | `grid + align-content: space-between` → `flex column`, `.fee-hero-asof`가 `margin-top: auto`로 바닥 고정 |
| `.fee-card-top` | `align-items: baseline`(두 줄 라벨에서도 배지가 첫 줄에 붙게) |
| `.src-tag` | `flex: none; white-space: nowrap`(좁은 2열에서 `공식 요금표`가 낱말 중간에서 쪼개지던 문제) |
| `.kpi-rating` | 라운더 평가 KPI의 24px 막대를 숨기고 숫자 `nowrap`(폭 100px 남짓에서 `8.20`이 글자 단위로 쪼개지던 문제) |

## 검증
- 540곳 × 3 뷰포트(390·440·1120) = 1,620회 렌더에서 카드 첫 요소가 카드 위 패딩 +6px을 넘는 경우 **0건**
  (`.tile`·`.grass-card`·`.fee-card`·`.kpi`·`.stat`·정책/클러스터/렌탈/프로바이더/원칙/리뷰/브리핑 카드 전수)
- 440px 2열 타일: 아이콘 top = 라벨 top = 12px, 값 32px (긴 타일·짧은 타일 동일)
- `npm run build`, `npm run verify`(69항목) 통과

## 캡처 (`docs/shots-2026-11-28/`)
- `tilealign-before-440-123-03ops.png` / `tilealign-440-123-03ops.png` — 03 현장 운영 전후(440px)
- `tilealign-390-123-0{1,2,3,4}*.png` — 390px 요금·코스 스펙·현장 운영·부대시설
- `tilealign-440-…`, `tilealign-1120-…` — 같은 구장(1·2·3 골프장 `kr-golf-0095`), 가야CC `kr-golf-0353`
