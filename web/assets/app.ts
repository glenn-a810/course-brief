import type {
  AlertPeriod,
  ClusterFile,
  ClusterInfo,
  CourseDetail,
  CourseIndex,
  CourseIndexItem,
  CourseOps,
  CourseStatus,
  CoverageArea,
  DatasetCounts,
  ExtraCourse,
  FacilityKey,
  FeeTableRow,
  NearbyDeliveryProvider,
  OpsKey,
  RentalProvidersFile,
  SearchAdapter,
  SearchConfig,
  SidoFile,
  SidoInfo,
  SiteConfig,
} from "../../shared/types";
import { createSearchAdapter } from "./search.js";
import {
  STATUS, badge, debounce, esc, fmtDate, fmtKB, fmtNum, fmtPct, fmtWon, isCourseStatus, isMissing, statusOf, textOf,
} from "./util.js";
import type { BadgeTone } from "./util.js";

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

const OPS: Record<OpsKey, string> = {
  nocaddie: "노캐디", two_player: "2인 플레이", three_player: "3인 플레이",
  five_player: "5인 플레이", marshal_caddie: "마샬 캐디", cart_type: "카트 종류",
  cart_entry: "카트 페어웨이 진입", bagdrop: "셀프 백드롭", mat: "매트 티샷",
  checkin: "체크인", locker: "락카", sauna: "사우나", dress: "복장 규정", pace: "진행 속도",
};
const FAC: Record<FacilityKey, string> = {
  practice: "연그린·연습장", indoor_range: "실내 연습장", food: "식당·조식",
  snack_bar: "그늘집·스낵", locker_sauna: "락카·사우나", lodging: "숙박",
  other: "기타 시설", night: "야간 라운드", closed_days: "휴장일", shuttle: "셔틀",
  ev_charge: "전기차 충전", proshop: "프로샵",
};
const GRASS: Record<"tee" | "fairway" | "green", string> = { tee: "티잉구역", fairway: "페어웨이", green: "그린" };
const LEVEL: Record<string, BadgeTone> = { info: "info", caution: "warn", closure: "danger" };

const SORT_KEYS = ["name", "fee-asc", "fee-desc", "holes-desc"] as const;
type SortKey = (typeof SORT_KEYS)[number];

function isSortKey(v: string | null | undefined): v is SortKey {
  return typeof v === "string" && (SORT_KEYS as readonly string[]).includes(v);
}

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
  /** fee 가 주말가인지 주중가인지. 라벨을 값 출처에 맞춰 표기한다 */
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
  matches: Map<string, number> | null;
  groups: CourseGroup[];
  navToken: number;
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
  matches: null,
  groups: [],
  navToken: 0,
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

/* ---------------- 데이터 ---------------- */
/**
 * JSON 경계. 원격 데이터는 스키마(`data/v29/schema.md`)를 따르며,
 * 여기서는 T 로 좁혀서 넘긴다(필드 단위 검증은 data:check 담당).
 */
