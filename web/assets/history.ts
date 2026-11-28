/**
 * L2. 그린피 시즌 추이
 *
 * 데이터는 `data/v29/price_history.json` — 빌드가 아니라 **스냅샷 스크립트**
 * (`scripts/record_price_snapshot.py`)가 하루 한 번 쌓는다. 규칙:
 *  - 값이 바뀐 날만 한 줄 남긴다(같은 값이 이어지는 기간은 직전 기록값이 유지된 것으로 본다).
 *    그래서 파일이 날마다 540줄씩 불어나지 않고, 그래프는 '기록된 시점의 값'을 정확히 잇는다.
 *  - 기록이 1개뿐이면 그리지 않는다. 점을 이어 곡선을 만들면 그건 데이터가 아니라 그림이다.
 *    대신 "첫 스냅샷 · 일일 업데이트로 추이 누적 예정"을 그대로 적는다.
 *  - 금액은 데이터의 값 그대로(1인 18홀 비회원). 없는 값은 선에서 끊는다.
 */
import { icon } from "./icons.js";
import { manwonLabel, t } from "./i18n.js";
import { esc, fmtDate } from "./util.js";
import { won } from "./text.js";

export interface PricePoint {
  date: string;
  weekday: number | null;
  weekend: number | null;
  cart: number | null;
  caddie: number | null;
  basis: string | null;
}

interface HistoryFile {
  dataset?: { created_at?: string; updated_at?: string; counts?: { courses?: number; records?: number } };
  courses?: Record<string, PricePoint[]>;
}

let pending: Promise<HistoryFile | null> | null = null;
let cache: HistoryFile | null = null;

