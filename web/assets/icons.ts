/**
 * 인라인 SVG 아이콘 — 런타임 의존성 없는 24×24 스트로크 세트.
 *
 * 모두 `currentColor` 로 그려 색은 CSS 가 정한다(라이트/다크 자동 대응).
 * 장식 아이콘이므로 항상 `aria-hidden="true"` + `focusable="false"` 로 내보내고,
 * 의미는 옆의 텍스트가 전달한다.
 */
export type IconName =
  | "search"
  | "close"
  | "filter"
  | "chevron"
  | "arrow-right"
  | "arrow-left"
  | "phone"
  | "globe"
  | "pin"
  | "flag"
  | "cart"
  | "person"
  | "users"
  | "moon"
  | "sun"
  | "contrast"
  | "steam"
  | "bed"
  | "bus"
  | "gauge"
  | "clock"
  | "shirt"
  | "locker"
  | "ruler"
  | "grass"
  | "calendar"
  | "check"
  | "info"
  | "alert"
  | "star"
  | "external"
  | "copy"
  | "refresh"
  | "sort"
  | "sparkle"
  | "building"
  | "parking"
  | "bolt"
  | "menu"
  | "ball";

const PATHS: Record<IconName, string> = {
  search: '<circle cx="11" cy="11" r="6.6"/><path d="M16 16l4.4 4.4"/>',
  close: '<path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6"/>',
  filter: '<path d="M4 7h16M7.5 12h9M10.5 17h3"/>',
  chevron: '<path d="M6.5 9.5l5.5 5.5 5.5-5.5"/>',
  "arrow-right": '<path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5"/>',
  "arrow-left": '<path d="M19.5 12h-14M11 17.5L5.5 12 11 6.5"/>',
  phone: '<path d="M6.2 3.6h3l1.5 3.8-2 1.4a12 12 0 0 0 6.5 6.5l1.4-2 3.8 1.5v3a2 2 0 0 1-2.2 2A16.6 16.6 0 0 1 4.2 5.8a2 2 0 0 1 2-2.2z"/>',
  globe: '<circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8M12 3.4c2.3 2.4 3.4 5.4 3.4 8.6s-1.1 6.2-3.4 8.6c-2.3-2.4-3.4-5.4-3.4-8.6S9.7 5.8 12 3.4z"/>',
  pin: '<path d="M12 21.2c4.2-4.3 6.4-7.6 6.4-10.6a6.4 6.4 0 1 0-12.8 0c0 3 2.2 6.3 6.4 10.6z"/><circle cx="12" cy="10.2" r="2.3"/>',
  flag: '<path d="M6.5 21V3.6M6.5 4.4h10.2l-1.8 3.4h2.6l-1.8 3.4H6.5"/>',
  cart: '<path d="M3.5 5.5h2.2l1.1 8.2h9.6l1.9-6.3H6.4"/><circle cx="8.6" cy="18.2" r="1.6"/><circle cx="15.4" cy="18.2" r="1.6"/>',
  person: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.2c0-3.6 3.2-6 7.2-6s7.2 2.4 7.2 6"/>',
  users: '<circle cx="9" cy="8.4" r="3.1"/><path d="M2.8 19.6c0-3.2 2.8-5.3 6.2-5.3s6.2 2.1 6.2 5.3"/><path d="M16 6.2a3 3 0 0 1 0 5.8M17.4 14.7c2.2.5 3.8 2.2 3.8 4.9"/>',
  moon: '<path d="M20.2 14.8A8.6 8.6 0 0 1 9.2 3.8 8.6 8.6 0 1 0 20.2 14.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5l1.5 1.5M17 17l1.5 1.5M18.5 5.5L17 7M7 17l-1.5 1.5"/>',
  contrast: '<circle cx="12" cy="12" r="8.6"/><path d="M12 3.4a8.6 8.6 0 0 1 0 17.2z" fill="currentColor" stroke="none"/>',
  steam: '<path d="M4.5 18.5h15M6.4 15c1.2-1.9 2.7-1.9 3.9 0s2.7 1.9 3.9 0 2.7-1.9 3.9 0"/><path d="M8.4 6.2c-1.3 1.3 1.3 2.3 0 3.6M12.4 5.6c-1.3 1.3 1.3 2.3 0 3.6M16.4 6.2c-1.3 1.3 1.3 2.3 0 3.6"/>',
  bed: '<path d="M3.4 19v-8.2h13a4 4 0 0 1 4 4V19M3.4 14.6h17M6.8 10.8V8.2h5.4v2.6"/><path d="M3.4 19v1.6M20.4 19v1.6"/>',
  bus: '<rect x="4.4" y="4.4" width="15.2" height="12.4" rx="2"/><path d="M4.4 11h15.2M8 4.4v6.6M16 4.4v6.6"/><circle cx="8.2" cy="19.2" r="1.4"/><circle cx="15.8" cy="19.2" r="1.4"/>',
  gauge: '<path d="M4.2 17.8a8.8 8.8 0 1 1 15.6 0"/><path d="M12 17.8l3.8-5.2"/><circle cx="12" cy="17.8" r="1.4"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.2 2"/>',
  shirt: '<path d="M8.6 3.8L5 5.6l-1.6 4 2.6 1.2V20h12v-9.2l2.6-1.2-1.6-4-3.6-1.8-1.2 2.4h-4.4z"/>',
  locker: '<rect x="4.6" y="3.6" width="6.2" height="16.8" rx="1.2"/><rect x="13.2" y="3.6" width="6.2" height="16.8" rx="1.2"/><path d="M8.4 10.8v2.4M15.4 10.8v2.4"/>',
  ruler: '<path d="M3.2 15.6l12.4-12.4 4.8 4.8L8 20.4z"/><path d="M7 11.8l1.9 1.9M10 8.8l1.9 1.9M13 5.8l1.9 1.9"/>',
  grass: '<path d="M4 20c0-5 2.2-8.6 5.4-10.4C9 13 9.4 16.4 9.4 20M12 20c0-6 2-10.6 5.6-13.2-.4 4.4-.4 8.8-.4 13.2M15.6 20c0-4.6 1-8 2.6-10.2.4 3.4.6 6.8.6 10.2"/>',
  calendar: '<rect x="3.8" y="5.4" width="16.4" height="15" rx="2.2"/><path d="M3.8 10h16.4M8.4 3.4v3.6M15.6 3.4v3.6"/>',
  check: '<path d="M5 12.6l4.6 4.6L19 6.6"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 10.8V17M12 7.4v.6"/>',
  alert: '<path d="M12 3.8L21 20H3z"/><path d="M12 9.4v4.8M12 17.2v.6"/>',
  star: '<path d="M12 3.6l2.7 5.6 6.1.8-4.5 4.2 1.2 6-5.5-3-5.5 3 1.2-6L3.2 10l6.1-.8z"/>',
  external: '<path d="M13.6 4.4H20v6.4M20 4.4L11 13.4"/><path d="M18.4 14v5.2a1.4 1.4 0 0 1-1.4 1.4H5.8a1.4 1.4 0 0 1-1.4-1.4V8a1.4 1.4 0 0 1 1.4-1.4H11"/>',
  copy: '<rect x="8.6" y="8.6" width="11.8" height="11.8" rx="2.2"/><path d="M15.4 5.6a2 2 0 0 0-2-2H5.6a2 2 0 0 0-2 2v7.8a2 2 0 0 0 2 2"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.2V10h-5.6"/>',
  sort: '<path d="M8 5v14M4.8 15.2L8 18.4l3.2-3.2M16 19V5M12.8 8.8L16 5.6l3.2 3.2"/>',
  sparkle: '<path d="M12 3.4l1.9 5.3 5.3 1.9-5.3 1.9L12 17.8l-1.9-5.3L4.8 10.6l5.3-1.9z"/>',
  building: '<rect x="4.4" y="3.8" width="15.2" height="16.4" rx="1.8"/><path d="M8.4 8h2M13.6 8h2M8.4 12h2M13.6 12h2M9.6 20.2v-4h4.8v4"/>',
  parking: '<rect x="3.8" y="3.8" width="16.4" height="16.4" rx="3"/><path d="M9.8 16.6V7.4h3.1a2.8 2.8 0 0 1 0 5.6H9.8"/>',
  bolt: '<path d="M13.4 2.8L5.6 13.4h5.4l-.8 7.8 7.8-10.6h-5.4z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  ball: '<circle cx="12" cy="12" r="8.6"/><path d="M8.4 6.6l1.4 2.2M15.4 6.6l-1.4 2.2M6.6 12h2.4M15 12h2.4M9.4 18l1.2-2M14.6 18l-1.2-2"/>',
};

