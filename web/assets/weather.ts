/**
 * M1 — 라운드 날짜 날씨.
 *
 * Open-Meteo(무료·API 키 없음, CORS 허용)의 일 단위 예보를 쓴다.
 *  - 좌표는 데이터의 WGS84 값(539곳)을 그대로 넘긴다.
 *  - 실패하면 조용히 null 을 돌려주고 화면은 날씨 카드 자체를 그리지 않는다(추측 금지).
 *  - 한 세션 1시간 캐시 — 외부 호출을 반복하지 않는다.
 *  - 예보는 "참고"다. 라운드 적합도는 사람이 판단할 수 있게 이유를 함께 적는다.
 */
import { t } from "./i18n.js";

export interface DailyWeather {
  date: string;
  tMax: number | null;
  tMin: number | null;
  pop: number | null;
  precip: number | null;
  wind: number | null;
  gust: number | null;
  sunrise: string | null;
  sunset: string | null;
}

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; days: DailyWeather[] }>();

interface ApiResponse {
  daily?: {
    time?: string[];
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    precipitation_probability_max?: Array<number | null>;
    precipitation_sum?: Array<number | null>;
    wind_speed_10m_max?: Array<number | null>;
    wind_gusts_10m_max?: Array<number | null>;
    sunrise?: string[];
    sunset?: string[];
  };
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function loadWeather(lat: number | null | undefined, lng: number | null | undefined): Promise<DailyWeather[] | null> {
  if (lat == null || lng == null) return null;
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.days;

  const url = `${ENDPOINT}?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset" +
    "&timezone=Asia%2FSeoul&forecast_days=16&wind_speed_unit=kmh";
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as ApiResponse;
    const d = data.daily;
    if (!d?.time?.length) return null;
    const days: DailyWeather[] = d.time.map((date, i) => ({
      date,
      tMax: num(d.temperature_2m_max?.[i]),
      tMin: num(d.temperature_2m_min?.[i]),
      pop: num(d.precipitation_probability_max?.[i]),
      precip: num(d.precipitation_sum?.[i]),
      wind: num(d.wind_speed_10m_max?.[i]),
      gust: num(d.wind_gusts_10m_max?.[i]),
      sunrise: d.sunrise?.[i] ?? null,
      sunset: d.sunset?.[i] ?? null,
    }));
    cache.set(key, { at: Date.now(), days });
    return days;
  } catch {
    return null;
  }
}

export function weatherFor(days: DailyWeather[] | null, iso: string): DailyWeather | null {
  return days?.find((d) => d.date === iso) ?? null;
}

export type Suit = "good" | "caution" | "hard";

export interface SuitResult {
  level: Suit;
  label: string;
  reasons: string[];
}

/** 라운드 적합도 — 비·강풍·한파·폭염만 본다. 애매하면 '주의'로 둔다. */
export function suitability(w: DailyWeather | null): SuitResult | null {
  if (!w) return null;
  const reasons: string[] = [];
  let level: Suit = "good";
  const raise = (l: Suit): void => {
    const rank = { good: 0, caution: 1, hard: 2 } as const;
    if (rank[l] > rank[level]) level = l;
  };
  if (w.pop != null) {
    if (w.pop >= 70) {
      raise("hard");
      reasons.push(t("wx.popLine", { n: w.pop }));
    } else if (w.pop >= 40) {
      raise("caution");
      reasons.push(t("wx.popLine", { n: w.pop }));
    }
  }
  if (w.precip != null && w.precip >= 3) {
    raise(w.precip >= 10 ? "hard" : "caution");
    reasons.push(t("wx.precipLine", { n: w.precip }));
  }
  if (w.wind != null) {
    if (w.wind >= 40) {
      raise("hard");
      reasons.push(t("wx.windStrong", { kmh: Math.round(w.wind), ms: (w.wind / 3.6).toFixed(1) }));
    } else if (w.wind >= 29) {
      raise("caution");
      reasons.push(t("wx.windLine", { n: Math.round(w.wind) }));
    }
  }
  if (w.gust != null && w.gust >= 60) {
    raise("hard");
    reasons.push(t("wx.gustLine", { n: Math.round(w.gust) }));
  }
  if (w.tMax != null && w.tMax >= 33) {
    raise(w.tMax >= 35 ? "hard" : "caution");
    reasons.push(t("wx.tmaxLine", { n: Math.round(w.tMax) }));
  }
  if (w.tMin != null && w.tMin <= -10) {
    raise("hard");
    reasons.push(t("wx.coldLine", { n: Math.round(w.tMin) }));
  } else if (w.tMin != null && w.tMin <= -3) {
    raise("caution");
    reasons.push(t("wx.tminLine", { n: Math.round(w.tMin) }));
  }
  if (!reasons.length) {
    const bits: string[] = [];
    if (w.tMax != null) bits.push(t("wx.tmaxLine", { n: Math.round(w.tMax) }));
    if (w.pop != null) bits.push(t("wx.popShort", { n: w.pop }));
    if (w.wind != null) bits.push(t("wx.windShort", { n: Math.round(w.wind) }));
    reasons.push(bits.length ? bits.join(" · ") : t("wx.valuesOk"));
  }
  const label = level === "good" ? t("wx.good") : level === "caution" ? t("wx.caution") : t("wx.hard");
  return { level, label, reasons };
}

export function weatherLabel(w: DailyWeather | null): string {
  if (!w) return "예보 없음";
  const bits: string[] = [];
  if (w.tMax != null && w.tMin != null) bits.push(`${Math.round(w.tMin)}~${Math.round(w.tMax)}℃`);
  if (w.pop != null) bits.push(t("wx.popShort", { n: w.pop }));
  return bits.join(" · ");
}
