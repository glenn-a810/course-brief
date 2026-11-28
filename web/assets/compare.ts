/**
 * H5. 후보 비교(최대 4곳) + 동반자 공유 링크
 *
 * - 담은 구장은 localStorage 에만 저장한다(로그인·서버 없음).
 * - 비교 화면은 URL 해시(`#/compare?ids=...`)로 재현되므로, 그 링크를 단톡방에 보내면
 *   상대는 앱 설치 없이 같은 비교표를 연다.
 * - 값이 없는 칸은 비우지 않고 '미확인'으로 적는다(데이터 원칙).
 */
import { copyText, shareOrCopy } from "./text.js";
import { esc } from "./util.js";
import { icon } from "./icons.js";

const KEY = "coursebrief-compare";
export const COMPARE_LIMIT = 4;

let ids: string[] = load();

function load(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0).slice(0, COMPARE_LIMIT);
  } catch {
    return []; // 저장소 차단 환경 — 이번 방문 동안만 메모리에 담는다
  }
}

function save(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // 저장 실패는 기능을 막지 않는다
  }
}

export function compareIds(): string[] {
  return [...ids];
}

export function isCompared(id: string): boolean {
  return ids.includes(id);
}

export type ToggleResult = "added" | "removed" | "full";

export function toggleCompare(id: string): ToggleResult {
  if (ids.includes(id)) {
    ids = ids.filter((x) => x !== id);
    save();
    return "removed";
  }
  if (ids.length >= COMPARE_LIMIT) return "full";
  ids = [...ids, id];
  save();
  return "added";
}

export function removeCompareId(id: string): void {
  ids = ids.filter((x) => x !== id);
  save();
}

export function clearCompare(): void {
  ids = [];
  save();
}

/** 비교 화면 링크 — 해시 라우팅이라 정적 호스팅에서 그대로 열린다 */
export function compareHref(): string {
  return ids.length ? `#/compare?ids=${ids.map(encodeURIComponent).join(",")}` : "#/compare";
}

function baseUrl(): string {
  return `${location.origin}${location.pathname}`.replace(/index\.html$/, "");
}

export function compareShareUrl(): string {
  return `${baseUrl()}${compareHref()}`;
}

/** 카드·상세의 '비교 담기' 버튼 상태를 현재 저장값에 맞춘다 */
export function syncCompareToggles(root: ParentNode = document): void {
  for (const btn of root.querySelectorAll<HTMLButtonElement>("[data-cmp]")) {
    const id = btn.dataset.cmp ?? "";
    const on = isCompared(id);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("is-on", on);
    const label = on ? "비교에서 빼기" : "비교에 담기";
    btn.setAttribute("aria-label", `${btn.dataset.cmpName ?? "구장"} ${label}`);
    btn.title = label;
    const text = btn.querySelector<HTMLElement>(".cmp-toggle-text");
    const long = btn.dataset.cmpLong === "1";
    if (text) text.textContent = on ? (long ? "비교 담김" : "담김") : (long ? "비교 담기" : "비교");
  }
}

/** 하단 고정 비교 바 — 담은 곳이 있을 때만 보인다 */
export function updateCompareBar(): void {
  const bar = document.getElementById("compare-bar");
  if (!bar) return;
  const onComparePage = location.hash.replace(/^#/, "").split("?")[0] === "/compare";
  bar.hidden = ids.length === 0 || onComparePage;
  const n = document.getElementById("compare-n");
  if (n) n.textContent = String(ids.length);
  const go = document.getElementById("compare-go");
  if (go instanceof HTMLAnchorElement) {
    go.href = compareHref();
    go.textContent = ids.length > 1 ? `비교표 보기 (${ids.length})` : "비교표 보기";
  }
}

let wired = false;
let notify: (() => void) | null = null;

/**
 * 비교 담기·비우기 클릭을 한 곳에서 처리한다. 상세·목록·비교 화면이 모두
 * 같은 data 속성을 쓰므로 화면을 다시 그려도 연결이 살아 있다.
 */
export function initCompare(onChange?: () => void): void {
  if (onChange) notify = onChange;
  if (wired) return;
  wired = true;

  document.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;

    const toggle = target.closest<HTMLButtonElement>("[data-cmp]");
    if (toggle) {
      ev.preventDefault();
      const id = toggle.dataset.cmp;
      if (!id) return;
      const result = toggleCompare(id);
      if (result === "full") {
        announce(`비교는 최대 ${COMPARE_LIMIT}곳까지 담을 수 있습니다. 하나를 빼고 담아 주세요.`);
      } else {
        announce(result === "added" ? "비교에 담았습니다." : "비교에서 뺐습니다.");
      }
      syncCompareToggles();
      updateCompareBar();
      notify?.();
      return;
    }

    const remove = target.closest<HTMLButtonElement>("[data-cmp-remove]");
    if (remove) {
      ev.preventDefault();
      const id = remove.dataset.cmpRemove;
      if (id) {
        removeCompareId(id);
        syncCompareToggles();
        updateCompareBar();
        notify?.();
        location.hash = compareHref();
      }
      return;
    }

    if (target.closest("#compare-clear")) {
      ev.preventDefault();
      clearCompare();
      syncCompareToggles();
      updateCompareBar();
      notify?.();
      announce("비교를 비웠습니다.");
    }
  });

  updateCompareBar();
}

