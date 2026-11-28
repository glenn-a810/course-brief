/**
 * M4 — 즐겨찾기 · 최근 본 구장 (localStorage 전용, 로그인·서버 없음)
 *
 * - 저장이 막힌 브라우저(시크릿 모드·저장소 차단)에서는 이번 방문 동안만 메모리에 담는다.
 * - 개인정보를 서버로 보내지 않는다. 초기화·내보내기는 사용자가 직접 한다.
 */
const FAV_KEY = "coursebrief-favorites";
const RECENT_KEY = "coursebrief-recent";
const RECENT_LIMIT = 20;

let memoryFav: string[] = [];
let memoryRecent: string[] = [];

function read(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

function write(key: string, ids: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // 저장 실패는 기능을 막지 않는다(메모리 폴백)
  }
}

let favorites: string[] = read(FAV_KEY);
let recent: string[] = read(RECENT_KEY);

export function favoriteIds(): string[] {
  return [...favorites];
}

export function isFavorite(id: string): boolean {
  return favorites.includes(id);
}

export function toggleFavorite(id: string): boolean {
  if (!id) return false;
  const on = favorites.includes(id);
  favorites = on ? favorites.filter((x) => x !== id) : [id, ...favorites];
  memoryFav = favorites;
  write(FAV_KEY, favorites);
  return !on;
}

export function clearFavorites(): void {
  favorites = [];
  memoryFav = [];
  write(FAV_KEY, favorites);
}

export function recentIds(): string[] {
  return [...recent];
}

export function pushRecent(id: string): void {
  if (!id) return;
  recent = [id, ...recent.filter((x) => x !== id)].slice(0, RECENT_LIMIT);
  memoryRecent = recent;
  write(RECENT_KEY, recent);
}

export function clearRecent(): void {
  recent = [];
  memoryRecent = [];
  write(RECENT_KEY, recent);
}

/** 폴백 메모리 값(저장소를 못 쓴 경우에도 이번 방문 동안은 보이게) */
export function memoryFallback(): { favorites: string[]; recent: string[] } {
  return { favorites: [...memoryFav], recent: [...memoryRecent] };
}

export function clearAll(): void {
  clearFavorites();
  clearRecent();
}

/** 화면의 ★ 버튼 상태를 현재 저장값에 맞춘다 */
export function syncFavToggles(root: ParentNode = document): void {
  for (const btn of root.querySelectorAll<HTMLButtonElement>("[data-fav]")) {
    const id = btn.dataset.fav ?? "";
    const on = isFavorite(id);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("is-on", on);
    const label = on ? "내 구장에서 빼기" : "내 구장에 저장";
    btn.setAttribute("aria-label", `${btn.dataset.favName ?? "구장"} ${label}`);
    btn.title = label;
    const text = btn.querySelector<HTMLElement>(".fav-toggle-text");
    if (text) text.textContent = on ? "저장됨" : "저장";
  }
}

/** 저장 목록 JSON 내보내기/가져오기(기기 이전) */
export function exportSaved(): string {
  return JSON.stringify({ version: 1, favorites, recent }, null, 2);
}

export function importSaved(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as { favorites?: unknown; recent?: unknown };
    const pick = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
    const fav = pick(parsed.favorites);
    const rec = pick(parsed.recent).slice(0, RECENT_LIMIT);
    if (!fav.length && !rec.length) return false;
    favorites = fav;
    recent = rec;
    write(FAV_KEY, favorites);
    write(RECENT_KEY, recent);
    return true;
  } catch {
    return false;
  }
}
