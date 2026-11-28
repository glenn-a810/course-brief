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
import { t } from "./i18n.js";

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
    const label = on ? t("card.compareRemove") : t("card.compareAdd");
    btn.setAttribute("aria-label", `${btn.dataset.cmpName ?? ""} ${label}`);
    btn.title = label;
    const text = btn.querySelector<HTMLElement>(".cmp-toggle-text");
    const long = btn.dataset.cmpLong === "1";
    if (text) text.textContent = on ? (long ? t("card.compared") : t("card.compared")) : (long ? t("card.compare") : t("card.compare"));
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
    go.textContent = ids.length > 1 ? `${t("compare.go")} (${ids.length})` : t("compare.go");
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
        announce(t("compare.full", { n: COMPARE_LIMIT }));
      } else {
        announce(result === "added" ? t("compare.added") : t("compare.removed"));
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
      announce(t("compare.cleared"));
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

/** 비교표 행 — 위에서부터 읽는 순서가 곧 의사결정 순서다(label 은 getter: 언어를 따라간다) */
export const COMPARE_ROWS: CompareRowDef[] = [
  { key: "weekend", get label() { return t("compare.row.weekend"); } },
  { key: "weekday", get label() { return t("compare.row.weekday"); } },
  { key: "total4", get label() { return t("compare.row.total4"); } },
  { key: "cart", get label() { return t("compare.row.cart"); } },
  { key: "caddie", get label() { return t("compare.row.caddie"); } },
  { key: "players2", get label() { return t("compare.row.players2"); } },
  { key: "nocaddie", get label() { return t("compare.row.nocaddie"); } },
  { key: "night", get label() { return t("compare.row.night"); } },
  { key: "lodging", get label() { return t("compare.row.lodging"); } },
  { key: "cancel", get label() { return t("compare.row.cancel"); } },
  { key: "open", get label() { return t("compare.row.open"); } },
  { key: "slope", get label() { return t("compare.row.slope"); }, extra: true },
  { key: "players3", get label() { return t("compare.row.players3"); }, extra: true },
  { key: "players5", get label() { return t("compare.row.players5"); }, extra: true },
  { key: "holes", get label() { return t("compare.row.holes"); }, extra: true },
  { key: "rating", get label() { return t("compare.row.rating"); }, extra: true },
  { key: "place", get label() { return t("compare.row.place"); }, extra: true },
  { key: "rental", get label() { return t("compare.row.rental"); }, extra: true },
  { key: "phone", get label() { return t("compare.row.phone"); }, extra: true },
];

function cellHTML(value: string | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return `<td><span class="cmp-none">${esc(t("common.unknown"))}</span></td>`;
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
      <button type="button" class="cmp-remove" data-cmp-remove="${esc(c.id)}" aria-label="${esc(t("compare.removeAria", { name: c.name }))}">${icon("close")}</button>
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
          <caption class="sr-only">${esc(t("compare.caption", { names, n: cols.length }))}</caption>
          <thead><tr><th scope="col" class="cmp-corner">${esc(t("compare.corner"))}</th>${head}</tr></thead>
          <tbody>${core}</tbody>
          <tbody class="cmp-extra" hidden>${extra}</tbody>
        </table>
      </div>
      <button type="button" class="btn btn-ghost btn-sm cmp-more-btn" data-cmp-more aria-expanded="false">${esc(t("compare.moreOpen"))}</button>`
    : `<div class="state-box">
        <h2 class="state-title">${esc(t("compare.emptyTitle"))}</h2>
        <p class="state-desc">${t("compare.emptyDesc")}</p>
        <a class="btn" href="#/">${esc(t("compare.emptyAction"))}</a>
      </div>`;

  return `<div class="page cmp-page">
    <header class="page-head">
      <span class="ic-tile tone-blue size-lg" aria-hidden="true">${icon("chart")}</span>
      <div class="page-head-text">
        <h1 class="page-title" tabindex="-1">${esc(t("compare.title"))}</h1>
        <p class="page-lead">${cols.length
          ? esc(t("compare.leadCols", { names }))
          : esc(t("compare.leadSimple"))}</p>
      </div>
    </header>
    ${cols.length ? `<div class="cmp-actions">
      <button type="button" class="btn btn-sm" data-cmp-act="link">${icon("copy")}${esc(t("compare.copyLink"))}</button>
      <button type="button" class="btn btn-ghost btn-sm" data-cmp-act="share">${icon("external")}${esc(t("common.share"))}</button>
      <button type="button" class="btn btn-ghost btn-sm" data-cmp-act="clear">${icon("close")}${esc(t("compare.clear"))}</button>
    </div>
    <p class="cmp-status" role="status"></p>` : ""}
    ${body}
    <p class="source-line">${esc(t("compare.sourceNote"))}</p>
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
      btn.textContent = open ? t("compare.moreClose") : t("compare.moreOpen");
      return;
    }

    const act = target.closest<HTMLElement>("[data-cmp-act]")?.dataset.cmpAct;
    if (act === "link") {
      void copyText(currentCompareUrl()).then((ok) => status(ok ? t("compare.linkCopied") : t("compare.copyFailed")));
      return;
    }
    if (act === "share") {
      void shareOrCopy(t("compare.shareTitle"), currentCompareUrl()).then((how) =>
        status(how === "shared" ? t("compare.shared") : how === "copied" ? t("compare.shareCopied") : t("compare.shareFailed")),
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
