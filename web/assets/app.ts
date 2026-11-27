import type {
  AlertPeriod,
  BriefingAlert,
  CancelInfo,
  ClusterFile,
  ClusterInfo,
  CourseDetail,
  CourseFacilities,
  CourseFee,
  CourseIndex,
  CourseIndexItem,
  CourseOps,
  CourseSpec,
  CourseStatus,
  CoverageArea,
  DatasetCounts,
  ExtraCourse,
  FacilityKey,
  FeeTableRow,
  NearbyDeliveryProvider,
  OpsKey,
  RentalProvider,
  RentalProvidersFile,
  RentalRegion,
  SearchAdapter,
  SearchConfig,
  SidoFile,
  SidoInfo,
  SiteConfig,
} from "../../shared/types";
import { initAdmin, isAdmin } from "./admin.js";
import { createSearchAdapter } from "./search.js";
import { initTheme } from "./theme.js";
import { coverageBar, gauge, icon, ratingBar } from "./icons.js";
import type { IconName } from "./icons.js";
import {
  STATUS,
  badge,
  debounce,
  esc,
  fmtDate,
  fmtNum,
  isCourseStatus,
  isMissing,
  statusOf,
  textOf,
} from "./util.js";

declare global {
  interface Window {
    /** index.html 앞에서 주입할 수 있는 런타임 설정 */
    COURSEBRIEF_CONFIG?: SiteConfig;
  }
}

interface ResolvedConfig {
  dataBase: string;
  pageSize: number;
  repoUrl: string;
  search?: SearchConfig;
}

const DEFAULT_REPO_URL = "https://github.com/glenn-a810/course-brief";

const CONFIG: ResolvedConfig = {
  dataBase: window.COURSEBRIEF_CONFIG?.dataBase ?? "data/v29/",
  pageSize: window.COURSEBRIEF_CONFIG?.pageSize ?? 48,
  repoUrl: window.COURSEBRIEF_CONFIG?.repoUrl ?? DEFAULT_REPO_URL,
  search: window.COURSEBRIEF_CONFIG?.search,
};
const REPO_URL = CONFIG.repoUrl;

/* ---------------- 라벨·아이콘 ---------------- */

const OPS: Record<OpsKey, string> = {
  nocaddie: "노캐디", two_player: "2인 플레이", three_player: "3인 플레이",
  five_player: "5인 플레이", marshal_caddie: "마샬 캐디", cart_type: "카트 종류",
  cart_entry: "카트 페어웨이 진입", bagdrop: "셀프 백드롭", mat: "매트 티샷",
  checkin: "체크인", locker: "락카", sauna: "사우나", dress: "복장 규정", pace: "진행 속도",
};
const OPS_ICON: Record<OpsKey, IconName> = {
  nocaddie: "person", two_player: "users", three_player: "users", five_player: "users",
  marshal_caddie: "flag", cart_type: "cart", cart_entry: "cart", bagdrop: "flag",
  mat: "grass", checkin: "clock", locker: "locker", sauna: "steam", dress: "shirt", pace: "clock",
};
const FAC: Record<FacilityKey, string> = {
  practice: "연습장", indoor_range: "실내 연습장", food: "식당·조식",
  snack_bar: "그늘집·스낵", locker_sauna: "락카·사우나", lodging: "숙박",
  other: "기타 시설", night: "야간 라운드", closed_days: "휴장일", shuttle: "셔틀·교통",
  ev_charge: "전기차 충전", proshop: "프로샵",
};
const FAC_ICON: Record<FacilityKey, IconName> = {
  practice: "flag", indoor_range: "building", food: "ball", snack_bar: "ball",
  locker_sauna: "steam", lodging: "bed", other: "sparkle", night: "moon",
  closed_days: "calendar", shuttle: "bus", ev_charge: "bolt", proshop: "building",
};
const GRASS: Record<"tee" | "fairway" | "green", string> = { tee: "티잉구역", fairway: "페어웨이", green: "그린" };
const LEVEL: Record<string, "info" | "warn" | "danger"> = { info: "info", caution: "warn", closure: "danger" };

/** 인덱스 태그 코드 → 카드 배지 (build_data_split.py 의 summary_fields 와 짝) */
const TAG_LABEL: Record<string, string> = {
  n: "노캐디", "2": "2인 가능", y: "야간", s: "사우나", l: "숙박", h: "셔틀", p: "연습장", f: "식당",
};
const TAG_ORDER = ["n", "2", "y", "s", "l", "h", "p", "f"];

/** 데이터 원문이 값 대신 남긴 '미확인' 표기 — 일반 화면에서는 확인된 값이 아니다 */
const UNKNOWN_TEXT = /미확인|확인\s*안\s*됨|확인하지\s*못한/;

const COVERAGE_LABELS: Array<[CoverageArea, string, string]> = [
  ["basic", "기본·입지", "소재·규모·개장·운영사·최단 IC"],
  ["course", "코스 스펙", "홀·파·전장·잔디·KGA 레이팅"],
  ["fee", "요금·예약", "그린피·카트·캐디·취소 규정"],
  ["ops", "현장 운영", "노캐디·인원·카트·체크인·복장"],
  ["facility", "부대시설", "연습장·식음·락카·숙박·셔틀"],
  ["briefing", "브리핑·공지", "휴장·공사·요금 변경 공지, 평가"],
  ["rental", "클럽 렌탈", "자체 대여·권역 배송 업체"],
];

const SORT_KEYS = ["name", "fee-asc", "fee-desc", "holes-desc"] as const;
type SortKey = (typeof SORT_KEYS)[number];

function isSortKey(v: string | null | undefined): v is SortKey {
  return typeof v === "string" && (SORT_KEYS as readonly string[]).includes(v);
}

/* ---------------- 상태 ---------------- */

interface Filters {
  sido: string;
  type: string;
  holes: string;
  fee: string;
  sort: SortKey;
  status: Set<CourseStatus>;
}

/** 그린피 요약값과 그 값이 어느 요일 기준인지 함께 들고 다닌다(주말가가 없으면 주중가로 대체) */
type FeeKind = "weekday" | "weekend";

interface CourseGroup {
  key: string;
  name: string;
  cluster: ClusterInfo | null;
  members: CourseIndexItem[];
  holes: number;
  fee: number | null;
  feeKind: FeeKind | null;
  sido: string;
  sigungu: string;
  statuses: CourseStatus[];
}

interface AppState {
  index: CourseIndex | null;
  clusters: Map<string, ClusterInfo>;
  sido: SidoInfo[];
  rental: RentalProvidersFile | null;
  adapter: SearchAdapter | null;
  q: string;
  filters: Filters;
  shown: number;
  groups: CourseGroup[];
  /** 목록을 떠날 때의 스크롤 위치 — 상세에서 돌아오면 그 자리로 */
  pendingScroll: number | null;
  /** 마지막 목록 해시(검색·필터 포함) — 상세의 '목록' 링크가 그 조건으로 돌아간다 */
  lastListHash: string;
}

function defaultFilters(): Filters {
  return { sido: "", type: "", holes: "", fee: "", sort: "name", status: new Set<CourseStatus>(["operating"]) };
}

const state: AppState = {
  index: null,
  clusters: new Map<string, ClusterInfo>(),
  sido: [],
  rental: null,
  adapter: null,
  q: "",
  filters: defaultFilters(),
  shown: CONFIG.pageSize,
  groups: [],
  pendingScroll: null,
  lastListHash: "#/",
};

/** 마크업은 index.html 에 고정돼 있으므로, 없으면 조용히 넘어가지 않고 즉시 알린다. */
function $<T extends Element = HTMLElement>(sel: string): T {
  const node = document.querySelector<T>(sel);
  if (!node) throw new Error(`요소를 찾을 수 없습니다: ${sel}`);
  return node;
}

function getIndex(): CourseIndex {
  const index = state.index;
  if (!index) throw new Error("데이터가 아직 로드되지 않았습니다");
  return index;
}

function getAdapter(): SearchAdapter {
  const adapter = state.adapter;
  if (!adapter) throw new Error("검색 어댑터가 아직 준비되지 않았습니다");
  return adapter;
}