function announce(text: string): void {
  let node = document.getElementById("compare-status");
  if (!node) {
    node = document.createElement("span");
    node.id = "compare-status";
    node.className = "sr-only";
    node.setAttribute("role", "status");
    document.body.appendChild(node);
  }
  node.textContent = text;
}

export interface CompareColumn {
  id: string;
  name: string;
  sub: string;
  /** 행 키 → 값. 없으면 '미확인'으로 표시한다 */
  values: Record<string, string>;
}

export interface CompareRowDef {
  key: string;
  label: string;
  /** 핵심 10행에 들지 않는 항목은 '추가 정보'로 접어 둔다 */
  extra?: boolean;
}

/** 비교표 행 — 위에서부터 읽는 순서가 곧 의사결정 순서다 */
export const COMPARE_ROWS: CompareRowDef[] = [
  { key: "weekend", label: "주말 그린피" },
  { key: "weekday", label: "주중 그린피" },
  { key: "total4", label: "4인 총액" },
  { key: "cart", label: "카트" },
  { key: "caddie", label: "캐디피" },
  { key: "players2", label: "2인 플레이" },
  { key: "nocaddie", label: "노캐디" },
  { key: "night", label: "야간 라운드" },
  { key: "lodging", label: "숙박" },
  { key: "cancel", label: "취소·위약" },
  { key: "open", label: "예약 오픈" },
  { key: "players3", label: "3인 플레이", extra: true },
  { key: "players5", label: "5인 플레이", extra: true },
  { key: "holes", label: "홀·형태", extra: true },
  { key: "rating", label: "라운더 평가", extra: true },
  { key: "place", label: "입지", extra: true },
  { key: "rental", label: "클럽 렌탈", extra: true },
  { key: "phone", label: "전화", extra: true },
];

function cellHTML(value: string | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return `<td><span class="cmp-none">미확인</span></td>`;
  return `<td>${esc(text)}</td>`;
}

/**
 * 비교 화면 본문. values 가 비어 있는 칸은 '미확인'이다.
 * 첫 열(항목명)은 스크롤 중에도 고정된다.
 */