/** 아이콘 SVG. 크기는 CSS(`.ic` 클래스)가 정한다. */
export function icon(name: IconName, extraClass = ""): string {
  const body = PATHS[name];
  const cls = extraClass ? `ic ${extraClass}` : "ic";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/* ---------------- 인포그래피 ---------------- */

/**
 * 값 하나를 눈금 위에 얹는 게이지. 전장·평점처럼 "범위 안에서 어디쯤인가"가
 * 숫자보다 빨리 읽히는 값에 쓴다. 눈금 라벨은 HTML 로 붙여 스크린리더가 읽는다.
 */
export function gauge(opts: {
  value: number;
  min: number;
  max: number;
  ticks?: Array<{ at: number; label: string }>;
  label?: string;
}): string {
  const { value, min, max, ticks = [], label } = opts;
  const span = max - min || 1;
  const pct = Math.max(0, Math.min(100, ((value - min) / span) * 100));
  const tickHTML = ticks
    .map((t) => {
      const x = Math.max(0, Math.min(100, ((t.at - min) / span) * 100));
      return `<span class="gauge-tick" style="left:${x.toFixed(2)}%"><i></i><b>${t.label}</b></span>`;
    })
    .join("");
  // 막대는 SVG 로 그린다 — 눈금·채움·값 위치가 같은 좌표계를 쓴다(가로로 늘어나는 컨테이너에 맞춰 스케일)
  const W = 1000;
  const fillW = Math.max(14, (pct / 100) * W);
  return `<div class="gauge" role="img" aria-label="${label ?? ""}">
    <div class="gauge-bar">
      <svg class="gauge-svg" viewBox="0 0 ${W} 14" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <rect class="gauge-track" x="0" y="0" width="${W}" height="14" rx="7"/>
        <rect class="gauge-fill" x="0" y="0" width="${fillW.toFixed(1)}" height="14" rx="7"/>
      </svg>
      <span class="gauge-marker" style="left:${pct.toFixed(2)}%"></span>
    </div>
    ${tickHTML ? `<div class="gauge-ticks">${tickHTML}</div>` : ""}
  </div>`;
}

/** 0~10 평점 막대. 숫자는 항상 함께 적어 색만으로 판단하지 않게 한다. */
export function ratingBar(score: number, count?: number | null): string {
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  const fill = score >= 8 ? "is-good" : score >= 6.5 ? "is-mid" : "is-low";
  return `<div class="rating">
    <span class="rating-num">${score.toFixed(1)}</span>
    <span class="rating-scale">/10</span>
    <div class="rating-track" role="img" aria-label="라운더 평가 10점 만점에 ${score.toFixed(1)}점">
      <span class="rating-fill ${fill}" style="width:${pct.toFixed(1)}%"></span>
    </div>
    ${count ? `<span class="rating-count">${count.toLocaleString("ko-KR")}건</span>` : ""}
  </div>`;
}

/** 영역별 충실도 막대 — 데이터 소개 페이지·관리자 모드가 쓴다. */
export function coverageBar(label: string, value: number, detail = ""): string {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return `<div class="cov-row">
    <span class="cov-label">${label}</span>
    <span class="cov-track"><span class="cov-fill" style="width:${pct}%"></span></span>
    <span class="cov-value">${pct}%</span>
    ${detail ? `<span class="cov-detail">${detail}</span>` : ""}
  </div>`;
}