function won(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

/* ---------------- 데이터 ---------------- */

/**
 * JSON 경계. 원격 데이터는 스키마(`data/v29/schema.md`)를 따르며,
 * 여기서는 T 로 좁혀서 넘긴다(필드 단위 검증은 data:check 담당).
 */
async function loadJSON<T>(name: string, version?: string): Promise<T> {
  // 구장 상세 JSON 은 CDN·브라우저에 하루 캐시된다. 데이터가 갱신되면 URL 의 v 가 바뀌어
  // 이전 방문자가 옛 상세를 보지 않게 한다(값 자체는 정적 파일이라 no-cache 로 매번 확인).
  const q = version ? `${name.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}` : "";
  const res = await fetch(`${CONFIG.dataBase}${name}${q}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  return (await res.json()) as T;
}

async function boot(): Promise<void> {
  const skeletons = $<HTMLElement>("#results").innerHTML;
  try {
    const [index, clusters, sido, rental] = await Promise.all([
      loadJSON<CourseIndex>("index.json"),
      loadJSON<ClusterFile>("clusters.json").catch((): ClusterFile => ({ clusters: [] })),
      loadJSON<SidoFile>("sido.json").catch((): SidoFile => ({ sido: [] })),
      loadJSON<RentalProvidersFile>("rental_providers.json").catch((): null => null),
    ]);
    state.index = index;
    state.rental = rental;
    for (const c of index.clusters ?? clusters.clusters ?? []) state.clusters.set(c.id, c);
    state.sido = sido.sido ?? index.sido ?? [];
    state.adapter = await createSearchAdapter(CONFIG, { courses: index.courses });
    buildStaticUI();
    await route();
    window.addEventListener("hashchange", () => {
      state.shown = CONFIG.pageSize;
      void route();
    });
  } catch (err) {
    console.error(err);
    showBootError(err, skeletons);
  }
}

/** 데이터 로딩 실패 — 개발자용 안내가 아니라 사용자가 할 수 있는 일과 재시도 버튼을 준다 */
function showBootError(err: unknown, skeleton: string): void {
  const message = err instanceof Error ? err.message : String(err);
  $<HTMLElement>("#results").setAttribute("aria-busy", "false");
  $<HTMLElement>("#results").innerHTML = `<div class="state-box" role="alert">
    <span class="state-icon">${icon("alert")}</span>
    <h2 class="state-title">골프장 목록을 불러오지 못했습니다</h2>
    <p class="state-desc">잠시 후 다시 시도해 주세요. 계속되면 네트워크 연결을 확인해 주세요.</p>
    <p class="state-meta">${esc(message)}</p>
    <button class="btn" type="button" id="boot-retry">다시 시도</button>
  </div>`;
  $<HTMLButtonElement>("#boot-retry").addEventListener("click", () => {
    $<HTMLElement>("#results").innerHTML = skeleton;
    $<HTMLElement>("#results").setAttribute("aria-busy", "true");
    void boot();
  });
}

function paintFooterMeta(): void {
  const d = getIndex().dataset;
  const counts = `${d.counts.total}곳 (상세 ${d.counts.with_detail} / 요약 ${d.counts.master_only})`;
  $<HTMLElement>("#footer-meta").textContent = isAdmin()
    ? `${d.version} · ${fmtDate(d.built_at)} 기준 · ${counts}`
    : `업데이트 ${fmtDate(d.built_at)} · ${counts}`;
}

function updatedAt(...values: Array<string | null | undefined>): string {
  const value = values.find((v): v is string => typeof v === "string" && v.length >= 10);
  return value ? fmtDate(value) : "";
}

function courseUpdatedAt(detail: CourseDetail | null): string {
  return updatedAt(detail?.meta?.normalized_at, detail?.meta?.generated_at, getIndex().dataset.built_at);
}

function statusCount(counts: DatasetCounts, status: CourseStatus): number {
  return counts[status] ?? 0;
}

function buildStaticUI(): void {
  const d = getIndex().dataset;
  $<HTMLElement>("#hero-count").textContent = String(d.counts.total);
  paintFooterMeta();

  const sel = $<HTMLSelectElement>("#f-sido");
  sel.innerHTML = '<option value="">전체</option>';
  for (const s of state.sido) {
    const o = document.createElement("option");
    o.value = s.code;
    o.textContent = `${sidoLabel(s)} (${s.count})`;
    sel.appendChild(o);
  }

  // 상태 칩은 데이터의 건수로 만든다 — 라벨과 숫자를 분리해 스크린리더가 "영업중 512곳"으로 읽게 한다
  const chips = $<HTMLElement>("#status-chips");
  chips.innerHTML = (Object.keys(STATUS) as CourseStatus[]).map((st) => {
    const meta = STATUS[st];
    const n = statusCount(d.counts, st);
    return `<button class="chip" type="button" data-status="${st}" aria-pressed="${state.filters.status.has(st)}"
      aria-label="${esc(meta.label)} ${n}곳"><span>${esc(meta.label)}</span><span class="chip-n">${n}</span></button>`;
  }).join("");
}

/* ---------------- 상태·URL ---------------- */

function sidoLabel(s: SidoInfo): string {
  if (s.code === "12") return "전남·광주";
  return s.short || s.name;
}

function readHashQuery(): URLSearchParams {
  const hash = location.hash.replace(/^#/, "").split("#")[0];
  const qi = hash.indexOf("?");
  if (qi < 0) return new URLSearchParams();
  return new URLSearchParams(hash.slice(qi + 1));
}

function hashQueryFromState(): string {
  const f = state.filters;
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  if (f.sido) p.set("sido", f.sido);
  if (f.type) p.set("type", f.type);
  if (f.holes) p.set("holes", f.holes);
  if (f.fee) p.set("fee", f.fee);
  if (f.sort !== "name") p.set("sort", f.sort);
  const st = [...f.status];
  if (st.length !== 1 || st[0] !== "operating") p.set("status", st.join(","));
  const qs = p.toString();
  return qs ? `#/?${qs}` : "#/";
}

function syncHash(): void {
  history.replaceState(null, "", hashQueryFromState());
}

function applyHashQuery(params: URLSearchParams): void {
  state.q = params.get("q") ?? "";
  const qInput = $<HTMLInputElement>("#q");
  if (qInput.value !== state.q) qInput.value = state.q;
  $<HTMLButtonElement>("#q-clear").hidden = !state.q;
  const f = state.filters;
  f.sido = params.get("sido") ?? "";
  f.type = params.get("type") ?? "";
  f.holes = params.get("holes") ?? "";
  f.fee = params.get("fee") ?? "";
  const sort = params.get("sort") ?? "name";
  f.sort = isSortKey(sort) ? sort : "name";
  const st = params.get("status");
  f.status = new Set<CourseStatus>(st ? st.split(",").filter((s) => isCourseStatus(s)) : ["operating"]);
  $<HTMLSelectElement>("#f-sido").value = f.sido;
  $<HTMLSelectElement>("#f-type").value = f.type;
  $<HTMLSelectElement>("#f-holes").value = f.holes;
  $<HTMLSelectElement>("#f-fee").value = f.fee;
  $<HTMLSelectElement>("#f-sort").value = f.sort;
  paintChips();
}

function paintChips(): void {
  for (const btn of $<HTMLElement>("#status-chips").querySelectorAll<HTMLButtonElement>(".chip")) {
    const status = btn.dataset.status;
    const on = isCourseStatus(status) && state.filters.status.has(status);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

/* ---------------- 목록 ---------------- */

function buildGroups(courses: CourseIndexItem[]): CourseGroup[] {
  const grouped = new Map<string, CourseIndexItem[]>();
  for (const c of courses) {
    const key = c.cluster && state.clusters.has(c.cluster) ? c.cluster : `id:${c.id}`;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(c);
    else grouped.set(key, [c]);
  }
  const groups: CourseGroup[] = [];
  for (const [key, members] of grouped) {
    const cluster = key.startsWith("id:") ? null : state.clusters.get(key) ?? null;
    const holes = members.reduce((a, m) => a + (m.holes ?? 0), 0);
    const cheapest = cheapestFee(members);
    groups.push({
      key,
      name: cluster?.name || members[0].name,
      cluster,
      members: [...members].sort((a, b) => (b.holes ?? 0) - (a.holes ?? 0)),
      holes,
      fee: cheapest?.value ?? null,
      feeKind: cheapest?.kind ?? null,
      sido: members[0].sido,
      sigungu: [...new Set(members.map((m) => m.sigungu).filter(Boolean))].join(", "),
      statuses: [...new Set(members.map((m) => m.status))],
    });
  }
  return groups;
}

/** 그룹 안에서 가장 싼 그린피와 그 요일 구분. 주말가가 없으면 주중가를 쓴다 */
function cheapestFee(members: CourseIndexItem[]): { value: number; kind: FeeKind } | null {
  let best: { value: number; kind: FeeKind } | null = null;
  for (const m of members) {
    const weekend = m.green_fee?.weekend;
    const weekday = m.green_fee?.weekday;
    const pick: { value: number; kind: FeeKind } | null = weekend != null
      ? { value: weekend, kind: "weekend" }
      : weekday != null ? { value: weekday, kind: "weekday" } : null;
    if (pick && (best === null || pick.value < best.value)) best = pick;
  }
  return best;
}

function passesFilters(c: CourseIndexItem, skipStatus = false): boolean {
  const f = state.filters;
  if (!skipStatus && f.status.size && !f.status.has(c.status)) return false;
  if (f.sido && c.sido_code !== f.sido) return false;
  if (f.type && c.type !== f.type) return false;
  if (f.holes) {
    const h = c.holes ?? 0;
    if (f.holes === "36" ? h < 36 : h !== Number(f.holes)) return false;
  }
  if (f.fee) {
    const v = c.green_fee?.weekend ?? c.green_fee?.weekday;
    if (v == null || v > Number(f.fee)) return false;
  }
  return true;
}

function sortGroups(groups: CourseGroup[]): CourseGroup[] {
  const s = state.filters.sort;
  const arr = [...groups];
  if (s === "fee-asc") arr.sort((a, b) => (a.fee ?? Infinity) - (b.fee ?? Infinity) || a.name.localeCompare(b.name, "ko"));
  else if (s === "fee-desc") arr.sort((a, b) => (b.fee ?? -1) - (a.fee ?? -1) || a.name.localeCompare(b.name, "ko"));
  else if (s === "holes-desc") arr.sort((a, b) => b.holes - a.holes || a.name.localeCompare(b.name, "ko"));
  else arr.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return arr;
}

/** 검색어와 일치한 부분을 강조한다(이스케이프 후 안전하게 삽입) */
function highlight(text: string, q: string): string {
  if (!q) return esc(text);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return esc(text);
  return `${esc(text.slice(0, idx))}<mark>${esc(text.slice(idx, idx + q.length))}</mark>${esc(text.slice(idx + q.length))}`;
}

async function renderList({ reset = false }: { reset?: boolean } = {}): Promise<void> {
  const index = getIndex();
  const courses = index.courses;
  const resultsEl = $<HTMLElement>("#results");
  resultsEl.setAttribute("aria-busy", "true");

  let allowed: Map<string, number> | null = null;
  if (state.q) {
    const res = await getAdapter().search({ text: state.q, limit: 0 });
    allowed = new Map((res ?? []).map((r) => [r.id, r.score]));
  }

  const matched = allowed;
  const filtered = courses.filter((c) => (matched ? matched.has(c.id) : true) && passesFilters(c));
  const groups = sortGroups(buildGroups(filtered));
  if (matched) {
    // 검색 점수 순서를 유지(그룹은 최고 점수 기준)
    groups.sort((a, b) => {
      const sa = Math.max(...a.members.map((m) => matched.get(m.id) ?? 0));
      const sb = Math.max(...b.members.map((m) => matched.get(m.id) ?? 0));
      return sb - sa;
    });
  }
  state.groups = groups;

  const total = courses.length;
  const n = groups.length;
  const courseCount = filtered.length;
  // 상태 필터로만 빠진 수 — "숨김"은 이 값이다
  const withoutStatus = courses.filter((c) => (matched ? matched.has(c.id) : true) && passesFilters(c, true));
  const hidden = withoutStatus.length - courseCount;
  const searchHits = matched ? matched.size : total;

  const stLabel = state.filters.status.size
    ? [...state.filters.status].map((s) => statusOf(s).label).join("·")
    : "전체";

  $<HTMLElement>("#result-count").innerHTML =
    `<strong>${n.toLocaleString("ko-KR")}곳</strong> 표시` +
    `<span class="sep">·</span>구장 ${courseCount.toLocaleString("ko-KR")}` +
    `<span class="sep">·</span>전체 ${total.toLocaleString("ko-KR")}곳` +
    (hidden > 0 ? `<button type="button" class="link-btn" id="show-hidden">숨김 ${hidden.toLocaleString("ko-KR")}곳 보기</button>` : "");

  // 검색 + 필터가 겹쳐 결과가 줄었을 때, 무엇 때문에 줄었는지 알려 준다
  const note = $<HTMLElement>("#filter-note");
  const excludedByFilter = matched ? searchHits - courseCount : 0;
  if (matched && excludedByFilter > 0) {
    note.hidden = false;
    note.innerHTML = `검색 결과 <b>${searchHits.toLocaleString("ko-KR")}곳</b> 중 ` +
      `<b>${(searchHits - courseCount).toLocaleString("ko-KR")}곳</b>이 다른 조건으로 제외되었습니다.` +
      `<button type="button" class="link-btn" id="keep-search-reset">검색은 두고 필터만 초기화</button>`;
  } else {
    note.hidden = true;
    note.textContent = "";
  }

  renderActiveFilters();
  const status = $<HTMLElement>("#result-status");
  status.textContent = `${stLabel} ${n.toLocaleString("ko-KR")}곳 표시 중` +
    (hidden > 0 ? `. 상태 필터로 ${hidden.toLocaleString("ko-KR")}곳이 숨겨져 있습니다.` : "") +
    (state.q ? ` 검색어 ${state.q}.` : "");

  if (reset) state.shown = CONFIG.pageSize;
  const slice = groups.slice(0, state.shown);
  resultsEl.innerHTML = slice.map(cardHTML).join("");
  resultsEl.setAttribute("aria-busy", "false");
  $<HTMLElement>("#empty").hidden = n > 0;
  if (n === 0) $<HTMLElement>("#empty-desc").textContent = emptyDescription();
  $<HTMLElement>("#empty-status").hidden = hidden <= 0;
  const more = $<HTMLButtonElement>("#more");
  more.hidden = n <= state.shown;
  more.innerHTML = `더 보기 <span class="more-count">${state.shown} / ${n}</span>`;

}

function emptyDescription(): string {
  const parts: string[] = [];
  if (state.q) parts.push(`검색어 ‘${state.q}’`);
  if (state.filters.sido) parts.push("지역");
  if (state.filters.type) parts.push("이용형태");
  if (state.filters.holes) parts.push("홀수");
  if (state.filters.fee) parts.push("그린피");
  if (!parts.length) return "다른 조건으로 다시 찾아보세요.";
  if (parts.length === 1 && state.q) {
    return `‘${state.q}’와 일치하는 골프장이 없습니다. 다른 이름·지역이나 초성(ㅇㅅ)으로 찾아보세요.`;
  }
  return `${parts.join("·")} 조건을 넓히면 결과가 나옵니다.`;
}

function renderActiveFilters(): void {
  const f = state.filters;
  const parts: string[] = [];
  const add = (label: string, key: string): void => {
    parts.push(`<button type="button" class="filter-chip" data-clear="${key}" aria-label="${esc(label)} 필터 해제">
      ${esc(label)}<span class="filter-chip-x" aria-hidden="true">✕</span></button>`);
  };
  if (state.q) add(`‘${state.q}’`, "q");
  if (f.sido) {
    const s = state.sido.find((x) => x.code === f.sido);
    add(s ? sidoLabel(s) : f.sido, "sido");
  }
  if (f.type) add(f.type, "type");
  if (f.holes) add(f.holes === "36" ? "36홀 이상" : `${f.holes}홀`, "holes");
  if (f.fee) add(`주말 ${Number(f.fee) / 10000}만원 이하`, "fee");
  if (f.sort !== "name") {
    const label = { "fee-asc": "그린피 낮은순", "fee-desc": "그린피 높은순", "holes-desc": "홀수 많은순" }[f.sort];
    add(label, "sort");
  }
  if (f.status.size !== 1 || !f.status.has("operating")) add(`상태 ${f.status.size}종`, "status");
  const box = $<HTMLElement>("#active-filters");
  box.innerHTML = parts.join("");
  const count = $<HTMLElement>("#filter-count");
  const activeCount = parts.length;
  count.hidden = activeCount === 0;
  count.textContent = String(activeCount);
}

function cardHTML(g: CourseGroup): string {
  const single = g.members.length === 1 ? g.members[0] : null;
  const s = g.statuses.length === 1 ? g.statuses[0] : "operating";
  const st = statusOf(s);
  const fee = g.fee;
  const feeLabel = g.feeKind === "weekday" ? "주중" : "주말";
  const stale = g.statuses.every((x) => x === "closed" || x === "suspended");
  const tags = (single?.tags ?? "").split("").filter((t) => TAG_LABEL[t]).slice(0, 3);
  const rating = single?.rating;

  // 값이 없으면 가격 영역을 비운다 — 자리표시자 대신 하단 '상세 보기'만 남긴다
  const feeBlock = fee == null
    ? ""
    : `<span class="card-fee${stale ? " is-stale" : ""}">
        <span class="fee-label">${stale ? "마지막 확인" : feeLabel}</span>
        <span class="fee-value">${won(fee)}</span><span class="fee-tilde">~</span>
      </span>`;

  const sub = single
    ? [single.sido, single.sigungu].filter(Boolean).join(" ")
    : g.members.map((m) => `${m.name}${m.holes ? ` ${m.holes}홀` : ""}`).join(" · ");

  // 확인된 값만 남긴다 — 값이 없는 줄은 자리표시자 없이 생략한다
  const type = single?.type && !UNKNOWN_TEXT.test(single.type) ? single.type : "";
  const stats = [
    g.holes ? `<span class="stat-pill"><b>${g.holes}</b>홀</span>` : "",
    type ? `<span class="stat-pill">${esc(type)}</span>` : "",
    rating !== undefined ? `<span class="stat-pill"><span class="pill-star" aria-hidden="true">★</span>${rating.toFixed(1)}</span>` : "",
  ].filter(Boolean).join("");

  const statsHTML = stats ? `<div class="card-stats">${stats}</div>` : "";
  const tagHTML = tags.length
    ? `<div class="card-tags">${tags.map((t) => `<span class="tag">${esc(TAG_LABEL[t])}</span>`).join("")}</div>`
    : "";

  const noticeBadge = single?.notice
    ? `<span class="notice-dot" title="최근 공지 ${fmtDate(single.notice)}"><span aria-hidden="true">●</span>공지</span>`
    : "";

  const head = `<div class="card-head">
      <div class="card-id">
        <h3 class="card-name">${highlight(single ? single.name : g.name, state.q)}</h3>
        <p class="card-sub">${esc(sub)}</p>
      </div>
      <span class="badge ${st.tone}">${esc(st.label)}</span>
    </div>
    ${statsHTML}
    ${tagHTML}
    <div class="card-foot">${feeBlock}<span class="card-foot-right"><span class="card-cta">상세 보기${icon("chevron")}</span>${noticeBadge}</span></div>`;

  if (single) {
    return `<a class="card" href="#/c/${esc(single.id)}" data-card="${esc(single.id)}">${head}</a>`;
  }
  return `<div class="card card-group">
      <div class="card-head">
        <div class="card-id">
          <h3 class="card-name">${highlight(g.name, state.q)}</h3>
          <p class="card-sub">같은 부지 ${g.members.length}개 코스</p>
        </div>
        <span class="badge ${st.tone}">${esc(st.label)}</span>
      </div>
      ${g.holes ? `<div class="card-stats"><span class="stat-pill"><b>${g.holes}</b>홀 합산</span></div>` : ""}
      <div class="card-members">${g.members.map((m) => {
        const ms = statusOf(m.status);
        return `<a class="member-link" href="#/c/${esc(m.id)}">${esc(m.name)}${m.holes ? ` · ${m.holes}홀` : ""}${
          m.status !== "operating" ? ` <span class="badge ${ms.tone}">${esc(ms.label)}</span>` : ""}</a>`;
      }).join("")}</div>
      <div class="card-foot">${feeBlock}<span class="card-foot-right"><span class="card-cta">코스 선택${icon("chevron")}</span></span></div>
    </div>`;
}

/* ---------------- 상세 ---------------- */

/** 현재 상세 DOM 에 그려진 구장 id. 같은 구장의 영역 앵커 이동은 다시 그리지 않는다 */
let renderedDetailId: string | null = null;
let sectionObserver: IntersectionObserver | null = null;

interface FeeSlot {
  value: number | null;
  source: "official" | "market" | null;
}

interface FeeView {
  weekday: FeeSlot;
  weekend: FeeSlot;
  cart: number | null;
  caddie: number | null;
  caddieNone: boolean;
}

/**
 * 요금 표시 규칙 한 곳 — 공식 요금표 → 관측 최저가 → 없음.
 * 상단 히어로와 요금 섹션이 같은 함수를 쓰므로 화면 안에서 값이 어긋날 수 없다(F-05).
 */
function feeView(fee: CourseFee | null | undefined, fallback: CourseIndexItem): FeeView {
  const market = fee?.market ?? null;
  const weekdayOfficial = fee?.weekday ?? null;
  const weekendOfficial = fee?.weekend ?? null;
  const weekday: FeeSlot = weekdayOfficial != null
    ? { value: weekdayOfficial, source: "official" }
    : market?.weekday_min != null ? { value: market.weekday_min, source: "market" } : { value: null, source: null };
  const weekend: FeeSlot = weekendOfficial != null
    ? { value: weekendOfficial, source: "official" }
    : market?.weekend_min != null ? { value: market.weekend_min, source: "market" } : { value: null, source: null };
  // 상세가 없거나 비어 있으면 인덱스 요약(같은 규칙으로 계산된 값)을 쓴다
  if (weekday.value == null && fallback.green_fee?.weekday != null) {
    weekday.value = fallback.green_fee.weekday;
    weekday.source = fallback.green_fee.basis === "official" ? "official" : "market";
  }
  if (weekend.value == null && fallback.green_fee?.weekend != null) {
    weekend.value = fallback.green_fee.weekend;
    weekend.source = fallback.green_fee.basis === "official" ? "official" : "market";
  }
  return {
    weekday,
    weekend,
    cart: fee?.cart?.value ?? fallback.cart ?? null,
    caddie: fee?.caddie?.value ?? fallback.caddie ?? null,
    caddieNone: fee?.caddie?.none === true,
  };
}

function sourceTag(source: FeeSlot["source"]): string {
  if (source === "official") return `<span class="src-tag src-official">공식 요금표</span>`;
  if (source === "market") return `<span class="src-tag src-market">관측 최저</span>`;
  return "";
}

async function renderDetail(id: string): Promise<void> {
  const index = getIndex();
  const course = index.courses.find((c) => c.id === id);
  const view = $<HTMLElement>("#view-detail");
  if (!course) {
    renderedDetailId = null;
    view.innerHTML = `<div class="page"><div class="state-box" role="alert">
      <span class="state-icon">${icon("alert")}</span>
      <h1 class="state-title">골프장을 찾을 수 없습니다</h1>
      <p class="state-desc">주소가 바뀌었거나 목록에서 빠진 골프장입니다.</p>
      <a class="btn" href="${esc(state.lastListHash)}">목록으로</a>
    </div></div>`;
    setTitle("찾을 수 없는 골프장 — CourseBrief");
    return;
  }

  view.innerHTML = detailSkeleton(course.name);
  let detail: CourseDetail | null = null;
  let detailError = false;
  if (course.detail) {
    try {
      detail = await loadJSON<CourseDetail>(`courses/${id}.json`, getIndex().dataset.built_at);
    } catch (e) {
      console.warn(e);
      detailError = true;
    }
  }
  const cluster = course.cluster ? state.clusters.get(course.cluster) ?? null : null;
  const others: Array<{ name: string; id?: string; holes?: number | null; item?: CourseIndexItem }> = cluster
    ? (cluster.members ?? []).filter((m) => m !== course.name).map((name) => {
        const mc = index.courses.find((c) => c.name === name);
        return mc ? { name, id: mc.id, holes: mc.holes, item: mc } : { name };
      })
    : [];

  const st = statusOf(course.status);
  // 데이터 원본의 '미확인'은 이용형태 값이 아니다 — 배지·지표에서 뺀다
  const typeLabel = course.type && !UNKNOWN_TEXT.test(course.type) ? course.type : "";
  const fees = feeView(detail?.fee, course);
  const feeLine = [fees.weekday.value, fees.weekend.value].filter((v): v is number => v != null);
  const feeCheapest = feeLine.length ? Math.min(...feeLine) : null;
  const feeKindLabel = fees.weekend.value != null && feeCheapest === fees.weekend.value ? "주말" : "주중";

  // 요금은 값이 있는 항목만 보인다 — 하나도 없으면 한 줄 안내로 끝낸다
  const feePairs = [
    fees.weekday.value != null ? { label: "주중", slot: fees.weekday } : null,
    fees.weekend.value != null ? { label: "주말·공휴일", slot: fees.weekend } : null,
  ].filter((x): x is { label: string; slot: FeeSlot } => x !== null);
  const feeExtras: string[] = [];
  if (fees.cart != null) feeExtras.push(`카트 ${won(fees.cart)}`);
  if (fees.caddieNone) feeExtras.push("노캐디");
  else if (fees.caddie != null) feeExtras.push(`캐디 ${won(fees.caddie)}`);
  const hasAnyFee = feeCheapest != null || feeExtras.length > 0;

  const hero = `
    <div class="detail-crumbs">
      <a class="back" href="${esc(state.lastListHash)}" data-back>${icon("arrow-left")} 목록</a>
      <span class="crumb-sep">·</span>
      <span class="crumb-loc">${esc([course.sido, course.sigungu].filter(Boolean).join(" "))}</span>
    </div>

    <section class="detail-hero" aria-labelledby="detail-title">
      <div class="detail-hero-main">
        <div class="detail-badges">
          ${badge(st.tone, st.label)}
          ${course.holes ? badge("neutral", `${course.holes}홀`) : ""}
          ${typeLabel ? badge("neutral", typeLabel) : ""}
          ${course.detail ? "" : badge("neutral", "요약 데이터")}
        </div>
        <h1 class="detail-title" id="detail-title" tabindex="-1">${esc(course.name)}</h1>
        ${course.aliases?.length ? `<p class="detail-alias">${esc(course.aliases.slice(0, 5).join(" · "))}</p>` : ""}
        <p class="detail-meta">
          ${icon("pin")}<span>${esc([course.sido, course.sigungu].filter(Boolean).join(" "))}</span>
          ${detail?.master?.nearest_ic?.name
            ? `<span class="dot" aria-hidden="true">·</span><span>${esc(detail.master.nearest_ic.name)}${detail.master.nearest_ic.distance_km ? ` ${detail.master.nearest_ic.distance_km}km` : ""}</span>`
            : ""}
          <span class="dot" aria-hidden="true">·</span><span class="muted">업데이트 ${esc(courseUpdatedAt(detail) || "—")}</span>
        </p>
        ${course.status !== "operating" ? `<div class="callout ${st.tone === "neutral" ? "info" : st.tone}">
          <strong>${esc(st.label)}</strong>${esc(course.status_note || "현재 예약·이용이 어려운 상태입니다.")}
        </div>` : ""}

        <dl class="hero-kpis">
          ${course.holes ? `<div class="kpi"><dt>홀수</dt><dd><b>${course.holes}</b><span>홀</span></dd></div>` : ""}
          ${course.par ? `<div class="kpi"><dt>파</dt><dd><b>${course.par}</b></dd></div>` : ""}
          ${course.length ? `<div class="kpi"><dt>전장</dt><dd><b>${fmtNum(course.length)}</b><span>m</span></dd></div>` : ""}
          ${typeLabel ? `<div class="kpi"><dt>이용형태</dt><dd class="kpi-text">${esc(typeLabel)}</dd></div>` : ""}
          ${course.rating !== undefined ? `<div class="kpi kpi-rating"><dt>라운더 평가</dt><dd>${ratingBar(course.rating, course.reviews)}</dd></div>` : ""}
        </dl>

        <div class="hero-actions">
          ${course.tel ? `<a class="btn btn-primary" href="tel:${esc(course.tel.replace(/[^\d+]/g, ""))}">${icon("phone")}전화 걸기</a>` : ""}
          ${course.homepage ? `<a class="btn btn-ghost" href="${esc(course.homepage)}" target="_blank" rel="noopener noreferrer">${icon("globe")}홈페이지</a>` : ""}
          ${course.lat != null && course.lng != null
            ? `<a class="btn btn-ghost" href="https://www.google.com/maps?q=${course.lat},${course.lng}" target="_blank" rel="noopener noreferrer">${icon("pin")}지도</a>`
            : ""}
        </div>
      </div>

      <aside class="fee-hero${hasAnyFee ? "" : " is-empty"}" aria-label="그린피 요약">
        <p class="fee-hero-title">그린피 <span>1인 · 18홀 · 비회원</span></p>
        ${hasAnyFee
          ? `${feeCheapest != null
              ? `<p class="fee-hero-value"><span class="fee-hero-from">${feeKindLabel} 최저</span>${won(feeCheapest)}</p>
            <div class="fee-hero-pair${feePairs.length === 1 ? " is-single" : ""}">
              ${feePairs.map(({ label, slot }) => `<div><span class="pair-label">${esc(label)}</span><span class="pair-value">${won(slot.value)}</span>${sourceTag(slot.source)}</div>`).join("")}
            </div>`
              : `<p class="fee-hero-none">요금 안내 준비 중</p>`}
            ${feeExtras.length ? `<p class="fee-hero-note">${esc(feeExtras.join(" · "))} <span class="muted">(팀 기준)</span></p>` : ""}
            <p class="fee-hero-asof">업데이트 ${esc(courseUpdatedAt(detail) || "—")}</p>`
          : `<p class="fee-hero-none">요금 안내 준비 중 · 전화 문의</p>`}
      </aside>
    </section>

    ${factsHTML(course, detail)}

    ${detailError ? `<div class="callout warn" role="alert">
      <strong>상세 데이터를 불러오지 못했습니다</strong>
      네트워크 문제일 수 있습니다. 아래는 기본 정보만 표시합니다.
      <button type="button" class="link-btn" id="detail-retry">다시 시도</button>
    </div>` : ""}

    ${!course.detail ? `<section class="section" aria-labelledby="s0">
      <h2 id="s0"><span class="sec-num">01</span>기본 정보</h2>
      <div class="section-body">
        <div class="callout">
          <strong>이 구장은 요약 데이터만 있습니다</strong>
          건설중·폐업 등으로 상세 수집 전이거나, 상세를 불러오지 못한 상태입니다. 위에 표시된 기본 정보가 확인된 값의 전부입니다.
        </div>
      </div>
    </section>` : ""}`;

  const built = detail && !detailError ? sections(detail, course, others) : null;
  const nav = built ? sectionNav(course, built.visible) : "";
  view.innerHTML = `<div class="detail">${hero}${nav}${built?.html ?? ""}</div>`;
  renderedDetailId = id;
  setTitle(`${course.name} — CourseBrief`);

  document.querySelector<HTMLButtonElement>("#detail-retry")?.addEventListener("click", () => {
    renderedDetailId = null;
    void renderDetail(id);
  });
  setupSectionSpy();
  const section = currentSectionAnchor();
  if (section) {
    requestAnimationFrame(() => scrollToSection(section));
  } else {
    window.scrollTo({ top: 0 });
  }
}

function detailSkeleton(name: string): string {
  return `<div class="detail">
    <div class="detail-crumbs"><a class="back" href="${esc(state.lastListHash)}" data-back>${icon("arrow-left")} 목록</a></div>
    <div class="detail-hero"><div class="detail-hero-main">
      <h1 class="detail-title">${esc(name)}</h1>
      <p class="detail-meta"><span class="muted">불러오는 중…</span></p>
      <div class="skel-line w70"></div><div class="skel-line w55"></div><div class="skel-line w40"></div>
    </div></div>
    <p class="sr-only" role="status">상세 정보를 불러오는 중입니다</p>
  </div>`;
}

function factsHTML(c: CourseIndexItem, d: CourseDetail | null): string {
  const m = d?.master;
  const rows: Array<[string, string]> = [];
  const address = m?.address;
  if (address) rows.push(["주소", esc(address)]);
  if (m?.opened) rows.push(["개장", esc(m.opened)]);
  if (m?.area_sqm) rows.push(["면적", `${fmtNum(m.area_sqm)}㎡ (${fmtNum(Math.round(m.area_sqm / 3.3058))}평)`]);
  if (m?.operators?.length) {
    const operators = m.operators.filter((o) => !UNKNOWN_TEXT.test(textOf(o)));
    if (operators.length) rows.push(["운영사", esc(operators.join(", "))]);
  }
  if (m?.designer) rows.push(["설계", esc(textOf(m.designer))]);
  if (m?.nearest_ic?.name) {
    rows.push(["최단 IC", `${esc(m.nearest_ic.name)}${m.nearest_ic.distance_km ? ` · ${m.nearest_ic.distance_km}km` : ""}`]);
  }
  if (c.tel) rows.push(["대표전화", `<a class="link" href="tel:${esc(c.tel.replace(/[^\d+]/g, ""))}">${esc(c.tel)}</a>`]);
  if (c.homepage) {
    rows.push(["홈페이지", `<a class="link" href="${esc(c.homepage)}" target="_blank" rel="noopener noreferrer">${esc(shortUrl(c.homepage))}</a>`]);
  }
  if (c.lat != null && c.lng != null) {
    rows.push(["좌표", `<a class="link" href="https://www.google.com/maps?q=${c.lat},${c.lng}" target="_blank" rel="noopener noreferrer">${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}</a>`]);
  }
  if (!rows.length) return "";
  return `<dl class="facts">${rows.map(([k, v]) => `<div class="fact"><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
}

function sectionNav(c: CourseIndexItem, visible: { s3: boolean; s4: boolean; s6: boolean }): string {
  // 숨긴 섹션은 pill 에도 넣지 않는다. 번호는 각 섹션 제목의 번호와 맞춘다.
  const items: Array<[string, string, string]> = [
    ["s1", "01", "요금·예약"], ["s2", "02", "코스 스펙"],
    ...(visible.s3 ? [["s3", "03", "현장 운영"]] as Array<[string, string, string]> : []),
    ...(visible.s4 ? [["s4", "04", "부대시설"]] as Array<[string, string, string]> : []),
    ["s5", "05", "공지·브리핑"],
    ...(visible.s6 ? [["s6", "06", "동일 부지"]] as Array<[string, string, string]> : []),
    ["s7", "07", "클럽 렌탈"], ["s8", "08", "데이터"],
  ];
  return `<nav class="section-nav" aria-label="상세 영역">
    <div class="section-nav-inner">
      ${items.map(([id, num, label]) => `<a href="#/c/${esc(c.id)}#${id}" data-sec="${id}"><span class="sec-i">${num}</span>${label}</a>`).join("")}
    </div>
    <span class="section-nav-fade" aria-hidden="true"></span>
  </nav>`;
}

function setupSectionSpy(): void {
  sectionObserver?.disconnect();
  sectionObserver = null;
  const nav = document.querySelector<HTMLElement>(".section-nav");
  if (!nav) return;
  const links = [...nav.querySelectorAll<HTMLAnchorElement>("a[data-sec]")];
  const sections = links.map((a) => document.getElementById(a.dataset.sec ?? "")).filter((el): el is HTMLElement => el !== null);
  if (!sections.length) return;
  const setCurrent = (id: string): void => {
    for (const a of links) {
      if (a.dataset.sec === id) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    }
  };
  sectionObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length) setCurrent(visible[0].target.id);
  }, { rootMargin: "-150px 0px -55% 0px", threshold: 0 });
  for (const s of sections) sectionObserver.observe(s);
  setCurrent(sections[0].id);
}

function currentSectionAnchor(): string {
  const raw = location.hash.replace(/^#/, "");
  const at = raw.indexOf("#");
  return at >= 0 ? raw.slice(at + 1) : "";
}

function scrollToSection(section: string): void {
  const target = document.getElementById(section);
  if (!target) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  const nav = document.querySelector<HTMLAnchorElement>(`.section-nav a[data-sec="${section}"]`);
  nav?.setAttribute("aria-current", "true");
}

function shortUrl(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

/**
 * 값 하나를 화면에 낼 수 있는지 판단한다.
 * - null·빈 값: 없음
 * - '미확인'이 섞인 원문: 일반 화면에서는 버리고, 관리자에게는 근거로 남긴다
 */
function valCell(v: unknown): string | null {
  if (isMissing(v)) return null;
  // 참·거짓은 그 자체가 확인된 값이다(예: 클럽 대여 가능 여부)
  if (typeof v === "boolean") return v ? "가능" : "불가";
  const t = textOf(v).trim();
  if (!t || t === "미확인") return null;
  if (!isAdmin() && UNKNOWN_TEXT.test(t)) return null;
  return isAdmin() ? t : publicNote(t);
}

/**
 * '미확인'이 섞인 문장에서 확인된 조각만 남긴다.
 * - 괄호 안이 미확인이면 괄호째 빼고("Mountain 코스 등(코스명 일부 미확인)" → "Mountain 코스 등")
 * - 긴 문장은 구분자( — · , → )로 나눠 미확인이 섞인 조각만 버린다
 */
function confirmedSegments(text: string): string {
  const withoutParen = text.replace(/\s*\(([^()]*)\)/g, (m: string, inner: string) => (UNKNOWN_TEXT.test(inner) ? "" : m));
  if (!UNKNOWN_TEXT.test(withoutParen)) return withoutParen.trim();
  return withoutParen
    .split(/\s*[—–→]\s*|\s*·\s*|,\s+/)
    .map((s) => s.trim())
    .filter((s) => s && !UNKNOWN_TEXT.test(s))
    .join(" · ");
}

/** 문장형 값(공지 요약·메모 등) — 일반 화면에서는 '미확인'이 섞인 문장을 통째로 버린다 */
function visibleText(text: string | null | undefined): string {
  if (!text || !text.trim()) return "";
  if (!isAdmin()) {
    const kept = UNKNOWN_TEXT.test(text) ? confirmedSegments(text) : text.trim();
    return kept ? publicNote(kept) : "";
  }
  return text;
}

const SOURCE_NAMES: Array<[RegExp, string]> = [
  [/그린피가이드/g, "공개 요금 정보"],
  [/티픽/gi, "공개 예약 채널"],
];

function publicNote(text: string): string {
  let out = text;
  for (const [re, to] of SOURCE_NAMES) out = out.replace(re, to);
  return out;
}

function evidenceDetails(evidence: unknown, label = "근거"): string {
  // 원문 근거 인용은 수집·검증 흔적이라 관리자 모드에서만 렌더링한다(DOM 에도 넣지 않는다)
  if (!isAdmin()) return "";
  const arr: unknown[] = Array.isArray(evidence) ? evidence.filter(Boolean).slice(0, 3) : [];
  if (!arr.length) return "";
  return `<details class="ev"><summary>${esc(label)} ${arr.length}건</summary><ul>${arr
    .map((e) => `<li>${esc(String(e).slice(0, 220))}</li>`).join("")}</ul></details>`;
}

function periodText(period: AlertPeriod | string | null | undefined): string {
  if (!period) return "";
  if (typeof period === "string") return period;
  const { from, to, reopen } = period;
  if (from && to) return `${from} ~ ${to}`;
  if (from && reopen) return `${from} ~ 재개 ${reopen}`;
  if (from) return `${from} ~`;
  if (to) return `~ ${to}`;
  if (reopen) return `재개 ${reopen}`;
  return "";
}

/* ---------------- 상세 영역 ---------------- */

function toneOf(value: string, invert = false): { tone: "ok" | "warn" | "danger" | "info"; label: string } {
  // 휴장일처럼 '없음'이 좋은 뜻인 항목은 뒤집어 읽는다
  if (invert && /없음|연중무휴|무휴/.test(value)) return { tone: "ok", label: "연중 운영" };
  if (/불가|불허|미운영|금지|없음/.test(value)) return { tone: "danger", label: "불가" };
  if (/조건|문의|별도|유료|일부|한정|추가|필요|주의/.test(value)) return { tone: "warn", label: "조건부" };
  if (/가능|운영|있음|허용|제공/.test(value)) return { tone: "ok", label: "가능" };
  return { tone: "info", label: "안내" };
}

function tile(iconName: IconName, label: string, value: string, opts: { tone?: "ok" | "warn" | "danger" | "info"; badgeText?: string } = {}): string {
  const tone = opts.tone ?? "info";
  return `<div class="tile tone-${tone}">
    <span class="tile-icon">${icon(iconName)}</span>
    <div class="tile-body">
      <span class="tile-label">${esc(label)}</span>
      <span class="tile-value">${esc(value)}</span>
    </div>
    ${opts.badgeText ? `<span class="tile-badge tone-${tone}">${esc(opts.badgeText)}</span>` : ""}
  </div>`;
}

/** 제목이 클럽 상품명이거나 게시판 머리글인 공지 — 운영 공지와 분리한다(F-11) */
const PRODUCT_NOTICE = /(xxio|젝시오|mizuno|미즈노|honma|혼마|titleist|타이틀리스트|\bping\b|pxg|callaway|캘러웨이|taylormade|테일러메이드|cleveland|클리블랜드|odyssey|오디세이|scotty|스카티|cobra|코브라|bridgestone|브릿지스톤|srixon|스릭슨|vokey|보키|드라이버|아이언|웨지|퍼터|풀세트|클럽세트|\biron\b|\bwedge\b|\bdriver\b|\bputter\b)/i;
const JUNK_NOTICE = /^(관리자|작성자|등록일|제목)/;

interface NoticeView {
  title: string;
  date: string;
  url: string | null;
}

function splitNotices(items: Array<{ title?: string; date?: string | null; url?: string | null }>): { real: NoticeView[]; products: NoticeView[] } {
  const real: NoticeView[] = [];
  const products: NoticeView[] = [];
  for (const it of items) {
    const title = (it.title ?? "").trim();
    if (title.length < 4 || JUNK_NOTICE.test(title)) continue;
    const entry: NoticeView = {
      title,
      date: fmtDate(it.date),
      url: typeof it.url === "string" && /^https?:/.test(it.url) ? it.url : null,
    };
    if (PRODUCT_NOTICE.test(title)) products.push(entry);
    else real.push(entry);
  }
  return { real, products };
}

function cancelTimeline(text: string): string {
  const wd = /주중\s*(\d+)\s*일\s*전/.exec(text);
  const we = /주말\s*(\d+)\s*일\s*전/.exec(text);
  if (!wd && !we) return "";
  const row = (label: string, days: number): string => {
    const pct = Math.max(6, Math.min(96, ((7 - days) / 7) * 100));
    return `<div class="penalty-row">
      <span class="penalty-label">${label}</span>
      <div class="penalty-track" role="img" aria-label="${label}은 라운드 ${days}일 전까지 무료 취소">
        <span class="penalty-free" style="width:${pct.toFixed(1)}%"></span>
        <span class="penalty-mark" style="left:${pct.toFixed(1)}%"><b>D-${days}</b></span>
      </div>
      <span class="penalty-note">D-${days}까지 무료</span>
    </div>`;
  };
  return `<div class="penalty">
    <div class="penalty-legend"><span><i class="lg-free"></i>무료 취소</span><span><i class="lg-fee"></i>위약 발생</span><span class="muted">라운드일 기준</span></div>
    ${wd ? row("주중", Number(wd[1])) : ""}
    ${we ? row("주말", Number(we[1])) : ""}
  </div>`;
}

function sections(d: CourseDetail, c: CourseIndexItem, others: Array<{ name: string; id?: string; holes?: number | null; item?: CourseIndexItem }>): { html: string; visible: { s3: boolean; s4: boolean; s6: boolean } } {
  const m = d.master ?? {};
  const co: CourseSpec = d.course ?? {};
  const fee = d.fee ?? {};
  const cancel: CancelInfo = d.cancel ?? {};
  const ops: CourseOps = d.ops ?? {};
  const fac: CourseFacilities = d.facilities ?? {};
  const br = d.briefing ?? {};
  const rt = d.rental ?? {};
  const cov = d.coverage ?? {};
  const fees = feeView(fee, c);

  /* 01 요금 & 예약 — 값이 있는 요금 항목만 카드로 만든다 */
  const unavailable = c.status === "closed" || c.status === "suspended";
  const asOf = fee.as_of || fee.checked_at;
  const cancelPolicy = cancel.cancel_policy;
  const cancelText = visibleText(typeof cancelPolicy === "string" ? cancelPolicy : cancelPolicy ? textOf(cancelPolicy) : "");
  const timeline = cancelText ? cancelTimeline(cancelText) : "";

  const feeCard = (label: string, slot: FeeSlot, note: string): string => {
    if (slot.value == null) return "";
    return `<div class="fee-card">
      <div class="fee-card-top"><span class="fee-card-label">${esc(label)}</span>${sourceTag(slot.source)}</div>
      <div class="fee-card-value">${won(slot.value)}</div>
      <div class="fee-card-note">${esc(note)}</div>
    </div>`;
  };
  const cartCard = fees.cart == null ? "" : `<div class="fee-card">
      <div class="fee-card-top"><span class="fee-card-label">카트</span><span class="src-tag src-neutral">팀 기준</span></div>
      <div class="fee-card-value">${won(fees.cart)}</div>
      <div class="fee-card-note">${esc(visibleText(fee.cart?.note) || "4인 1팀 기준")}</div>
    </div>`;
  const caddieCard = fees.caddie == null && !fees.caddieNone ? "" : `<div class="fee-card">
      <div class="fee-card-top"><span class="fee-card-label">캐디피</span><span class="src-tag src-neutral">팀 기준</span></div>
      <div class="fee-card-value">${fees.caddieNone ? "노캐디" : won(fees.caddie)}</div>
      <div class="fee-card-note">${esc(visibleText(fee.caddie?.note) || "4인 1팀 기준 · 캐디에게 직접 지급")}</div>
    </div>`;
  const feeCardList = [
    feeCard("주중", fees.weekday, "월~금 · 1인 18홀"),
    feeCard("주말·공휴일", fees.weekend, "토·일·공휴일 · 1인 18홀"),
    cartCard,
    caddieCard,
  ].filter(Boolean);
  const feeCardsHTML = feeCardList.length
    ? `<div class="fee-cards${feeCardList.length === 1 ? " is-single" : ""}">${feeCardList.join("")}</div>`
    : `<div class="callout">요금 안내 준비 중 · 전화 문의</div>`;

  const tableHTML = (() => {
    const rows = (fee.official_table?.rows ?? []).filter((r) => r && (r.value || r.amounts?.length));
    if (!rows.length) return "";
    const groups: Array<{ sec: string; rows: FeeTableRow[] }> = [];
    for (const r of rows) {
      const sec = (r.section || "요금").trim();
      let g = groups.find((x) => x.sec === sec);
      if (!g) { g = { sec, rows: [] }; groups.push(g); }
      const key = `${r.label || ""}|${r.value || ""}`;
      if (!g.rows.some((x) => `${x.label || ""}|${x.value || ""}` === key)) g.rows.push(r);
    }
    const body = groups.map((g) =>
      `<tr class="group"><th scope="colgroup" colspan="2">${esc(g.sec === "구분" ? "요금" : g.sec)}</th></tr>` +
      g.rows.map((r) => `<tr><td>${esc(r.label && r.label !== g.sec ? r.label : "")}</td><td class="num">${esc(r.value || (r.amounts?.length ? r.amounts.map((a) => won(a)).join(" · ") : "—"))}</td></tr>`).join("")).join("");
    const table = `<div class="table-wrap"><table class="fee-table"><thead class="sr-only"><tr><th scope="col">구분</th><th scope="col">요금</th></tr></thead><tbody>${body}</tbody></table></div>`;
    if (groups.length > 2 || rows.length > 8) {
      return `<details class="more-box"><summary>공식 요금표 ${rows.length}개 항목 펼치기</summary>${table}</details>`;
    }
    return table;
  })();

  const od = fee.official_detail ?? {};
  const detailRow = (label: string, v: unknown): [string, string] | null => {
    const t = valCell(v);
    return t ? [label, esc(t)] : null;
  };
  const detailRows = [
    detailRow("공식 요금 상세", od.green_detail),
    detailRow("카트 상세", od.cart_detail),
    detailRow("캐디 상세", od.caddie_detail),
    detailRow("시설 이용료", od.facility_fee),
    detailRow("클럽 대여", od.rental),
  ].filter((x): x is [string, string] => x !== null);

  const member = fee.member;
  const market = fee.market;

  const s1 = `<section class="section" id="s1" aria-labelledby="s1-h">
    <div class="section-head">
      <h2 id="s1-h"><span class="sec-num">01</span>요금 · 예약</h2>
      <p class="section-desc">1인 18홀 비회원 정상가. 시즌·시간대·예약 경로에 따라 달라지므로 예약 화면에서 최종 확인하세요.</p>
    </div>
    <div class="section-body">
      ${unavailable ? `<div class="callout warn"><strong>현재 이용 불가 구장입니다</strong>아래 요금은 마지막으로 확인된 값이며 예약·결제할 수 없습니다.</div>` : ""}
      ${feeCardsHTML}
      ${asOf ? `<p class="source-line">${isAdmin() ? `요금 기준 ${esc(fee.basis || "")} · 확인 ${fmtDate(asOf)}` : `요금 업데이트 ${esc(fmtDate(asOf))}`}</p>` : ""}
      ${market && (market.weekday_min || market.weekend_min) ? `<div class="inline-fact">
        <span class="inline-fact-label">관측 최저가</span>
        <span>${market.weekday_min ? `주중 ${won(market.weekday_min)}` : ""}${market.weekday_min && market.weekend_min ? " · " : ""}${market.weekend_min ? `주말 ${won(market.weekend_min)}` : ""}</span>
        ${isAdmin() && market.source ? `<span class="muted">${esc(market.source)}</span>` : ""}
      </div>` : ""}
      ${member && (member.weekday || member.weekend) ? `<div class="inline-fact">
        <span class="inline-fact-label">회원제 요금</span>
        <span>${member.weekday ? `주중 ${won(member.weekday)}` : ""}${member.weekday && member.weekend ? " · " : ""}${member.weekend ? `주말 ${won(member.weekend)}` : ""}</span>
      </div>` : ""}
      ${detailRows.length ? `<dl class="fact-list">${detailRows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>` : ""}
      ${tableHTML}

      <div class="policy-grid">
        <div class="policy-card">
          <h3 class="card-title">${icon("calendar")}예약 오픈</h3>
          ${cancel.open_cycle
            ? `<p class="policy-text">${esc(cancel.open_cycle)}</p>`
            : `<p class="policy-text muted">예약 오픈 일정은 골프장에 전화로 확인하세요.</p>`}
        </div>
        <div class="policy-card">
          <h3 class="card-title">${icon("clock")}취소 · 위약</h3>
          ${timeline}
          ${cancelText
            ? `<p class="policy-text">${esc(cancelText)}</p>`
            : `<p class="policy-text muted">취소 규정은 예약 전 전화로 확인하세요.</p>`}
          ${visibleText(cancel.notes) ? `<p class="policy-text muted">${esc(visibleText(cancel.notes))}</p>` : ""}
          ${evidenceDetails(cancel.evidence, "취소·위약 근거")}
          ${evidenceDetails(cancel.weather_evidence, "악천후 정산 근거")}
        </div>
      </div>
      ${fee.note && visibleText(fee.note) ? `<p class="source-line">${esc(visibleText(fee.note))}</p>` : ""}
      ${isAdmin() && (fee.sources ?? []).length ? `<p class="source-line">출처: ${(fee.sources ?? []).slice(0, 4).map((s) => s.url ? `<a class="link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.source || shortUrl(s.url))}</a>` : esc(s.source || "")).join(" · ")}</p>` : ""}
    </div>
  </section>`;

  /* 02 코스 스펙 */
  const grass = co.grass ?? {};
  const grassCards = (Object.keys(GRASS) as Array<keyof typeof GRASS>).map((k) => {
    const t = valCell(grass[k]);
    if (!t) return "";
    const dot = k === "tee" ? "is-tee" : k === "fairway" ? "is-fairway" : "is-green";
    return `<div class="grass-card">
      <span class="grass-dot ${dot}" aria-hidden="true"></span>
      <span class="grass-label">${GRASS[k]}</span>
      <span class="grass-value">${esc(t)}</span>
    </div>`;
  }).filter(Boolean).join("");

  let kgaHTML = "";
  const kga = co.kga ?? null;
  if (kga) {
    const combos = kga.hole_combinations ?? [];
    const rows: string[] = [];
    for (const cb of combos.slice(0, 4)) {
      if (typeof cb === "string") continue;
      for (const t of (cb.tees ?? []).slice(0, 8)) {
        rows.push(`<tr><td>${esc([cb.course_name_1, cb.course_name_2].filter(Boolean).join(" + "))}</td>
          <td>${esc(t.tee || "")}</td><td>${esc(t.gender || "")}</td>
          <td class="num">${fmtNum(t.length_yds)}</td><td class="num">${fmtNum(t.course_rating, 1)}</td><td class="num">${fmtNum(t.slope_rating)}</td></tr>`);
      }
    }
    if (rows.length) {
      kgaHTML = `<details class="more-box"><summary>KGA 코스레이팅 · 슬로프 ${rows.length}행 펼치기</summary>
        <div class="table-wrap"><table>
        <thead><tr><th scope="col">조합</th><th scope="col">티</th><th scope="col">성별</th><th scope="col">길이(yd)</th><th scope="col">코스레이팅</th><th scope="col">슬로프</th></tr></thead>
        <tbody>${rows.join("")}</tbody></table></div>
        ${isAdmin() ? `<p class="source-line">출처: 대한골프협회(KGA) 코스레이팅™/슬로프레이팅™ · 18홀 조합 단위</p>` : ""}
      </details>`;
    }
  }

  const holes = m.holes ?? {};
  const holeText = [
    holes.total ? `총 ${holes.total}홀` : null,
    holes.member ? `회원 ${holes.member}` : null,
    holes.public ? `대중 ${holes.public}` : null,
    holes.non_member ? `비회원 ${holes.non_member}` : null,
  ].filter(Boolean).join(" · ");
  const yard = co.length_m ? Math.round(co.length_m * 1.0936) : null;
  const courseNames = co.course_names ? visibleText(textOf(co.course_names)) : "";
  // 데이터에 참·거짓으로 들어온 야간 운영 값은 '운영'으로 편다
  const rawNight: unknown = co.night_light;
  const nightLight = rawNight === true ? "운영" : valCell(rawNight);

  const s2 = `<section class="section" id="s2" aria-labelledby="s2-h">
    <div class="section-head">
      <h2 id="s2-h"><span class="sec-num">02</span>코스 스펙</h2>
      <p class="section-desc">규모·전장·잔디와 KGA 공식 레이팅. 레이팅은 난이도 비교의 1차 기준입니다.</p>
    </div>
    <div class="section-body">
      ${co.length_m ? `<div class="spec-hero">
        <div class="spec-hero-main">
          <span class="spec-label">전장 (18홀 기준)</span>
          <p class="spec-value">${fmtNum(co.length_m)}<span>m</span> <small>${yard ? `${fmtNum(yard)}yd` : ""}</small></p>
        </div>
        ${gauge({
          value: co.length_m, min: 4800, max: 7800,
          ticks: [{ at: 4800, label: "4.8km" }, { at: 6300, label: "6.3km" }, { at: 7800, label: "7.8km" }],
          label: `전장 ${fmtNum(co.length_m)}미터, 18홀 기준 4.8km~7.8km 범위`,
        })}
        <p class="spec-hint">국내 18홀 평균은 약 6.4km입니다.</p>
      </div>` : ""}
      <dl class="spec-facts">
        ${holeText ? `<div><dt>홀 구성</dt><dd>${esc(holeText)}</dd></div>` : ""}
        ${co.par ? `<div><dt>파</dt><dd>${co.par}</dd></div>` : ""}
        ${(co.blocks ?? []).length ? `<div><dt>코스 구성</dt><dd>${esc((co.blocks ?? []).join(" · "))}</dd></div>` : ""}
        ${(m.course_blocks ?? []).length ? `<div><dt>세부 코스명</dt><dd>${esc((m.course_blocks ?? []).join(" · "))}</dd></div>` : ""}
        ${courseNames ? `<div><dt>코스명</dt><dd>${esc(courseNames)}</dd></div>` : ""}
        ${nightLight ? `<div><dt>야간 라운드</dt><dd>${esc(nightLight)}</dd></div>` : ""}
      </dl>
      ${grassCards ? `<div class="grass-cards">${grassCards}</div>` : ""}
      ${(co.extra_courses ?? []).length ? `<div class="extra-courses"><h3 class="card-title">추가 코스</h3>${extraCoursesHTML(co.extra_courses ?? [])}</div>` : ""}
      ${kgaHTML}
      ${co.hole_by_hole ? `<details class="more-box"><summary>홀별 파·거리 원본 보기</summary><pre class="pre">${esc(JSON.stringify(co.hole_by_hole, null, 1))}</pre></details>` : ""}
    </div>
  </section>`;

  /* 03 현장 운영 */
  const opsTiles: string[] = [];
  const opsUnknown: string[] = [];
  for (const k of Object.keys(OPS) as OpsKey[]) {
    const v = ops[k];
    if (!v) { opsUnknown.push(OPS[k]); continue; }
    const t = valCell(v.value);
    if (t) {
      const tone = toneOf(t);
      opsTiles.push(tile(OPS_ICON[k], OPS[k], t, { tone: tone.tone, badgeText: tone.label }));
    } else opsUnknown.push(OPS[k]);
  }
  const s3 = (isAdmin() || opsTiles.length) ? `<section class="section" id="s3" aria-labelledby="s3-h">
    <div class="section-head">
      <h2 id="s3-h"><span class="sec-num">03</span>현장 운영</h2>
      <p class="section-desc">노캐디·인원·카트·체크인처럼 예약 전에 알아야 하는 실제 플레이 조건.</p>
    </div>
    <div class="section-body">
      ${opsTiles.length ? `<div class="tiles">${opsTiles.join("")}</div>`
        : `<div class="callout">공식 채널에서 확인된 운영 정보가 아직 없습니다. 전화·현장 확인이 필요합니다.</div>`}
      ${unconfirmedBox("운영 정보", opsUnknown)}
      ${isAdmin() && ops.browser_official
        ? `<details class="more-box"><summary>수집 원문 보기</summary><pre class="pre">${esc(JSON.stringify(ops.browser_official, null, 1))}</pre></details>`
        : ""}
    </div>
  </section>` : "";

  /* 04 부대시설 */
  const facTiles: string[] = [];
  const facUnknown: string[] = [];
  for (const k of Object.keys(FAC) as FacilityKey[]) {
    const v = fac[k];
    if (!v) { facUnknown.push(FAC[k]); continue; }
    const t = valCell(v.value);
    if (t) {
      const tone = toneOf(t, k === "closed_days");
      facTiles.push(tile(FAC_ICON[k], FAC[k], t, { tone: tone.tone, badgeText: tone.label }));
    } else facUnknown.push(FAC[k]);
  }
  const s4 = (isAdmin() || facTiles.length) ? `<section class="section" id="s4" aria-labelledby="s4-h">
    <div class="section-head">
      <h2 id="s4-h"><span class="sec-num">04</span>부대시설</h2>
      <p class="section-desc">연습·식음·락카·숙박·야간 조명처럼 라운드 환경을 좌우하는 시설.</p>
    </div>
    <div class="section-body">
      ${facTiles.length ? `<div class="tiles">${facTiles.join("")}</div>` : `<div class="callout">확인된 부대시설 정보가 없습니다.</div>`}
      ${unconfirmedBox("시설 정보", facUnknown)}
      ${isAdmin() && (fac.gf_facilities ?? []).length ? `<p class="source-line">참고(공식 시설 목록): ${esc((fac.gf_facilities ?? []).slice(0, 3).join(" / "))}</p>` : ""}
    </div>
  </section>` : "";

  /* 05 브리핑·공지 */
  const alert: BriefingAlert | null | undefined = br.alert;
  const items = br.notices?.items ?? [];
  const { real, products } = splitNotices(items);
  const noticeHTML = real.length
    ? `<ul class="notice-list">${real.slice(0, 10).map((n) => `<li>
        <time datetime="${esc(n.date.replaceAll(".", "-"))}">${esc(n.date)}</time>
        <span class="notice-title">${n.url
          ? `<a class="link" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>`
          : esc(n.title)}</span>
      </li>`).join("")}</ul>`
    : `<p class="section-desc">표시할 최근 운영 공지가 없습니다.</p>`;
  const period = alert ? periodText(alert.period) : "";
  const alertSummary = alert ? visibleText(alert.summary) : "";
  const alertDetail = alert ? visibleText(alert.detail) : "";
  const review = br.review;
  const s5 = `<section class="section" id="s5" aria-labelledby="s5-h">
    <div class="section-head">
      <h2 id="s5-h"><span class="sec-num">05</span>공지 · 브리핑</h2>
      <p class="section-desc">휴장·에어레이션·요금 변경 같은 최근 공지와 라운더 평가. 예약 전에 가장 먼저 볼 영역입니다.</p>
    </div>
    <div class="section-body">
      ${alert ? `<div class="callout ${(alert.level ? LEVEL[alert.level] : undefined) ?? "info"}">
        <strong>${esc(alertSummary || (alert.confirmed ? "확인된 공지" : "안내"))}</strong>
        ${esc(alertDetail || "")}
        ${period ? `<div class="sub">기간: ${esc(period)}</div>` : ""}
        ${isAdmin() && alert.source_url ? `<div class="sub"><a class="link" href="${esc(alert.source_url)}" target="_blank" rel="noopener noreferrer">근거 보기</a></div>` : ""}
      </div>` : ""}
      ${review && review.score_10 != null ? `<div class="review-card">
        <div class="review-head"><h3 class="card-title">${icon("star")}라운더 평가</h3>${review.count ? `<span class="muted">${fmtNum(review.count)}건 집계</span>` : ""}</div>
        ${ratingBar(review.score_10)}
        ${review.note && visibleText(review.note) ? `<p class="source-line">${esc(visibleText(review.note))}</p>` : ""}
      </div>` : ""}
      ${br.recent_notice_text && visibleText(br.recent_notice_text) ? `<div class="inline-fact"><span class="inline-fact-label">공지 요약</span><span>${esc(visibleText(br.recent_notice_text))}</span></div>` : ""}
      ${br.course_notes && visibleText(br.course_notes) ? `<div class="inline-fact"><span class="inline-fact-label">코스 메모</span><span>${esc(visibleText(br.course_notes))}</span></div>` : ""}
      <div class="notice-block">
        <h3 class="card-title">최근 공지</h3>
        ${noticeHTML}
        ${products.length ? `<details class="more-box"><summary>클럽·장비 상품 소식 ${products.length}건 (공지 아님)</summary>
          <ul class="notice-list is-product">${products.slice(0, 10).map((n) => `<li><time>${esc(n.date)}</time><span class="notice-title">${esc(n.title)}</span></li>`).join("")}</ul>
        </details>` : ""}
        ${br.collected_at ? `<p class="source-line">${isAdmin() ? `수집 ${fmtDate(br.collected_at)}` : `공지 확인 ${esc(fmtDate(br.collected_at))}`}</p>` : ""}
      </div>
      ${isAdmin() && (br.unconfirmed ?? []).length ? unconfirmedBox("공지", (br.unconfirmed ?? []).slice(0, 14)) : ""}
      ${isAdmin() && (br.sources ?? []).length ? `<p class="source-line">출처: ${(br.sources ?? []).slice(0, 5).map((u) => /^https?:/.test(u) ? `<a class="link" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(shortUrl(u))}</a>` : esc(u)).join(" · ")}</p>` : ""}
    </div>
  </section>`;

  /* 06 동일 부지 클러스터 */
  const cluster = c.cluster ? state.clusters.get(c.cluster) ?? null : null;
  const s6 = cluster && others.length ? `<section class="section" id="s6" aria-labelledby="s6-h">
    <div class="section-head">
      <h2 id="s6-h"><span class="sec-num">06</span>동일 부지 코스</h2>
      <p class="section-desc">${esc(visibleText(cluster.relationship) || visibleText(cluster.basis) || "같은 소재지의 코스가 별도 레코드로 등록되어 있습니다.")}</p>
    </div>
    <div class="section-body">
      <div class="cluster-grid">
        ${others.map((o) => {
          const item = o.item;
          const feeV = item ? (item.green_fee?.weekend ?? item.green_fee?.weekday ?? null) : null;
          const meta = [
            item?.type && !UNKNOWN_TEXT.test(item.type) ? esc(item.type) : "",
            feeV != null ? `그린피 ${won(feeV)}~` : "",
          ].filter(Boolean).join(" · ");
          return `<div class="cluster-card">
            <div class="cluster-top">
              <h3 class="cluster-name">${o.id ? `<a class="link" href="#/c/${esc(o.id)}">${esc(o.name)}</a>` : esc(o.name)}</h3>
              ${o.holes ? `<span class="stat-pill"><b>${o.holes}</b>홀</span>` : ""}
            </div>
            ${meta ? `<p class="cluster-meta">${meta}</p>` : ""}
            ${o.id ? `<a class="btn btn-sm" href="#/c/${esc(o.id)}">상세 보기${icon("arrow-right")}</a>` : ""}
          </div>`;
        }).join("")}
      </div>
    </div>
  </section>` : "";

  /* 07 클럽 렌탈 */
  const nd = rt.nearby_delivery;
  const rentalRows: Array<[string, unknown]> = [
    ["대여 가능", rt.available], ["풀세트 요금", rt.full_set != null ? won(rt.full_set) : null],
    ["요금 안내", rt.fee_text], ["브랜드", rt.brand], ["좌타용", rt.left_handed],
    ["골프화", rt.shoes], ["9홀", rt.nine_hole], ["거리측정기", rt.range_finder],
    ["사전 예약", rt.reservation],
  ];
  const rentalTiles = rentalRows.map(([label, v]) => {
    const t = valCell(v);
    return t ? `<div class="mini-fact"><span>${esc(label)}</span><b>${esc(t)}</b></div>` : "";
  }).filter(Boolean).join("");
  const providers = (nd?.providers ?? []).map((p: NearbyDeliveryProvider) => {
    const bookable = p.bookable !== false && !/중단|불가|마감/i.test(p.operating_status ?? "");
    const price = visibleText(p.price_headline);
    const basis = visibleText(p.basis);
    const meta = [basis, visibleText(p.operating_status)].filter(Boolean).join(" · ");
    return `<div class="provider${bookable ? "" : " is-off"}">
      <div class="provider-top">
        <h3 class="provider-name">${esc(p.name)}</h3>
        <span class="badge ${bookable ? "ok" : "danger"}">${bookable ? "예약 가능" : "예약 중단"}</span>
      </div>
      ${price ? `<p class="provider-price">${esc(price)}</p>` : ""}
      ${meta ? `<p class="provider-meta">${esc(meta)}</p>` : ""}
      <div class="provider-actions">
        ${p.phone ? `<a class="btn btn-sm" href="tel:${esc(String(p.phone).replace(/[^\d+]/g, ""))}">${icon("phone")}${esc(p.phone)}</a>` : ""}
        ${p.coverage ? `<span class="tag">권역 ${esc(String(p.coverage))}</span>` : ""}
      </div>
    </div>`;
  }).join("");

  const s7 = `<section class="section" id="s7" aria-labelledby="s7-h">
    <div class="section-head">
      <h2 id="s7-h"><span class="sec-num">07</span>클럽 렌탈</h2>
      <p class="section-desc">골프장 자체 대여와, 이 권역에 배송·픽업이 가능한 렌탈 업체.</p>
    </div>
    <div class="section-body">
      ${rentalTiles ? `<div class="mini-facts">${rentalTiles}</div>` : `<div class="callout">골프장 자체 클럽 대여 정보가 확인되지 않았습니다.</div>`}
      ${evidenceDetails(rt.evidence, "대여 근거")}
      ${nd && (nd.providers ?? []).length ? `<div class="providers">
        <div class="providers-head"><h3 class="card-title">${esc(nd.region || "")} 권역 배송 업체 ${(nd.providers ?? []).length}곳</h3>
        <a class="link" href="#/rental">전체 렌탈 업체 보기 →</a></div>
        ${providers}
        <p class="source-line">${esc(nd.note_code || "")}${nd.verified_at ? (isAdmin() ? ` · 확인 ${esc(nd.verified_at)}` : ` · 업데이트 ${esc(fmtDate(nd.verified_at))}`) : ""}</p>
      </div>` : `<p class="section-desc"><a class="link" href="#/rental">전체 렌탈·딜리버리 업체 보기 →</a></p>`}
    </div>
  </section>`;

  /* 데이터 정보 */
  const covRows = COVERAGE_LABELS.map(([k, label]) => {
    const v = cov[k];
    return typeof v === "number" ? coverageBar(label, v) : "";
  }).join("");
  const updated = updatedAt(d.meta?.normalized_at, d.meta?.generated_at);
  const dataInfo = isAdmin()
    ? `<section class="section" id="s8" aria-labelledby="s8-h">
        <div class="section-head"><h2 id="s8-h"><span class="sec-num">08</span>데이터 정보</h2>
        <p class="section-desc">7개 영역 채움률. 비어 있는 값은 '미확인'이며 '없음'과 다릅니다.</p></div>
        <div class="section-body"><div class="cov-list">${covRows}</div>
        <p class="source-line">수집 ${esc(updated)} · 스키마 ${esc(d.meta?.schema || "")} · <a class="link" href="${REPO_URL}/blob/main/data/v29/schema.md" target="_blank" rel="noopener noreferrer">스키마 문서</a></p></div>
      </section>`
    : `<section class="section" id="s8" aria-labelledby="s8-h">
        <div class="section-head"><h2 id="s8-h"><span class="sec-num">08</span>데이터 기준</h2>
        <p class="section-desc">${esc(updated || "—")} 기준 · 공개 자료에서 확인된 값만 표시합니다.</p></div>
      </section>`;

  return {
    html: `${s1}${s2}${s3}${s4}${s5}${s6}${s7}${dataInfo}`,
    visible: { s3: Boolean(s3), s4: Boolean(s4), s6: Boolean(s6) },
  };
}

function unconfirmedBox(label: string, labels: string[]): string {
  // 미확인 목록은 수집·검증용 정보이므로 관리자 모드에서만 DOM 에 넣는다
  if (!isAdmin() || !labels.length) return "";
  return `<details class="more-box unconfirmed"><summary>확인하지 못한 ${label} ${labels.length}개</summary>
    <p>${esc(labels.join(" · "))}</p>
    <p class="muted">값이 없다는 것은 '없음'이 아니라 '확인하지 못함'입니다. 전화로 확인하세요.</p>
  </details>`;
}

function extraCoursesHTML(list: Array<ExtraCourse | string>): string {
  return `<div class="extra-courses-list">${list.map((raw) => {
    const x: ExtraCourse = typeof raw === "string" ? { name: raw } : raw;
    const title = [visibleText(x.name) || "추가 코스", x.holes ? `${x.holes}홀` : "", visibleText(x.type)].filter(Boolean).join(" · ");
    const facts = [
      x.open_hours ? `운영 ${visibleText(x.open_hours)}` : "",
      x.closed ? `휴장 ${visibleText(x.closed)}` : "",
      x.tel ? `전화 ${visibleText(x.tel)}` : "",
      x.fee ? `요금 ${visibleText(x.fee)}` : "",
    ].map((s) => s.trim()).filter((s) => !/^(?:운영|휠장|전화|요금)$/.test(s)).join(" · ");
    return `<div class="extra-course">
      <strong>${esc(title)}</strong>
      ${facts ? `<div class="sub">${esc(facts)}</div>` : ""}
      ${visibleText(x.note) ? `<div class="sub">${esc(visibleText(x.note))}</div>` : ""}
    </div>`;
  }).join("")}</div>`;
}

/* ---------------- 렌탈 페이지 ---------------- */

function dayPrice(text?: string | null): number | null {
  if (!text) return null;
  // "1박2일 50,000원", "+1일 10,000원" 같은 조건부·추가 요금은 1일 기준가가 아니다
  const re = /(?:^|[^0-9박+])(?:1일|일)\s*([0-9][0-9,]{2,})\s*원/g;
  let m: RegExpExecArray | null;
  let best: number | null = null;
  while ((m = re.exec(text)) !== null) {
    const v = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(v)) continue;
    if (best === null || v < best) best = v;
  }
  return best;
}

function isBookable(p: RentalProvider): boolean {
  return !/중단|불가|마감|sold\s*out/i.test(p.status ?? "");
}

let rentalRegion = "";

function renderRental(): void {
  const r = state.rental;
  if (!r) {
    $<HTMLElement>("#view-page").innerHTML = `<div class="page">
      <h1 class="page-title" tabindex="-1">클럽 렌탈·딜리버리</h1>
      <div class="state-box" role="alert"><span class="state-icon">${icon("alert")}</span>
      <h2 class="state-title">렌탈 데이터를 불러오지 못했습니다</h2>
      <p class="state-desc">잠시 후 다시 시도해 주세요.</p>
      <button class="btn" type="button" id="rental-retry">다시 시도</button></div></div>`;
    $<HTMLButtonElement>("#rental-retry")?.addEventListener("click", () => void renderRental());
    setTitle("클럽 렌탈 — CourseBrief");
    return;
  }
  const all = r.providers ?? [];
  const regions: RentalRegion[] = ["수도권", "강원", "충청", "호남", "영남", "제주"];
  const region = rentalRegion as RentalRegion | "";
  const filtered = region ? all.filter((p) => (p.regions ?? []).includes(region)) : all;
  const sorted = [...filtered].sort((a, b) => {
    const ba = isBookable(a) ? 0 : 1;
    const bb = isBookable(b) ? 0 : 1;
    if (ba !== bb) return ba - bb;
    const pa = dayPrice(a.price) ?? Infinity;
    const pb = dayPrice(b.price) ?? Infinity;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name, "ko");
  });
  const soldOut = all.filter((p) => !isBookable(p)).length;

  const cards = sorted.map((p) => {
    const bookable = isBookable(p);
    const day = dayPrice(p.price);
    const langs = (p.languages ?? "").split(/[·,]/).map((s) => s.trim()).filter(Boolean);
    return `<article class="rental-card${bookable ? "" : " is-off"}">
      <div class="rental-head">
        <div>
          <h2 class="rental-name">${esc(p.name)}</h2>
          <p class="rental-regions">${(p.regions ?? []).map((rg) => `<span class="tag">${esc(rg)}</span>`).join("")}</p>
        </div>
        <span class="badge ${bookable ? "ok" : "danger"}">${bookable ? "예약 가능" : "예약 중단"}</span>
      </div>
      <div class="rental-price">
        ${day != null
          ? `<span class="rental-price-k">1일 기준</span><span class="rental-price-v">${won(day)}</span>`
          : visibleText(p.price)
            ? `<span class="rental-price-k">요금</span><span class="rental-price-v is-text">${esc(visibleText(p.price))}</span>`
            : ""}
      </div>
      ${day != null && p.price ? `<p class="rental-price-raw">${esc(p.price)}</p>` : ""}
      <dl class="rental-facts">
        ${p.brands ? `<div><dt>클럽</dt><dd>${esc(p.brands)}</dd></div>` : ""}
        ${p.delivery ? `<div><dt>배송·픽업</dt><dd>${esc(p.delivery)}</dd></div>` : ""}
        ${p.status ? `<div><dt>상태</dt><dd>${esc(p.status)}</dd></div>` : ""}
        ${langs.length ? `<div><dt>언어</dt><dd>${langs.map((l) => `<span class="tag">${esc(l)}</span>`).join(" ")}</dd></div>` : ""}
        ${p.course_count ? `<div><dt>연결 구장</dt><dd>${p.course_count}곳</dd></div>` : ""}
      </dl>
      <div class="rental-actions">
        ${p.phone ? `<a class="btn btn-sm" href="tel:${esc(String(p.phone).replace(/[^\d+]/g, ""))}">${icon("phone")}${esc(p.phone)}</a>` : ""}
        ${p.url ? `<a class="btn btn-ghost btn-sm" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${icon("external")}홈페이지</a>` : ""}
      </div>
    </article>`;
  }).join("");

  const verified = r.dataset?.verified_at ?? "";
  const meta = isAdmin()
    ? `조사 ${esc(verified)} · ${regions.length}개 권역 · ${all.length}곳 · <a class="link" href="${REPO_URL}/blob/main/data/v29/rental_deliveries.md" target="_blank" rel="noopener noreferrer">원문 조사 노트</a>`
    : `${verified ? `업데이트 ${esc(fmtDate(verified))} · ` : ""}${regions.length}개 권역 · ${all.length}곳`;

  $<HTMLElement>("#view-page").innerHTML = `<div class="page">
    <header class="page-head">
      <h1 class="page-title" tabindex="-1">클럽 렌탈 · 딜리버리</h1>
      <p class="page-lead">골프장 자체 대여와, 권역으로 배송·픽업이 가능한 업체를 한곳에 모았습니다. 해외에서 오셨거나 장비 없이 라운드할 때 쓰세요.</p>
    </header>
    <div class="stat-row">
      <div class="stat"><span class="stat-n">${all.length}</span><span class="stat-l">업체</span></div>
      <div class="stat"><span class="stat-n">${all.length - soldOut}</span><span class="stat-l">예약 가능</span></div>
      <div class="stat"><span class="stat-n">${soldOut}</span><span class="stat-l">예약 중단</span></div>
      <div class="stat"><span class="stat-n">${regions.length}</span><span class="stat-l">권역</span></div>
    </div>
    ${r.summary ? `<div class="callout info"><strong>시장 구조</strong>${esc(r.summary)}</div>` : ""}
    <div class="rental-filter" role="group" aria-label="권역 필터">
      <button type="button" class="chip${rentalRegion === "" ? " is-on" : ""}" data-region="" aria-pressed="${rentalRegion === ""}">전체</button>
      ${regions.map((rg) => {
        const n = all.filter((p) => (p.regions ?? []).includes(rg)).length;
        return `<button type="button" class="chip${rentalRegion === rg ? " is-on" : ""}" data-region="${rg}" aria-pressed="${rentalRegion === rg}">${rg}<span class="chip-n">${n}</span></button>`;
      }).join("")}
    </div>
    <div class="rental-list">${cards || `<div class="state-box"><h2 class="state-title">이 권역에 확인된 업체가 없습니다</h2><p class="state-desc">전체 권역으로 다시 보세요.</p></div>`}</div>
    <div class="callout"><strong>아직 비어 있는 것</strong>다국어(영어·일본어·중국어) 온라인 예약과 거리측정기 대여 옵션 표기가 거의 없습니다. 재고·개별 견적·권역별 실제 배송 가능 여부는 전화·카카오톡 상담으로만 확인됩니다.</div>
    <p class="source-line">${meta}</p>
  </div>`;

  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-region]")) {
    btn.addEventListener("click", () => {
      rentalRegion = btn.dataset.region ?? "";
      renderRental();
    });
  }
  setTitle("클럽 렌탈·딜리버리 — CourseBrief");
  window.scrollTo({ top: 0 });
}