/** 한 번만 받아 두고 상세 화면들이 같이 쓴다(빌드마다 내용이 바뀌므로 no-cache) */
export function loadPriceHistory(dataBase: string): Promise<HistoryFile | null> {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = (async () => {
    try {
      const res = await fetch(`${dataBase}price_history.json`, { cache: "no-cache" });
      if (!res.ok) return null;
      cache = (await res.json()) as HistoryFile;
      return cache;
    } catch {
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

interface Series {
  key: "weekday" | "weekend";
  label: string;
  points: Array<{ x: number; y: number; value: number }>;
}

function seriesOf(points: PricePoint[]): Series[] {
  const out: Series[] = [];
  for (const key of ["weekend", "weekday"] as const) {
    const marks = points
      .map((p, i) => ({ x: i, value: p[key] }))
      .filter((m): m is { x: number; value: number } => typeof m.value === "number");
    if (!marks.length) continue;
    out.push({
      key,
      label: key === "weekend" ? t("common.weekend") : t("common.weekday"),
      points: marks.map((m) => ({ x: m.x, y: m.value, value: m.value })),
    });
  }
  return out;
}

/** 값 범위를 0부터 시작하지 않는다 — 그린피 차이는 몇 %라 0 기준이면 선이 평평해진다 */
function chartSVG(points: PricePoint[], series: Series[]): string {
  const W = 640;
  const H = 200;
  const padL = 62;
  const padR = 12;
  const padT = 16;
  const padB = 26;
  const allValues = series.flatMap((s) => s.points.map((p) => p.value));
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = Math.max(1, max - min);
  const lo = min - span * 0.18;
  const hi = max + span * 0.18;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = Math.max(1, points.length - 1);
  const x = (i: number): number => padL + (innerW * i) / n;
  const y = (v: number): number => padT + innerH * (1 - (v - lo) / (hi - lo));

  const paths = series.map((s) => {
    if (s.points.length === 1) {
      const p = s.points[0];
      return `<circle class="hist-dot hist-${s.key}" cx="${x(p.x).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4"/>`;
    }
    const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.x).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    return `<path class="hist-line hist-${s.key}" d="${d}"/>` +
      s.points.map((p) => `<circle class="hist-dot hist-${s.key}" cx="${x(p.x).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3"/>`).join("");
  }).join("");

  // 축 값 — 세 줄(위·중간·아래)로 눈금을 둔다. 금액은 만원 단위로 줄여 좁은 축에 넣는다
  const grid = [hi, (hi + lo) / 2, lo].map((v) => {
    const yy = y(v).toFixed(1);
    return `<line class="hist-grid" x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}"/>` +
      `<text class="hist-label hist-label-y" x="${padL - 8}" y="${yy}" text-anchor="end" dominant-baseline="middle">${esc(manwonLabel(v))}</text>`;
  }).join("");

  const first = points[0]?.date ?? "";
  const last = points[points.length - 1]?.date ?? "";
  const ticks = esc(fmtDate(first)) + (last && last !== first ? `<tspan> — ${esc(fmtDate(last))}</tspan>` : "");
  return `<svg class="hist-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("history.title"))} ${esc(
    series.map((s) => `${s.label} ${won(s.points[s.points.length - 1]?.value ?? 0)}`).join(", "),
  )}">
    ${grid}
    <line class="hist-axis" x1="${padL}" y1="${padT + innerH}" x2="${W - padR}" y2="${padT + innerH}"/>
    ${paths}
    <text class="hist-label" x="${padL}" y="${H - 6}">${ticks}</text>
  </svg>`;
}

function changeBadge(series: Series[]): string {
  const s = series[0];
  if (!s || s.points.length < 2) return "";
  const first = s.points[0].value;
  const last = s.points[s.points.length - 1].value;
  if (!first) return "";
  const pct = Math.round(((last - first) / first) * 1000) / 10;
  const sign = pct > 0 ? "+" : "";
  const tone = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  return `<span class="hist-change is-${tone}">${esc(t("history.change", { label: s.label, pct: `${sign}${pct}%` }))}</span>`;
}

export function historyBlockHTML(points: PricePoint[] | null): string {
  const head = `<div class="hist-head"><h3 class="card-title">${icon("chart")}${esc(t("history.title"))}</h3>`;
  if (!points || !points.length) {
    return `<div class="hist">${head}</div><p class="hist-note">${esc(t("history.none"))}</p></div>`;
  }
  const series = seriesOf(points);
  const first = points[0].date;
  if (points.length < 2) {
    // 1개 시점 — 그래프를 그리지 않고 사실만 적는다
    return `<div class="hist">
      ${head}<span class="hist-meta">${esc(t("history.first", { date: fmtDate(first) }))}</span></div>
      <p class="hist-note">${esc(t("history.note"))}</p>
    </div>`;
  }
  const last = points[points.length - 1].date;
  return `<div class="hist">
    ${head}${changeBadge(series)}
      <span class="hist-meta">${esc(t("history.points", { n: points.length, from: fmtDate(first), to: fmtDate(last) }))}</span>
    </div>
    ${chartSVG(points, series)}
    <p class="hist-legend">${series.map((s) => `<span class="hist-key hist-${s.key}">${esc(s.label)}</span>`).join("")}
      <span class="hist-latest">${series.map((s) => `${esc(s.label)} ${won(s.points[s.points.length - 1]?.value ?? 0)}`).join(" · ")}</span></p>
    <p class="hist-note">${esc(t("history.note"))}</p>
  </div>`;
}

/** 상세 화면 안의 자리에 비동기로 채운다(요금 카드 계산을 막지 않는다) */
export function mountHistory(container: HTMLElement | null, dataBase: string, id: string): void {
  if (!container) return;
  container.innerHTML = `<div class="hist"><span class="hist-skel" aria-hidden="true"></span><p class="sr-only" role="status">${esc(t("detail.loading"))}</p></div>`;
  void loadPriceHistory(dataBase).then((file) => {
    const points = file?.courses?.[id] ?? [];
    // 파일이 아예 없으면(스냅샷 전 배포) 자리를 비운다 — 없는 데이터를 안내 문구로 채우지 않는다
    if (!file) {
      container.innerHTML = "";
      return;
    }
    container.innerHTML = historyBlockHTML(points);
  });
}