async function loadJSON<T>(name: string): Promise<T> {
  const res = await fetch(`${CONFIG.dataBase}${name}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  return (await res.json()) as T;
}

async function boot(): Promise<void> {
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
    window.addEventListener("hashchange", () => { state.shown = CONFIG.pageSize; void route(); });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    $<HTMLElement>("#results").innerHTML = `<div class="error-box">
      <strong>데이터를 불러오지 못했습니다.</strong>
      <p>${esc(message)}</p>
      <p>정적 서버로 열어야 합니다. 리포지토리에서 <code>npm run preview</code> 또는 <code>npm run build</code> 후 <code>npx serve dist</code> 로 확인하세요.</p>
    </div>`;
  }
}

function statusCount(counts: DatasetCounts, status: CourseStatus): number {
  return counts[status] ?? 0;
}

function buildStaticUI(): void {
  const d = getIndex().dataset;
  $<HTMLElement>("#hero-count").textContent = String(d.counts.total);
  $<HTMLElement>("#footer-meta").textContent =
    `${d.version} · ${fmtDate(d.built_at)} 기준 · ${d.counts.total}곳 (상세 ${d.counts.with_detail} / 요약 ${d.counts.master_only})`;

  const sel = $<HTMLSelectElement>("#f-sido");
  for (const s of state.sido) {
    const o = document.createElement("option");
    o.value = s.code;
    o.textContent = `${sidoLabel(s)} (${s.count})`;
    sel.appendChild(o);
  }
  const chips = $<HTMLElement>("#status-chips");
  for (const btn of chips.querySelectorAll<HTMLButtonElement>(".chip")) {
    const st = btn.dataset.status;
    if (!isCourseStatus(st)) continue;
    btn.innerHTML = `${esc(STATUS[st].label)}<span class="n">${statusCount(d.counts, st)}</span>`;
    btn.setAttribute("aria-pressed", state.filters.status.has(st) ? "true" : "false");
  }
}

/* ---------------- 상태·URL ---------------- */
/**
 * 지역 셀렉트 라벨. 코드 12는 전남·광주 통합특별시라 데이터 약칭이 한쪽만 남는데,
 * 그대로 쓰면 전남 44곳이 '광주' 하나로 가려지므로 두 지역명을 함께 표기한다.
 */
function sidoLabel(s: SidoInfo): string {
  if (s.code === "12") return "전남·광주";
  return s.short || s.name;
}

/** `#/?q=…` 의 쿼리만 읽는다. 상세 영역 앵커(`#/c/x#s3`)가 붙어도 안전하게 */
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
  if (!params) return;
  state.q = params.get("q") ?? "";
  $<HTMLInputElement>("#q").value = state.q;
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
  for (const btn of $<HTMLElement>("#status-chips").querySelectorAll<HTMLButtonElement>(".chip")) {
    const status = btn.dataset.status;
    const on = isCourseStatus(status) && f.status.has(status);
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
      members: members.sort((a, b) => (b.holes ?? 0) - (a.holes ?? 0)),
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

function passesFilters(c: CourseIndexItem): boolean {
  const f = state.filters;
  if (f.status.size && !f.status.has(c.status)) return false;
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

async function renderList({ reset = false }: { reset?: boolean } = {}): Promise<void> {
  const index = getIndex();
  const courses = index.courses;
  let allowed: Map<string, number> | null = null;
  if (state.q) {
    const res = await getAdapter().search({ text: state.q, limit: 0 });
    allowed = new Map((res ?? []).map((r) => [r.id, r.score]));
    $<HTMLElement>("#search-mode").hidden = false;
    $<HTMLElement>("#search-mode").textContent = `${getAdapter().label} · ${allowed.size}건 일치`;
  } else {
    $<HTMLElement>("#search-mode").hidden = true;
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

  const totalCourses = courses.length;
  const n = groups.length;
  const stLabel = state.filters.status.size
    ? [...state.filters.status].map((s) => statusOf(s).label).join("·")
    : "전체";
  $<HTMLElement>("#result-count").textContent =
    `${stLabel} · ${n.toLocaleString("ko-KR")}개 시설 / ${filtered.length.toLocaleString("ko-KR")}개 구장 (전체 ${totalCourses}곳)`;

  if (reset) state.shown = CONFIG.pageSize;
  const slice = groups.slice(0, state.shown);
  $<HTMLElement>("#results").innerHTML = slice.map(cardHTML).join("");
  $<HTMLElement>("#empty").hidden = n > 0;
  $<HTMLElement>("#more").hidden = n <= state.shown;
  $<HTMLElement>("#more").textContent = `더 보기 (${state.shown} / ${n})`;
}

function cardHTML(g: CourseGroup): string {
  const s = g.statuses.length === 1 ? g.statuses[0] : "operating";
  const st = statusOf(s);
  const fee = g.fee;
  // 라벨은 값의 출처를 따른다 — 주말가가 없어 주중가를 쓴 카드에 '주말'을 붙이면 오표기가 된다
  const feeLabel = g.feeKind === "weekday" ? "주중" : "주말";
  // 폐업·휴업 구장의 요금은 마지막 확인값이다. 예약 가능한 정상가처럼 보이지 않게 표기한다
  const stale = g.statuses.every((x) => x === "closed" || x === "suspended");
  const feeLine = fee == null
    ? `<span>그린피 <b>미확인</b></span>`
    : stale
      ? `<span class="fee-stale">마지막 확인 · ${feeLabel} <b>${fmtWon(fee)}</b></span>`
      : `<span>${feeLabel} <b>${fmtWon(fee)}</b>~</span>`;
  const title = g.members.length > 1 ? `${g.name} (${g.holes}홀)` : g.name;
  const sub = g.members.length > 1
    ? g.members.map((m) => `${m.name} ${m.holes ? m.holes + "홀" : ""}`.trim()).join(" + ")
    : `${g.sido || ""} ${g.sigungu || ""}`.trim();

  const memberLinks = g.members.length > 1
    ? `<div class="card-members">${g.members.map((m) => {
        const ms = statusOf(m.status);
        return `<a href="#/c/${esc(m.id)}">${esc(m.name)}${m.holes ? ` · ${m.holes}홀` : ""}${
          m.status !== "operating" ? ` <span class="badge ${ms.tone}">${esc(ms.label)}</span>` : ""}</a>`;
      }).join("")}</div>`
    : "";

  const body = `
    <div class="card-top">
      <div>
        <div class="card-name">${esc(title)}</div>
        <div class="card-sub">${esc(sub)}</div>
      </div>
      ${badge(st.tone, st.label)}
    </div>
    <div class="card-meta">
      ${g.holes ? `<span class="tag">${g.holes}홀</span>` : ""}
      ${g.members[0].type ? `<span class="tag">${esc(g.members[0].type)}</span>` : ""}
      ${g.members.length > 1 ? `<span class="tag">시설 ${g.members.length}개 코스</span>` : ""}
      ${g.members[0].detail ? "" : `<span class="tag">요약 데이터</span>`}
    </div>
    ${memberLinks}
    <div class="card-fee">${feeLine}</div>`;

  if (g.members.length === 1) {
    return `<a class="card" href="#/c/${esc(g.members[0].id)}">${body}</a>`;
  }
  return `<div class="card card-group">
      <div class="card-top">
        <div>
          <div class="card-name">${esc(title)}</div>
          <div class="card-sub">${esc(sub)}</div>
        </div>
        ${badge(st.tone, st.label)}
      </div>
      <div class="card-meta">
        ${g.holes ? `<span class="tag">합산 ${g.holes}홀</span>` : ""}
        <span class="tag">같은 부지 ${g.members.length}개 코스</span>
      </div>
      <div class="card-members">${g.members.map((m) => {
        const ms = statusOf(m.status);
        return `<a href="#/c/${esc(m.id)}">${esc(m.name)}${m.holes ? ` · ${m.holes}홀` : ""}${
          m.status !== "operating" ? ` <span class="badge ${ms.tone}">${esc(ms.label)}</span>` : ""}</a>`;
      }).join("")}</div>
      <div class="card-fee">${feeLine}</div>
    </div>`;
}

/* ---------------- 상세 ---------------- */
/** 현재 상세 DOM 에 그려진 구장 id. 같은 구장의 영역 앵커 이동은 다시 그리지 않는다 */
let renderedDetailId: string | null = null;

async function renderDetail(id: string): Promise<void> {
  const index = getIndex();
  const course = index.courses.find((c) => c.id === id);
  if (!course) {
    renderedDetailId = null; // 없는 id 뒤에 이전 구장 주소로 돌아오면 다시 그려야 한다
    $<HTMLElement>("#view-detail").innerHTML = `<div class="page"><div class="error-box">해당 골프장을 찾을 수 없습니다. <a href="#/">목록으로</a></div></div>`;
    return;
  }
  let detail: CourseDetail | null = null;
  if (course.detail) {
    try {
      detail = await loadJSON<CourseDetail>(`courses/${id}.json`);
    } catch (e) {
      console.warn(e);
    }
  }
  const cluster = course.cluster ? state.clusters.get(course.cluster) ?? null : null;
  const others: Array<{ name: string; id?: string; holes?: number | null }> = cluster
    ? (cluster.members ?? []).filter((m) => m !== course.name).map((name) => {
        const mc = index.courses.find((c) => c.name === name);
        return mc ? { name, id: mc.id, holes: mc.holes } : { name };
      })
    : [];

  const st = statusOf(course.status);
  const head = `
    <a class="back" href="#/">← 목록</a>
    <div class="detail-head">
      <h1 class="detail-title">${esc(course.name)}</h1>
      ${course.aliases?.length ? `<p class="detail-alias">${esc(course.aliases.slice(0, 6).join(" · "))}</p>` : ""}
      <div class="detail-badges">
        ${badge(st.tone, st.label)}
        ${course.holes ? badge("neutral", `${course.holes}홀`) : ""}
        ${course.type ? badge("neutral", course.type) : ""}
        ${course.detail ? "" : badge("neutral", "요약 데이터")}
      </div>
      ${course.status !== "operating" ? `<div class="callout ${st.tone === "neutral" ? "info" : st.tone}" style="margin-top:14px">
        <strong>${esc(st.label)}</strong>${esc(course.status_note || "현재 예약·이용이 어려운 상태입니다.")}
      </div>` : ""}
      <dl class="detail-facts">
        <div><dt>지역</dt><dd>${esc([course.sido, course.sigungu].filter(Boolean).join(" "))}</dd></div>
        <div><dt>주소</dt><dd>${esc(detail?.master?.address || "—")}</dd></div>
        <div><dt>대표전화</dt><dd>${course.tel ? `<a href="tel:${esc(course.tel.replace(/[^\d+]/g, ""))}">${esc(course.tel)}</a>` : "—"}</dd></div>
        <div><dt>홈페이지</dt><dd>${course.homepage ? `<a href="${esc(course.homepage)}" target="_blank" rel="noopener noreferrer">${esc(shortUrl(course.homepage))}</a>` : "—"}</dd></div>
        <div><dt>그린피</dt><dd>${feeSummaryText(course)}</dd></div>
        <div><dt>좌표</dt><dd>${course.lat != null && course.lng != null ? `<a href="https://www.google.com/maps?q=${course.lat},${course.lng}" target="_blank" rel="noopener noreferrer">${course.lat.toFixed(5)}, ${course.lng.toFixed(5)}</a>` : "—"}</dd></div>
      </dl>
    </div>`;

  const clusterBox = cluster ? `<div class="callout info">
      <strong>같은 부지 시설 ${cluster.members?.length || 1}개 코스</strong>
      ${esc(cluster.relationship || cluster.basis || "같은 소재지의 코스가 별도 레코드로 등록되어 있습니다.")}
      ${others.length ? `<div class="tags" style="margin-top:8px">${others.map((o) =>
        o.id ? `<a class="tag" href="#/c/${esc(o.id)}">${esc(o.name)}${o.holes ? ` · ${o.holes}홀` : ""} →</a>`
             : `<span class="tag">${esc(o.name)}</span>`).join("")}</div>` : ""}
    </div>` : "";

  // 요약 데이터만 있는 구장은 s1 하나뿐이라 7개 영역 내비를 두면 죽은 링크가 된다
  const nav = !detail ? "" : `
    <nav class="section-nav" aria-label="상세 영역">
      <a href="#/c/${esc(id)}#s1">기본·입지</a>
      <a href="#/c/${esc(id)}#s2">코스 스펙</a>
      <a href="#/c/${esc(id)}#s3">요금·예약</a>
      <a href="#/c/${esc(id)}#s4">현장 운영</a>
      <a href="#/c/${esc(id)}#s5">부대시설</a>
      <a href="#/c/${esc(id)}#s6">브리핑·공지</a>
      <a href="#/c/${esc(id)}#s7">클럽 렌탈</a>
    </nav>`;

  const body = detail ? sections(detail, course) : `
    <section class="section" id="s1"><h2><span class="num">01</span>기본 정보</h2>
      <div class="section-body"><div class="callout">이 구장은 <strong>요약 데이터만</strong> 있습니다(건설중·폐업 등으로 상세 수집 전).
      마스터 정보(주소·좌표·홀수·상태)는 위에 표시된 값이 전부입니다.</div></div></section>`;

  $<HTMLElement>("#view-detail").innerHTML = `<div class="detail">${head}${clusterBox}${nav}${body}</div>`;
  renderedDetailId = id;
  window.scrollTo({ top: 0 });
}

/** 상세 영역 앵커(`#/c/{id}#s3`) 이동. 상세를 그린 뒤라야 대상 섹션이 DOM 에 있다 */
function scrollToSection(section: string): void {
  const target = document.getElementById(section);
  if (target) target.scrollIntoView({ block: "start" });
}

function shortUrl(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

function feeSummaryText(c: CourseIndexItem): string {
  const f = c.green_fee;
  if (!f) return "미확인";
  const parts: string[] = [];
  if (f.weekday) parts.push(`주중 ${fmtWon(f.weekday)}`);
  if (f.weekend) parts.push(`주말 ${fmtWon(f.weekend)}`);
  if (!parts.length) return "미확인";
  return `${parts.join(" / ")} <span class="sub">${f.basis === "official" ? "공식 요금표" : "실거래 관측 최저가"}${f.as_of ? ` · ${fmtDate(f.as_of)}` : ""}</span>`;
}

function valCell(v: unknown): string | null {
  if (isMissing(v)) return null;
  const t = textOf(v);
  if (!t || t === "미확인") return null;
  return t;
}

function evidenceDetails(evidence: unknown, label = "근거"): string {
  const arr: unknown[] = Array.isArray(evidence) ? evidence.filter(Boolean).slice(0, 3) : [];
  if (!arr.length) return "";
  return `<details class="ev"><summary>${esc(label)} ${arr.length}건</summary><ul>${arr
    .map((e) => `<li>${esc(String(e).slice(0, 220))}</li>`).join("")}</ul></details>`;
}

function kvRow(label: string, value: string, sub = ""): string {
  return `<div class="kv"><dt>${esc(label)}</dt><dd>${value}${sub ? `<span class="sub">${sub}</span>` : ""}</dd></div>`;
}

/** 추가 코스는 객체 배열이다. 그대로 String() 하면 '[object Object]' 가 되므로 필드별로 편다 */
function extraCoursesHTML(list: Array<ExtraCourse | string>): string {
  return list.map((raw) => {
    const x: ExtraCourse = typeof raw === "string" ? { name: raw } : raw;
    const title = [x.name ?? "추가 코스", x.holes ? `${x.holes}홀` : "", x.type ?? ""]
      .filter(Boolean).join(" · ");
    const facts = [
      x.open_hours ? `운영 ${x.open_hours}` : "",
      x.closed ? `휴장 ${x.closed}` : "",
      x.tel ? `전화 ${x.tel}` : "",
      x.fee ? `요금 ${x.fee}` : "",
    ].filter(Boolean).join(" · ");
    return `<div class="extra-course">
      <strong>${esc(title)}</strong>
      ${facts ? `<div class="sub">${esc(facts)}</div>` : ""}
      ${x.note ? `<div class="sub">${esc(x.note)}</div>` : ""}
    </div>`;
  }).join("");
}

/** '미확인 N개' 목록은 기본 접힘으로 두어 본문 가독성을 지킨다 */
function unconfirmedList(labels: string[]): string {
  return `<details class="unconfirmed"><summary>미확인 ${labels.length}개</summary><p>${esc(labels.join(", "))}</p></details>`;
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

function sections(d: CourseDetail, c: CourseIndexItem): string {
  const m = d.master ?? {};
  const co = d.course ?? {};
  const fee = d.fee ?? {};
  const cancel = d.cancel ?? {};
  const ops: CourseOps = d.ops ?? {};
  const fac = d.facilities ?? {};
  const br = d.briefing ?? {};
  const rt = d.rental ?? {};
  const cov = d.coverage ?? {};

  /* 01 기본·입지 */
  const holes = m.holes ?? {};
  const nameVariants = m.name_variants ?? [];
  const mergedIds = m.merged_ids ?? [];
  const holeText = [
    holes.total ? `총 ${holes.total}홀` : null,
    holes.member ? `회원 ${holes.member}` : null,
    holes.public ? `대중 ${holes.public}` : null,
    holes.non_member ? `비회원 ${holes.non_member}` : null,
  ].filter(Boolean).join(" · ");
  const s1 = `
  <section class="section" id="s1">
    <h2><span class="num">01</span>기본·입지</h2>
    <p class="section-desc">규모·소재·접근성. 값 뒤의 출처는 데이터 원본 표기입니다.</p>
    <div class="section-body">
      ${kvRow("홀 구성", esc(holeText || "미확인"), m.holes_note ? esc(m.holes_note) : "")}
      ${kvRow("이용형태", esc(m.type || c.type || "미확인"), m.type_note ? esc(m.type_note) : "")}
      ${kvRow("개장", esc(m.opened || "미확인"), m.opened_note ? esc(m.opened_note) : "")}
      ${kvRow("면적", m.area_sqm ? `${fmtNum(m.area_sqm)}㎡ (${fmtNum(Math.round(m.area_sqm / 3.3058))}평)` : "미확인")}
      ${kvRow("운영사", esc((m.operators ?? []).join(", ") || "미확인"), m.operators_note ? esc(m.operators_note) : "")}
      ${m.designer ? kvRow("설계", esc(textOf(m.designer))) : ""}
      ${kvRow("주소", esc(m.address || "미확인"), m.address_note ? esc(m.address_note) : "")}
      ${m.nearest_ic ? kvRow("최단 IC", `${esc(m.nearest_ic.name)}${m.nearest_ic.distance_km ? ` · ${m.nearest_ic.distance_km}km` : ""}`, esc(m.nearest_ic.source || "")) : ""}
      ${m.nearest_ic_note ? kvRow("IC 비고", esc(m.nearest_ic_note)) : ""}
      ${m.expected_open ? kvRow("개장 예정", esc(m.expected_open), esc(m.project_stage || "")) : ""}
      ${m.access === "military_only" ? `<div class="callout warn"><strong>군 전용 체력단련장</strong>일반인 이용이 제한되는 시설입니다(현역·군인공제회 등).</div>` : ""}
      ${nameVariants.length > 1 ? kvRow("이명·구 명칭", esc(nameVariants.slice(0, 8).join(", "))) : ""}
      ${mergedIds.length ? kvRow("병합된 레코드", esc(mergedIds.join(", ")), "중복 등록이 확인되어 하나로 합친 구장입니다") : ""}
    </div>
  </section>`;

  /* 02 코스 스펙 */
  const grass = co.grass ?? {};
  const grassRows = (Object.keys(GRASS) as Array<keyof typeof GRASS>).map((k) => {
    const g = grass[k];
    if (isMissing(g)) return null;
    if (typeof g === "object" && g !== null && g.value === undefined && g.evidence) return null;
    const t = valCell(g);
    return t ? kvRow(`잔디 · ${GRASS[k]}`, esc(t)) : null;
  }).filter((row): row is string => row !== null).join("");

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
          <td>${fmtNum(t.length_yds)}</td><td>${fmtNum(t.course_rating, 1)}</td><td>${fmtNum(t.slope_rating)}</td></tr>`);
      }
    }
    if (rows.length) {
      kgaHTML = `<div class="table-wrap"><table>
        <thead><tr><th>조합</th><th>티</th><th>성별</th><th>길이(yd)</th><th>코스레이팅</th><th>슬로프</th></tr></thead>
        <tbody>${rows.join("")}</tbody></table></div>
        <p class="section-desc">출처: 대한골프협회(KGA) 코스레이팅™/슬로프레이팅™ · 18홀 조합 단위</p>`;
    }
  }

  const s2 = `
  <section class="section" id="s2">
    <h2><span class="num">02</span>코스 스펙</h2>
    <p class="section-desc">홀수·파·길이·잔디와 KGA 공식 레이팅. 레이팅은 난이도 비교의 1차 기준입니다.</p>
    <div class="section-body">
      ${kvRow("홀수 / 파", esc([co.holes ? `${co.holes}홀` : null, co.par ? `파 ${co.par}` : null].filter(Boolean).join(" / ") || "미확인"))}
      ${co.length_m ? kvRow("전장", `${fmtNum(co.length_m)}m (${fmtNum(Math.round(co.length_m * 1.0936))}yd)`) : ""}
      ${(co.blocks ?? []).length ? kvRow("코스 구성", esc((co.blocks ?? []).join(", "))) : ""}
      ${(m.course_blocks ?? []).length ? kvRow("세부 코스명", esc((m.course_blocks ?? []).join(", "))) : ""}
      ${co.course_names ? kvRow("코스명", esc(textOf(co.course_names))) : ""}
      ${kvRow("야간 라운드", isMissing(co.night_light) ? "미확인" : esc(textOf(co.night_light)))}
      ${grassRows}
      ${co.kga_hole_est ? kvRow("KGA 추정 홀수", esc(String(co.kga_hole_est))) : ""}
      ${(co.extra_courses ?? []).length ? kvRow("추가 코스", extraCoursesHTML(co.extra_courses ?? [])) : ""}
      ${kgaHTML ? `<div>${kgaHTML}</div>` : ""}
      ${co.hole_by_hole ? `<details class="ev"><summary>홀별 파·거리 보기</summary><pre class="pre">${esc(JSON.stringify(co.hole_by_hole, null, 1))}</pre></details>` : ""}
    </div>
  </section>`;

  /* 03 요금·예약·취소 */
  const unavailable = c.status === "closed" || c.status === "suspended";
  const asOf = fee.as_of || fee.checked_at;
  const member = fee.member;
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
    const groupHTML = (g: { sec: string; rows: FeeTableRow[] }): string =>
      `<tr class="group"><th colspan="2">${esc(g.sec === "구분" ? "요금" : g.sec)}</th></tr>` +
      g.rows.map((r) => {
        const label = r.label && r.label !== g.sec ? r.label : "";
        return `<tr><td>${esc(label)}</td><td class="num">${esc(r.value || "")}</td></tr>`;
      }).join("");
    const body = groups.map(groupHTML).join("");
    const table = `<div class="table-wrap"><table class="fee-table"><tbody>${body}</tbody></table></div>`;
    // 행이 많으면 기본은 접어 둔다(요금 섹션이 표에 잠식되지 않게)
    if (groups.length > 2 || rows.length > 8) {
      return `<details class="ev"><summary>공식 요금표 ${rows.length}개 항목 펼치기</summary>${table}</details>`;
    }
    return table;
  })();
  const od = fee.official_detail ?? {};
  const s3 = `
  <section class="section" id="s3">
    <h2><span class="num">03</span>요금·예약·취소</h2>
    <p class="section-desc">1인 18홀 비회원 기준 정상가. 시즌·시간대·예약 경로에 따라 달라지므로 예약 화면에서 최종 확인하세요.</p>
    <div class="section-body">
      ${unavailable ? `<div class="callout warn"><strong>현재 이용 불가 구장입니다</strong>아래 요금은 마지막으로 확인된 값이며 예약·결제할 수 없습니다.</div>` : ""}
      <div class="fee-grid">
        <div class="fee-box"><div class="label">주중</div><div class="value">${fmtWon(fee.weekday)}</div>${fee.weekday_text ? `<div class="note">${esc(fee.weekday_text)}</div>` : ""}</div>
        <div class="fee-box"><div class="label">주말·공휴일</div><div class="value">${fmtWon(fee.weekend)}</div>${fee.weekend_text ? `<div class="note">${esc(fee.weekend_text)}</div>` : ""}</div>
        <div class="fee-box"><div class="label">카트</div><div class="value">${fee.cart?.value != null ? fmtWon(fee.cart.value) : "미확인"}</div><div class="note">${esc(fee.cart?.text || "")}</div></div>
        <div class="fee-box"><div class="label">캐디피</div><div class="value">${fee.caddie?.none ? "노캐디" : fee.caddie?.value != null ? fmtWon(fee.caddie.value) : "미확인"}</div><div class="note">${esc(fee.caddie?.text || "")}</div></div>
      </div>
      ${fee.basis || asOf ? `<p class="section-desc">${esc(fee.basis || "")}${asOf ? ` · 확인 ${fmtDate(asOf)}` : ""}</p>` : ""}
      ${fee.market ? kvRow("실거래 관측 최저", `${fee.market.weekday_min ? `주중 ${fmtWon(fee.market.weekday_min)}` : ""}${fee.market.weekday_min && fee.market.weekend_min ? " · " : ""}${fee.market.weekend_min ? `주말 ${fmtWon(fee.market.weekend_min)}` : ""}`, esc(fee.market.note || fee.market.source || "")) : ""}
      ${member ? kvRow("회원제 요금", `${member.weekday ? `주중 ${fmtWon(member.weekday)}` : ""}${member.weekend ? ` · 주말 ${fmtWon(member.weekend)}` : ""}`.trim() || "미확인", esc(member.note || "")) : ""}
      ${od.green_detail ? kvRow("공식 요금 상세", esc(od.green_detail), esc(od.checked_at ? `확인 ${fmtDate(od.checked_at)}` : "")) : ""}
      ${od.cart_detail ? kvRow("카트", esc(od.cart_detail)) : ""}
      ${od.caddie_detail ? kvRow("캐디", esc(od.caddie_detail)) : ""}
      ${od.facility_fee ? kvRow("시설 이용료", esc(textOf(od.facility_fee))) : ""}
      ${od.rental ? kvRow("클럽 대여", esc(textOf(od.rental))) : ""}
      ${tableHTML}
      ${kvRow("예약 오픈", esc(cancel.open_cycle || "미확인"))}
      ${kvRow("취소 규정", esc(typeof cancel.cancel_policy === "string" ? cancel.cancel_policy : cancel.cancel_policy ? JSON.stringify(cancel.cancel_policy) : "미확인"), esc(cancel.notes || ""))}
      ${evidenceDetails(cancel.evidence, "취소·위약 근거")}
      ${evidenceDetails(cancel.weather_evidence, "악천후 정산 근거")}
      ${fee.note ? kvRow("요금 비고", esc(fee.note)) : ""}
      ${(fee.sources ?? []).length ? `<p class="section-desc">출처: ${(fee.sources ?? []).slice(0, 4).map((s) => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.source || shortUrl(s.url))}</a>` : esc(s.source || "")).join(" · ")}</p>` : ""}
    </div>
  </section>`;

  /* 04 현장 운영 */
  const opsRows: string[] = [];
  const opsUnknown: string[] = [];
  for (const k of Object.keys(OPS) as OpsKey[]) {
    const v = ops[k];
    if (!v) { opsUnknown.push(OPS[k]); continue; }
    const t = valCell(v.value);
    if (t) opsRows.push(kvRow(OPS[k], esc(t), evidenceDetails(v.evidence)));
    else opsUnknown.push(OPS[k]);
  }
  const s4 = `
  <section class="section" id="s4">
    <h2><span class="num">04</span>현장 운영</h2>
    <p class="section-desc">노캐디·인원·카트·체크인처럼 예약 전에 알아야 하는 실제 플레이 조건.</p>
    <div class="section-body">
      ${opsRows.join("") || `<div class="callout">공식 채널에서 확인된 운영 정보가 아직 없습니다. 아래 항목은 전화·현장 확인이 필요합니다.</div>`}
      ${opsUnknown.length ? unconfirmedList(opsUnknown) : ""}
    </div>
  </section>`;

  /* 05 부대시설 */
  const facRows: string[] = [];
  const facUnknown: string[] = [];
  for (const k of Object.keys(FAC) as FacilityKey[]) {
    const v = fac[k];
    if (!v) { facUnknown.push(FAC[k]); continue; }
    const t = valCell(v.value);
    if (t) facRows.push(kvRow(FAC[k], esc(t), evidenceDetails(v.evidence)));
    else facUnknown.push(FAC[k]);
  }
  const s5 = `
  <section class="section" id="s5">
    <h2><span class="num">05</span>부대시설</h2>
    <p class="section-desc">연습·식음·락카·숙박·야간 조명 등 라운드 환경.</p>
    <div class="section-body">
      ${facRows.join("") || `<div class="callout">확인된 부대시설 정보가 없습니다.</div>`}
      ${facUnknown.length ? unconfirmedList(facUnknown) : ""}
      ${(fac.gf_facilities ?? []).length ? `<p class="section-desc">참고: ${esc((fac.gf_facilities ?? []).slice(0, 3).join(" / "))}</p>` : ""}
    </div>
  </section>`;

  /* 06 브리핑·공지 */
  const alert = br.alert;
  const noticeTags = br.notices?.tags;
  const noticeUrl = br.notices?.url;
  const notices = (br.notices?.items ?? []).slice(0, 10);
  const noticeHTML = notices.length ? `<ul class="notice-list">${notices.map((n) => {
    const link = typeof n.url === "string" && /^https?:/.test(n.url);
    const title = link && n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title ?? "")}</a>` : esc(n.title ?? "");
    return `<li><time>${esc(fmtDate(n.date))}</time><span>${title}</span></li>`;
  }).join("")}</ul>` : `<p class="section-desc">최근 공지를 확인하지 못했습니다. 공지 게시판이 없거나 이미지 본문만 있는 경우입니다.</p>`;
  const period = alert ? periodText(alert.period) : "";
  const s6 = `
  <section class="section" id="s6">
    <h2><span class="num">06</span>브리핑·공지</h2>
    <p class="section-desc">휴장·에어레이션·요금 변경 같은 최근 공지와 라운더 평가. 예약 전에 가장 먼저 볼 영역입니다.</p>
    <div class="section-body">
      ${alert ? `<div class="callout ${(alert.level ? LEVEL[alert.level] : undefined) ?? "info"}">
        <strong>${esc(alert.summary || (alert.confirmed ? "확인된 공지" : "확인 필요"))}</strong>
        ${esc(alert.detail || "")}
        ${period ? `<div class="sub">기간: ${esc(period)}</div>` : ""}
        ${alert.source_url ? `<div class="sub"><a href="${esc(alert.source_url)}" target="_blank" rel="noopener noreferrer">근거 보기</a></div>` : ""}
      </div>` : ""}
      ${br.review && br.review.score_10 != null ? kvRow("라운더 평가", `${fmtNum(br.review.score_10, 1)} / 10${br.review.count ? ` · ${fmtNum(br.review.count)}건` : ""}`, esc(br.review.note || br.review.source || "")) : ""}
      ${br.course_notes ? kvRow("코스 메모", esc(br.course_notes)) : ""}
      ${br.recent_notice_text ? kvRow("공지 요약", esc(br.recent_notice_text)) : ""}
      <div>
        <h3 class="h3">최근 공지</h3>
        ${noticeHTML}
      </div>
      ${noticeTags && Object.keys(noticeTags).length ? `<div class="tags">${Object.entries(noticeTags).slice(0, 6).map(([tag, arr]) =>
        `<span class="tag">${esc(tag)} ${Array.isArray(arr) ? arr.length : ""}</span>`).join("")}</div>` : ""}
      ${noticeUrl ? `<p class="section-desc">공지 게시판: ${/^https?:/.test(noticeUrl) ? `<a href="${esc(noticeUrl)}" target="_blank" rel="noopener noreferrer">${esc(shortUrl(noticeUrl))}</a>` : "수집 아카이브"}</p>` : ""}
      ${(br.unconfirmed ?? []).length ? unconfirmedList((br.unconfirmed ?? []).slice(0, 14)) : ""}
      ${br.collected_at ? `<p class="section-desc">수집 ${fmtDate(br.collected_at)}</p>` : ""}
      ${(br.sources ?? []).length ? `<p class="section-desc">출처: ${(br.sources ?? []).slice(0, 5).map((u) => /^https?:/.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(shortUrl(u))}</a>` : esc(u)).join(" · ")}</p>` : ""}
    </div>
  </section>`;

  /* 07 클럽 렌탈 */
  const nd = rt.nearby_delivery;
  const rentalRows: Array<[string, unknown]> = [
    ["대여 가능", rt.available], ["풀세트 요금", rt.full_set != null ? fmtWon(rt.full_set) : null],
    ["요금 안내", rt.fee_text], ["브랜드", rt.brand], ["좌타용", rt.left_handed],
    ["골프화", rt.shoes], ["9홀", rt.nine_hole], ["거리측정기", rt.range_finder],
    ["사전 예약", rt.reservation],
  ];
  const rentalRowsHTML = rentalRows
    .map(([label, v]) => {
      const t = valCell(v);
      return t ? kvRow(label, esc(t)) : null;
    })
    .filter((row): row is string => row !== null)
    .join("");
  const providers = (nd?.providers ?? []).map((p: NearbyDeliveryProvider) => `
    <div class="provider">
      <div class="provider-top">
        <span class="provider-name">${esc(p.name)}</span>
        ${badge(p.coverage === "O" ? "ok" : p.coverage === "조건부" ? "warn" : "neutral", p.coverage === "O" ? "권역 가능" : p.coverage || "미확인")}
      </div>
      <div class="provider-meta">${esc(p.basis || "")}</div>
      <div class="provider-meta">
        ${p.price_headline ? `${esc(p.price_headline)}` : ""}
        ${p.phone ? ` · <a href="tel:${esc(String(p.phone).replace(/[^\d+]/g, ""))}">${esc(p.phone)}</a>` : ""}
        ${p.operating_status ? ` · ${esc(p.operating_status)}` : ""}
      </div>
    </div>`).join("");
  const s7 = `
  <section class="section" id="s7">
    <h2><span class="num">07</span>클럽 렌탈</h2>
    <p class="section-desc">골프장 자체 대여와, 이 권역에 배송·픽업이 가능한 렌탈 업체. 해외 골퍼·장비 없는 라운드에 필요합니다.</p>
    <div class="section-body">
      ${rentalRowsHTML || `<div class="callout">골프장 자체 클럽 대여 정보가 확인되지 않았습니다.</div>`}
      ${evidenceDetails(rt.evidence, "대여 근거")}
      ${nd ? `<div>
        <h3 class="h3">${esc(nd.region || "")} 권역 렌탈·딜리버리 ${providers ? `(${nd.provider_count || (nd.providers ?? []).length}곳)` : ""}</h3>
        <div class="providers">${providers || `<p class="section-desc">이 권역에 확인된 배송 업체가 없습니다.</p>`}</div>
        <p class="section-desc">${esc(nd.note_code || "")}${nd.verified_at ? ` · 확인 ${esc(nd.verified_at)}` : ""}</p>
      </div>` : ""}
      <p class="section-desc"><a href="#/rental">전체 렌탈·딜리버리 업체 8곳 보기 →</a></p>
    </div>
  </section>`;

  const COVERAGE_LABELS: Array<[CoverageArea, string]> = [
    ["basic", "기본"], ["course", "코스"], ["fee", "요금"], ["ops", "운영"],
    ["facility", "시설"], ["briefing", "브리핑"], ["rental", "렌탈"],
  ];
  const covRow = Object.keys(cov).length ? `<div class="stat-grid" style="margin-top:14px">
    ${COVERAGE_LABELS.map(([k, l]) => `<div class="stat"><div class="n">${fmtPct(cov[k])}</div><div class="l">${l} 정보 충실도</div></div>`).join("")}
  </div>` : "";

  return `${s1}${s2}${s3}${s4}${s5}${s6}${s7}
  <section class="section"><h2>데이터 정보</h2>
    <p class="section-desc">7개 영역 채움률. 100%가 아니어도 비어 있는 값은 '미확인'이며 '없음'과 다릅니다.</p>
    ${covRow}
    <p class="section-desc" style="margin-top:14px">수집 ${esc(fmtDate(d.meta?.generated_at || d.meta?.normalized_at))} · 스키마 ${esc(d.meta?.schema || "")} · <a href="${REPO_URL}/blob/main/data/v29/schema.md" target="_blank" rel="noopener noreferrer">스키마 문서</a></p>
  </section>`;
}

/* ---------------- 렌탈 페이지 ---------------- */
function renderRental(): void {
  const r = state.rental;
  if (!r) {
    $<HTMLElement>("#view-page").innerHTML = `<div class="page"><h1>클럽 렌탈·딜리버리</h1><p class="page-lead">렌탈 데이터를 불러오지 못했습니다.</p></div>`;
    return;
  }
  const providers = r.providers ?? [];
  const regions = ["수도권", "강원", "충청", "호남", "영남", "제주"];
  const cards = providers.map((p) => `
    <article class="rental-card">
      <div class="rental-head">
        <span class="rental-name">${esc(p.name)}</span>
        <span class="tags">${(p.regions ?? []).map((rg) => `<span class="tag">${esc(rg)}</span>`).join("")}</span>
      </div>
      <div class="rental-grid">
        ${p.price ? `<div><b>요금</b><span>${esc(p.price)}</span></div>` : ""}
        ${p.brands ? `<div><b>클럽</b><span>${esc(p.brands)}</span></div>` : ""}
        ${p.delivery ? `<div><b>배송·픽업</b><span>${esc(p.delivery)}</span></div>` : ""}
        ${p.languages ? `<div><b>언어</b><span>${esc(p.languages)}</span></div>` : ""}
        ${p.status ? `<div><b>상태</b><span>${esc(p.status)}</span></div>` : ""}
        <div><b>연락</b><span>${p.phone ? `<a href="tel:${esc(String(p.phone).replace(/[^\d+]/g, ""))}">${esc(p.phone)}</a>` : "미확인"}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">홈페이지</a>` : ""}</span></div>
      </div>
      ${p.note ? `<p class="section-desc">${esc(p.note)}</p>` : ""}
    </article>`).join("");

  $<HTMLElement>("#view-page").innerHTML = `<div class="page">
    <h1>클럽 렌탈·딜리버리</h1>
    <p class="page-lead">해외에서 오셨거나 장비 없이 라운드하실 때 — 골프장 자체 대여와, 이 지역으로 배송·픽업이 가능한 업체를 한곳에 모았습니다.</p>
    <div class="callout info" style="margin-top:18px">
      <strong>시장 구조</strong>
      ${esc(r.summary || "")}
    </div>
    <div class="stack" style="margin-top:18px">${cards}</div>
    <div class="callout" style="margin-top:18px">
      <strong>아직 비어 있는 것</strong>
      다국어(영어·일본어·중국어) 온라인 예약과 거리측정기 대여 옵션 표기가 거의 없습니다. 재고·개별 견적·권역별 실제 배송 가능 여부는 전화·카카오톡 상담으로만 확인됩니다.
    </div>
    <p class="section-desc" style="margin-top:14px">조사 ${esc(r.dataset?.verified_at || "")} · ${regions.length}개 권역 · ${providers.length}곳 · <a href="${REPO_URL}/blob/main/data/v29/rental_deliveries.md" target="_blank" rel="noopener noreferrer">원문 조사 노트</a></p>
  </div>`;
  window.scrollTo({ top: 0 });
}

/* ---------------- 데이터 소개 ---------------- */
function renderAbout(): void {
  const index = getIndex();
  const d = index.dataset;
  const c = d.counts;
  // 서버가 내보내는 index.json 은 minify 된 JSON 이므로 바이트 길이가 실제 파일 크기와 같다.
  // 문자열 length 는 한글을 1자로 세어 실제보다 작게 나온다(175KB vs 199.9KB).
  const indexBytes = new TextEncoder().encode(JSON.stringify(index)).length;
  $<HTMLElement>("#view-page").innerHTML = `<div class="page">
    <h1>데이터</h1>
    <p class="page-lead">CourseBrief는 골프장 공식 홈페이지·공지·요금표를 직접 수집하고 공개 데이터와 대조해 7개 영역으로 정리합니다. 모든 값에는 출처와 확인 시점이 붙습니다.</p>
    <div class="stat-grid" style="margin-top:22px">
      <div class="stat"><div class="n">${c.total}</div><div class="l">전체 골프장</div></div>
      <div class="stat"><div class="n">${c.with_detail}</div><div class="l">상세 7개 영역</div></div>
      <div class="stat"><div class="n">${c.operating}</div><div class="l">영업중</div></div>
      <div class="stat"><div class="n">${c.suspended}</div><div class="l">휴업·영업중단</div></div>
      <div class="stat"><div class="n">${c.closed}</div><div class="l">폐업</div></div>
      <div class="stat"><div class="n">${c.under_construction + c.planned}</div><div class="l">건설중·미착공</div></div>
    </div>

    <h2 class="h2">7개 영역</h2>
    <div class="stack">
      ${[
        ["01 기본·입지", "소재·규모·개장·운영사·좌표·최단 IC·접근성"],
        ["02 코스 스펙", "홀 구성·파·전장·잔디·KGA 코스레이팅/슬로프"],
        ["03 요금·예약·취소", "주중/주말 그린피·카트·캐디·예약 오픈 주기·취소 위약·악천후 정산"],
        ["04 현장 운영", "노캐디·2/3/5인·카트 종류와 진입·셀프 백드롭·매트·체크인·복장"],
        ["05 부대시설", "연습장·식당·그늘집·락카·사우나·숙박·야간 조명·셔틀·전기차"],
        ["06 브리핑·공지", "휴장·에어레이션·요금 변경 공지, 라운더 평가, 확인 필요 알림"],
        ["07 클럽 렌탈", "골프장 자체 대여 + 해외 골퍼용 렌탈·딜리버리 업체"],
      ].map(([t, desc]) => `<div class="callout"><strong>${t}</strong>${desc}</div>`).join("")}
    </div>

    <h2 class="h2">수집 원칙</h2>
    <div class="stack">
      <p>· 공식 홈페이지·공지사항·요금표를 1순위로 삼고, 2차 사이트 값은 교차검증에만 사용합니다. 실제로 2차 사이트의 레이팅 오표기 사례가 확인되어 KGA 원본을 우선합니다.</p>
      <p>· 확인되지 않은 값은 <b>미확인</b>으로 남깁니다. "정보 없음"을 "없음"으로 해석하지 않습니다(예: 공지에 에어레이션 안내가 없는 것은 작업을 안 한다는 뜻이 아닙니다).</p>
      <p>· 요금에는 확인 시점을 함께 저장합니다. 그린피는 몇 달이면 낡습니다.</p>
      <p>· 전화·현장에서만 확인되는 항목(좌타 클럽, 매트 비율, 락카 요금, 카트 열선)은 비워 두고 제보로 채웁니다.</p>
    </div>

    <h2 class="h2">구조</h2>
    <div class="stack">
      <p><code>data/v29/index.json</code> — 목록·검색·필터용 경량 인덱스 ${fmtKB(indexBytes)}, 전체 ${c.total}곳</p>
      <p><code>data/v29/courses/{id}.json</code> — 구장별 상세 12키 JSON ${c.total}개</p>
      <p><code>data/v29/clusters.json</code> — 같은 부지 복수 코스 시설 클러스터</p>
      <p><code>elasticsearch/</code> — nori 한글 분석기 매핑·bulk 적재·docker-compose·ES 어댑터(선택)</p>
    </div>

    <h2 class="h2">주의</h2>
    <div class="callout warn">
      <strong>참고 데이터입니다</strong>
      요금·운영 정보는 수집 시점의 공개 정보이며, 골프장 정책에 따라 수시로 바뀝니다. 예약·결제 전 반드시 공식 채널에서 최종 확인하세요. 이 사이트는 예약을 대행하지 않습니다.
    </div>
    <p class="section-desc" style="margin-top:16px">${esc(d.version)} · ${esc(fmtDate(d.built_at))} 기준 · <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">GitHub 저장소</a> · <a href="${REPO_URL}/blob/main/data/v29/schema.md" target="_blank" rel="noopener noreferrer">스키마 문서</a></p>
  </div>`;
  window.scrollTo({ top: 0 });
}

/* ---------------- 라우터 ---------------- */
type ViewName = "list" | "detail" | "page";

function showView(name: ViewName): void {
  $<HTMLElement>("#view-list").hidden = name !== "list";
  $<HTMLElement>("#view-detail").hidden = name !== "detail";
  $<HTMLElement>("#view-page").hidden = name !== "page";
  for (const a of document.querySelectorAll<HTMLElement>("[data-nav]")) a.removeAttribute("aria-current");
}

async function route(): Promise<void> {
  const hash = (location.hash || "#/").replace(/^#/, "");
  // `#/c/{id}#s3` 처럼 상세 영역 앵커가 붙으면 두 번째 `#` 뒤가 섹션 id 다.
  // 이걸 분리하지 않으면 id 가 'kr-golf-0498#s3' 가 되어 상세가 '찾을 수 없습니다'로 깨진다.
  const anchorAt = hash.indexOf("#");
  const section = anchorAt >= 0 ? hash.slice(anchorAt + 1) : "";
  const path = (anchorAt >= 0 ? hash.slice(0, anchorAt) : hash).split("?")[0];

  if (path.startsWith("/c/")) {
    const id = decodeURIComponent(path.slice(3));
    const needsRender = id !== renderedDetailId || $<HTMLElement>("#view-detail").hidden;
    showView("detail");
    if (needsRender) await renderDetail(id);
    if (section) scrollToSection(section);
    return;
  }
  renderedDetailId = null;
  if (path === "/rental") {
    showView("page");
    document.querySelector<HTMLElement>('[data-nav="rental"]')?.setAttribute("aria-current", "page");
    renderRental();
    return;
  }
  if (path === "/about") {
    showView("page");
    document.querySelector<HTMLElement>('[data-nav="about"]')?.setAttribute("aria-current", "page");
    renderAbout();
    return;
  }
  showView("list");
  document.querySelector<HTMLElement>('[data-nav="list"]')?.setAttribute("aria-current", "page");
  applyHashQuery(readHashQuery());
  await renderList({ reset: true });
}

/* ---------------- 이벤트 ---------------- */
function wire(): void {
  const q = $<HTMLInputElement>("#q");
  const qClear = $<HTMLButtonElement>("#q-clear");
  const onQuery = debounce(() => {
    state.q = q.value.trim();
    state.shown = CONFIG.pageSize;
    const onList = location.hash.replace(/^#/, "").split("?")[0] === "/";
    if (onList) {
      syncHash();
      void renderList({ reset: true });
    } else {
      location.hash = hashQueryFromState(); // 라우터가 목록으로 이동하며 검색어를 적용한다
    }
  }, 140);
  q.addEventListener("input", () => {
    qClear.hidden = !q.value;
    onQuery();
  });
  qClear.addEventListener("click", () => {
    q.value = "";
    qClear.hidden = true;
    state.q = "";
    syncHash();
    void renderList({ reset: true });
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
      state.shown = CONFIG.pageSize;
      syncHash();
      void renderList({ reset: true });
    });
  }
  $<HTMLSelectElement>("#f-sort").addEventListener("change", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLSelectElement)) return;
    state.filters.sort = isSortKey(target.value) ? target.value : "name";
    state.shown = CONFIG.pageSize;
    syncHash();
    void renderList({ reset: true });
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
    btn.classList.toggle("is-on", !on);
    btn.setAttribute("aria-pressed", on ? "false" : "true");
    state.shown = CONFIG.pageSize;
    syncHash();
    void renderList({ reset: true });
  });
  $<HTMLButtonElement>("#f-reset").addEventListener("click", resetFilters);
  $<HTMLButtonElement>("#more").addEventListener("click", () => {
    state.shown += CONFIG.pageSize;
    void renderList();
  });
  document.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    if (target instanceof HTMLElement && target.id === "empty-reset") resetFilters();
    // 같은 영역을 다시 누르면 해시가 그대로라 hashchange 가 없다 — 직접 스크롤한다
    const link = target.closest<HTMLAnchorElement>(".section-nav a");
    const href = link?.getAttribute("href");
    if (link && href && href === location.hash) {
      ev.preventDefault();
      scrollToSection(href.slice(href.lastIndexOf("#") + 1));
    }
  });
}

function resetFilters(): void {
  state.filters = defaultFilters();
  state.q = "";
  $<HTMLInputElement>("#q").value = "";
  $<HTMLButtonElement>("#q-clear").hidden = true;
  $<HTMLSelectElement>("#f-sido").value = "";
  $<HTMLSelectElement>("#f-type").value = "";
  $<HTMLSelectElement>("#f-holes").value = "";
  $<HTMLSelectElement>("#f-fee").value = "";
  $<HTMLSelectElement>("#f-sort").value = "name";
  for (const btn of $<HTMLElement>("#status-chips").querySelectorAll<HTMLButtonElement>(".chip")) {
    const on = btn.dataset.status === "operating";
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  state.shown = CONFIG.pageSize;
  syncHash();
  void renderList({ reset: true });
}

wire();
void boot();