/* ---------------- 데이터 소개 ---------------- */

function renderAbout(): void {
  const index = getIndex();
  const d = index.dataset;
  const c = d.counts;
  const updated = fmtDate(d.built_at);
  const cov = d.coverage ?? {};
  const covRows = COVERAGE_LABELS.map(([k, label, detail]) => {
    const v = cov[k];
    return typeof v === "number" ? coverageBar(label, v, detail) : "";
  }).join("");

  const lead = isAdmin()
    ? "CourseBrief는 골프장 공식 홈페이지·공지·요금표를 직접 수집하고 공개 데이터와 대조해 7개 영역으로 정리합니다. 모든 값에는 출처와 확인 시점이 붙습니다."
    : "CourseBrief는 전국 골프장을 7개 영역으로 정리한 참고 데이터입니다. 공개 자료에서 확인된 값만 표시하며, 값이 없는 항목은 비워 둡니다.";

  const principles = [
    ["공식 우선", "골프장 공식 홈페이지·공지·요금표를 1순위로 보고, 2차 사이트 값은 교차검증에만 씁니다."],
    ["없음과 빈 값의 구분", "값이 없는 항목은 비워 둡니다. '정보 없음'을 '없음'으로 해석하지 않습니다."],
    ["확인 시점 기록", "그린피처럼 빨리 낡는 값에는 확인 날짜를 함께 남깁니다."],
    ["전화·현장 확인 항목", "좌타 클럽, 매트 비율, 락카 요금처럼 전화로만 확인되는 항목은 비워 두고 제보로 채웁니다."],
  ];

  $<HTMLElement>("#view-page").innerHTML = `<div class="page">
    <header class="page-head">
      <h1 class="page-title" tabindex="-1">데이터</h1>
      <p class="page-lead">${esc(lead)}</p>
    </header>

    <div class="stat-row">
      <div class="stat"><span class="stat-n">${c.total}</span><span class="stat-l">전체 골프장</span></div>
      <div class="stat"><span class="stat-n">${c.with_detail}</span><span class="stat-l">상세 7개 영역</span></div>
      <div class="stat"><span class="stat-n">${c.operating}</span><span class="stat-l">영업중</span></div>
      <div class="stat"><span class="stat-n">${c.under_construction + c.planned}</span><span class="stat-l">건설중·미착공</span></div>
      <div class="stat"><span class="stat-n">${c.suspended + c.closed}</span><span class="stat-l">휴업·폐업</span></div>
      <div class="stat"><span class="stat-n">${c.cancelled}</span><span class="stat-l">사업 취소</span></div>
    </div>

    ${isAdmin() ? `<section class="about-block">
      <h2 class="h2">영역별 정보 충실도</h2>
      <p class="section-desc">7개 영역 평균입니다. 비어 있는 값은 '미확인'이며 '없음'과 다릅니다.</p>
      <div class="cov-list">${covRows || `<p class="section-desc">충실도 정보를 불러오지 못했습니다.</p>`}</div>
    </section>` : ""}

    <section class="about-block">
      <h2 class="h2">7개 영역</h2>
      <div class="area-grid">
        ${COVERAGE_LABELS.map(([k, label, detail], i) => {
          const v = cov[k];
          return `<div class="area-card">
            <span class="area-num">${String(i + 1).padStart(2, "0")}</span>
            <div class="area-body"><h3 class="area-title">${esc(label)}</h3><p class="area-desc">${esc(detail)}</p></div>
            ${isAdmin() && typeof v === "number" ? `<span class="area-cov">${Math.round(v * 100)}%</span>` : ""}
          </div>`;
        }).join("")}
      </div>
    </section>

    <section class="about-block">
      <h2 class="h2">수집 원칙</h2>
      <div class="principle-grid">
        ${principles.map(([t, body]) => `<div class="principle"><h3>${esc(t)}</h3><p>${esc(body)}</p></div>`).join("")}
      </div>
    </section>

    <section class="about-block">
      <h2 class="h2">주의</h2>
      <div class="callout warn">
        <strong>참고 데이터입니다</strong>
        요금·운영 정보는 수집 시점의 공개 정보이며, 골프장 정책에 따라 수시로 바뀝니다. 예약·결제 전 반드시 공식 채널에서 최종 확인하세요. 이 사이트는 예약을 대행하지 않습니다.
      </div>
    </section>

    <p class="source-line">${isAdmin()
      ? `${esc(d.version)} · ${esc(updated)} 기준 · <a class="link" href="${REPO_URL}" target="_blank" rel="noopener noreferrer">GitHub 저장소</a> · <a class="link" href="${REPO_URL}/blob/main/data/v29/schema.md" target="_blank" rel="noopener noreferrer">스키마 문서</a>`
      : `업데이트 ${esc(updated)}`}</p>
  </div>`;
  setTitle("데이터 안내 — CourseBrief");
  window.scrollTo({ top: 0 });
}