export function comparePageHTML(cols: CompareColumn[]): string {
  const head = cols.map((c) => `<th scope="col" class="cmp-col">
      <a class="cmp-col-name" href="#/c/${esc(c.id)}">${esc(c.name)}</a>
      <span class="cmp-col-sub">${esc(c.sub)}</span>
      <button type="button" class="cmp-remove" data-cmp-remove="${esc(c.id)}" aria-label="${esc(c.name)} 비교에서 빼기">${icon("close")}</button>
    </th>`).join("");

  const row = (def: CompareRowDef, extra: boolean): string => `<tr${extra ? ' class="cmp-extra-row"' : ""}>
      <th scope="row">${esc(def.label)}</th>
      ${cols.map((c) => cellHTML(c.values[def.key])).join("")}
    </tr>`;

  const core = COMPARE_ROWS.filter((r) => !r.extra).map((r) => row(r, false)).join("");
  const extra = COMPARE_ROWS.filter((r) => r.extra).map((r) => row(r, true)).join("");

  const names = cols.map((c) => c.name).join(" · ");
  const body = cols.length
    ? `<div class="cmp-scroll">
        <table class="cmp-table">
          <caption class="sr-only">${esc(names)} ${cols.length}곳 비교</caption>
          <thead><tr><th scope="col" class="cmp-corner">항목</th>${head}</tr></thead>
          <tbody>${core}</tbody>
          <tbody class="cmp-extra" hidden>${extra}</tbody>
        </table>
      </div>
      <button type="button" class="btn btn-ghost btn-sm cmp-more-btn" data-cmp-more aria-expanded="false">추가 정보 펼치기</button>`
    : `<div class="state-box">
        <h2 class="state-title">담은 구장이 없습니다</h2>
        <p class="state-desc">목록이나 상세에서 <b>비교 담기</b>를 누르면 최대 4곳까지 나란히 볼 수 있습니다.</p>
        <a class="btn" href="#/">골프장 목록으로</a>
      </div>`;

  return `<div class="page cmp-page">
    <header class="page-head">
      <span class="ic-tile tone-blue size-lg" aria-hidden="true">${icon("chart")}</span>
      <div class="page-head-text">
        <h1 class="page-title" tabindex="-1">후보 비교</h1>
        <p class="page-lead">${cols.length
          ? `${esc(names)} — 그린피·총액·조건·취소 규정을 한 표에서 비교합니다. 값을 확인하지 못한 칸은 '미확인'입니다.`
          : "라운드 후보를 최대 4곳까지 담아 나란히 비교합니다."}</p>
      </div>
    </header>
    ${cols.length ? `<div class="cmp-actions">
      <button type="button" class="btn btn-sm" data-cmp-act="link">${icon("copy")}비교 링크 복사</button>
      <button type="button" class="btn btn-ghost btn-sm" data-cmp-act="share">${icon("external")}공유하기</button>
      <button type="button" class="btn btn-ghost btn-sm" data-cmp-act="clear">${icon("close")}비우기</button>
    </div>
    <p class="cmp-status" role="status"></p>` : ""}
    ${body}
    <p class="source-line">그린피는 1인 18홀 비회원 기준입니다. 4인 총액은 그린피 × 4 + 카트 + 캐디피(팀 기준)로 계산했고, 확인되지 않은 항목은 빼지 않고 '미확인'으로 두었습니다. 가격·재고는 예약 채널에서 최종 확인하세요.</p>
  </div>`;
}

/** 지금 화면의 비교 링크 — 공유받은 링크로 들어왔으면 그 구성 그대로를 다시 공유한다 */
function currentCompareUrl(): string {
  const hash = location.hash;
  if (hash.startsWith("#/compare")) return `${location.origin}${location.pathname}${hash}`;
  return compareShareUrl();
}

/** 비교 화면의 복사·공유·추가 정보 버튼 */
export function wireComparePage(root: HTMLElement): void {
  const status = (text: string): void => {
    const node = root.querySelector<HTMLElement>(".cmp-status");
    if (node) node.textContent = text;
  };
  root.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;

    if (target.closest("[data-cmp-more]")) {
      const btn = target.closest<HTMLButtonElement>("[data-cmp-more]");
      const extra = root.querySelector<HTMLElement>(".cmp-extra");
      if (!btn || !extra) return;
      const open = extra.hidden;
      extra.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? "추가 정보 접기" : "추가 정보 펼치기";
      return;
    }

    const act = target.closest<HTMLElement>("[data-cmp-act]")?.dataset.cmpAct;
    if (act === "link") {
      void copyText(currentCompareUrl()).then((ok) => status(ok ? "비교 링크를 복사했습니다." : "복사하지 못했습니다."));
      return;
    }
    if (act === "share") {
      void shareOrCopy("CourseBrief 후보 비교", currentCompareUrl()).then((how) =>
        status(how === "shared" ? "공유했습니다." : how === "copied" ? "링크를 복사했습니다." : "공유하지 못했습니다."),
      );
      return;
    }
    if (act === "clear") {
      clearCompare();
      syncCompareToggles();
      updateCompareBar();
      location.hash = "#/compare";
    }
  });
}