/* ---------------- 라우터 ---------------- */

type ViewName = "list" | "detail" | "page";

function setTitle(title: string): void {
  document.title = title;
}

function setNav(name: "list" | "rental" | "about"): void {
  for (const a of document.querySelectorAll<HTMLElement>("[data-nav]")) {
    const on = a.dataset.nav === name;
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

function showView(name: ViewName): void {
  $<HTMLElement>("#view-list").hidden = name !== "list";
  $<HTMLElement>("#view-detail").hidden = name !== "detail";
  $<HTMLElement>("#view-page").hidden = name !== "page";
}

/** 화면 전환 뒤 제목(h1)으로 포커스를 옮겨 스크린리더·키보드 사용자가 새 화면을 인지하게 한다 */
function focusHeading(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

let firstRoute = true;

async function route(): Promise<void> {
  const hash = (location.hash || "#/").replace(/^#/, "");
  // `#main` 같은 비경로 해시는 라우팅하지 않는다(건너뛰기 링크·앵커와 충돌 방지)
  if (hash && !hash.startsWith("/")) {
    document.getElementById(hash)?.scrollIntoView();
    return;
  }
  const anchorAt = hash.indexOf("#");
  const section = anchorAt >= 0 ? hash.slice(anchorAt + 1) : "";
  const path = (anchorAt >= 0 ? hash.slice(0, anchorAt) : hash).split("?")[0];

  if (path.startsWith("/c/")) {
    const id = decodeURIComponent(path.slice(3));
    const needsRender = id !== renderedDetailId || $<HTMLElement>("#view-detail").hidden;
    showView("detail");
    setNav("list");
    if (needsRender) {
      await renderDetail(id);
      if (!firstRoute) focusHeading("#detail-title");
    } else if (section) {
      scrollToSection(section);
    }
    firstRoute = false;
    return;
  }
  renderedDetailId = null;
  sectionObserver?.disconnect();

  if (path === "/rental") {
    showView("page");
    setNav("rental");
    renderRental();
    if (!firstRoute) focusHeading(".page-title");
    firstRoute = false;
    return;
  }
  if (path === "/about") {
    showView("page");
    setNav("about");
    renderAbout();
    if (!firstRoute) focusHeading(".page-title");
    firstRoute = false;
    return;
  }
  showView("list");
  setNav("list");
  applyHashQuery(readHashQuery());
  // 상세에서 돌아올 때는 보던 자리로, 아니면 목록 처음으로
  const targetY = state.pendingScroll;
  state.pendingScroll = null;
  await renderList({ reset: true });
  setTitle(`전국 골프장 ${getIndex().dataset.counts.total}곳 — CourseBrief`);
  if (!firstRoute) {
    focusHeading("#hero-title");
    // h1 포커스가 스크롤을 움직이는 브라우저가 있어 위치를 한 번 더 맞춘다
    const y = targetY ?? 0;
    requestAnimationFrame(() => window.scrollTo(0, y));
    if (targetY !== null) {
      // 브라우저가 해시 이동 뒤 늦게 스크롤을 되돌리는 경우까지 덮는다
      for (const delay of [120, 320]) setTimeout(() => window.scrollTo(0, targetY), delay);
    }
  }
  state.lastListHash = hashQueryFromState();
  firstRoute = false;
}

/* ---------------- 이벤트 ---------------- */

const DEBOUNCE_MS = 140;

function rerenderList(): void {
  state.shown = CONFIG.pageSize;
  syncHash();
  state.lastListHash = hashQueryFromState();
  void renderList({ reset: true });
}

function wire(): void {
  const q = $<HTMLInputElement>("#q");
  const qClear = $<HTMLButtonElement>("#q-clear");
  const onQuery = debounce(() => {
    state.q = q.value.trim();
    const onList = location.hash.replace(/^#/, "").split("?")[0] === "/";
    if (onList) rerenderList();
    else location.hash = hashQueryFromState(); // 라우터가 목록으로 이동하며 검색어를 적용한다
  }, DEBOUNCE_MS);
  q.addEventListener("input", () => {
    qClear.hidden = !q.value;
    onQuery();
  });
  qClear.addEventListener("click", () => {
    q.value = "";
    qClear.hidden = true;
    state.q = "";
    rerenderList();
    q.focus();
  });

  const selectFilters: Array<[string, "sido" | "type" | "holes" | "fee"]> = [
    ["#f-sido", "sido"], ["#f-type", "type"], ["#f-holes", "holes"], ["#f-fee", "fee"],
  ];
  for (const [selector, key] of selectFilters) {
    $<HTMLSelectElement>(selector).addEventListener("change", (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLSelectElement)) return;
      state.filters[key] = target.value;
      rerenderList();
    });
  }
  $<HTMLSelectElement>("#f-sort").addEventListener("change", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLSelectElement)) return;
    state.filters.sort = isSortKey(target.value) ? target.value : "name";
    rerenderList();
  });
  $<HTMLElement>("#status-chips").addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest<HTMLButtonElement>(".chip");
    if (!btn) return;
    const st = btn.dataset.status;
    if (!isCourseStatus(st)) return;
    const on = state.filters.status.has(st);
    if (on) state.filters.status.delete(st);
    else state.filters.status.add(st);
    paintChips();
    rerenderList();
  });
  $<HTMLButtonElement>("#f-reset").addEventListener("click", () => resetFilters(true));
  $<HTMLButtonElement>("#more").addEventListener("click", () => {
    state.shown += CONFIG.pageSize;
    void renderList();
  });

  // 결과 요약·필터 칩·빈 상태의 동작은 위임으로 한 곳에서 처리한다
  document.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;

    if (target.closest("#show-hidden")) {
      state.filters.status = new Set<CourseStatus>(Object.keys(STATUS) as CourseStatus[]);
      paintChips();
      rerenderList();
      return;
    }
    if (target.closest("#keep-search-reset")) {
      const q2 = state.q;
      state.filters = defaultFilters();
      state.q = q2;
      $<HTMLInputElement>("#q").value = q2;
      $<HTMLSelectElement>("#f-sido").value = "";
      $<HTMLSelectElement>("#f-type").value = "";
      $<HTMLSelectElement>("#f-holes").value = "";
      $<HTMLSelectElement>("#f-fee").value = "";
      $<HTMLSelectElement>("#f-sort").value = "name";
      paintChips();
      rerenderList();
      return;
    }
    if (target.closest("#empty-reset")) {
      resetFilters(true);
      return;
    }
    if (target.closest("#empty-status")) {
      state.filters.status = new Set<CourseStatus>(Object.keys(STATUS) as CourseStatus[]);
      paintChips();
      rerenderList();
      return;
    }
    const clear = target.closest<HTMLElement>("[data-clear]");
    if (clear) {
      const key = clear.dataset.clear;
      if (key === "q") {
        state.q = "";
        $<HTMLInputElement>("#q").value = "";
        $<HTMLButtonElement>("#q-clear").hidden = true;
      } else if (key === "sido" || key === "type" || key === "holes" || key === "fee") {
        state.filters[key] = "";
        $<HTMLSelectElement>(`#f-${key}`).value = "";
      } else if (key === "sort") {
        state.filters.sort = "name";
        $<HTMLSelectElement>("#f-sort").value = "name";
      } else if (key === "status") {
        state.filters.status = new Set<CourseStatus>(["operating"]);
        paintChips();
      }
      rerenderList();
      return;
    }

    // 카드 → 상세로 갈 때 목록 스크롤 위치를 기억한다
    const card = target.closest<HTMLAnchorElement>("a[data-card]");
    if (card) state.pendingScroll = window.scrollY;

    // '목록' 링크는 떠날 때의 필터 해시로 돌아가고, 보던 스크롤 위치도 그대로 복원한다.
    // 해시 내비게이션은 브라우저가 스크롤을 다시 계산하므로 pushState + 직접 라우팅으로 처리한다.
    const back = target.closest<HTMLAnchorElement>("[data-back]");
    if (back) {
      const href = back.getAttribute("href") || "#/";
      if (href !== location.hash) {
        ev.preventDefault();
        const y = state.pendingScroll;
        history.pushState(null, "", href);
        void route().then(() => {
          if (y === null) return;
          requestAnimationFrame(() => window.scrollTo(0, y));
          setTimeout(() => window.scrollTo(0, y), 140);
        });
        return;
      }
    }

    // 같은 영역을 다시 누르면 해시가 그대로라 hashchange 가 없다 — 직접 스크롤한다
    const link = target.closest<HTMLAnchorElement>(".section-nav a");
    const href = link?.getAttribute("href");
    if (link && href && href === location.hash) {
      ev.preventDefault();
      scrollToSection(href.slice(href.lastIndexOf("#") + 1));
    }
  });

  // 건너뛰기 링크 — 해시를 바꾸면 해시 라우터가 목록으로 되돌리므로 직접 포커스만 옮긴다
  document.getElementById("skip-link")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    const main = $<HTMLElement>("#main");
    main.focus();
    main.scrollIntoView();
  });

  wireSearchDialog();
  wireFilterDetails();
  wireShortcuts();
}

function wireSearchDialog(): void {
  const dialog = $<HTMLDialogElement>("#search-dialog");
  const input = $<HTMLInputElement>("#search-input");
  const open = $<HTMLButtonElement>("#search-open");
  const close = (): void => {
    if (dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  };
  open.addEventListener("click", () => {
    input.value = state.q || $<HTMLInputElement>("#q").value;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    input.focus();
    input.select();
  });
  $<HTMLButtonElement>("#search-cancel").addEventListener("click", close);
  $<HTMLFormElement>("#search-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    state.q = text;
    $<HTMLInputElement>("#q").value = text;
    $<HTMLButtonElement>("#q-clear").hidden = !text;
    close();
    if (location.hash.replace(/^#/, "").split("?")[0] === "/") rerenderList();
    else location.hash = hashQueryFromState();
  });
  dialog.addEventListener("close", () => open.focus());
}

/** 좁은 화면에서는 필터를 접어 두고, 넓은 화면에서는 펼쳐 둔다 */
function wireFilterDetails(): void {
  const details = $<HTMLDetailsElement>("#filter-details");
  const wide = window.matchMedia("(min-width: 900px)");
  // 첫 페인트 전 상태는 index.html 인라인 스크립트가 정한다. 여기서는 창 폭이 바뀔 때만 맞춘다.
  wide.addEventListener("change", () => { if (wide.matches) details.open = true; });
}

function wireShortcuts(): void {
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "/" || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const target = ev.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
    }
    ev.preventDefault();
    const onList = !$<HTMLElement>("#view-list").hidden;
    if (onList) $<HTMLInputElement>("#q").focus();
    else $<HTMLButtonElement>("#search-open").click();
  });
}

function resetFilters(scrollTop: boolean): void {
  state.filters = defaultFilters();
  state.q = "";
  $<HTMLInputElement>("#q").value = "";
  $<HTMLButtonElement>("#q-clear").hidden = true;
  $<HTMLSelectElement>("#f-sido").value = "";
  $<HTMLSelectElement>("#f-type").value = "";
  $<HTMLSelectElement>("#f-holes").value = "";
  $<HTMLSelectElement>("#f-fee").value = "";
  $<HTMLSelectElement>("#f-sort").value = "name";
  paintChips();
  if (scrollTop) window.scrollTo({ top: 0, behavior: "smooth" });
  rerenderList();
}

/**
 * 관리자 모드를 켜고 끄면 화면을 다시 그린다 — 출처 노출과 푸터·기준일 표기가 모드에 따라 다르다.
 */
function reRenderForAdmin(): void {
  if (!state.index) return;
  const y = window.scrollY;
  paintFooterMeta();
  void route().then(() => {
    requestAnimationFrame(() => window.scrollTo(0, y));
  });
}

try { history.scrollRestoration = "manual"; } catch { /* 지원하지 않는 브라우저 */ }

initTheme();
initAdmin(reRenderForAdmin);
wire();
void boot();
