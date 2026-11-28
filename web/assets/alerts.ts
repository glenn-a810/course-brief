/**
 * M3 — 휴장·에어레이션·요금 변경 통합 캘린더
 *
 * 데이터는 빌드 시 `data/v29/alerts.json` 으로 모아 둔다(구장별 상세를 540번 부르지 않는다).
 *  - alert(확인된 운영 알림)와 공지 제목에서 기간을 읽은 항목을 함께 보여 준다.
 *  - 기간을 읽지 못한 항목은 '일정 미상'으로 분리한다(추측해서 달력에 올리지 않는다).
 */
import type { AlertFile, AlertItem } from "../../shared/types";
import { esc } from "./util.js";
import { icon, iconTile } from "./icons.js";
import { daysBetween, fmtDay, parseISO, today } from "./rules.js";
import { favoriteIds } from "./saved.js";
import { t } from "./i18n.js";

let file: AlertFile | null = null;
let pending: Promise<AlertFile | null> | null = null;
let failed = false;

export function loadAlerts(dataBase: string): Promise<AlertFile | null> {
  if (file) return Promise.resolve(file);
  if (pending) return pending;
  pending = (async () => {
    try {
      const res = await fetch(`${dataBase}alerts.json`, { cache: "no-cache" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as AlertFile;
      file = data;
      return data;
    } catch {
      failed = true;
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

export function alertsReady(): boolean {
  return Boolean(file);
}

export function alertsFailed(): boolean {
  return failed;
}

export function itemsFor(id: string): AlertItem[] {
  return file?.items.filter((i) => i.id === id) ?? [];
}

/** 카드 배지용 — 오늘 이후(또는 진행 중) 휴장 알림 한 건 */
export function upcomingClosure(id: string): AlertItem | null {
  const list = itemsFor(id).filter((i) => i.kind === "closure");
  const base = today();
  const live = list.find((i) => {
    const to = parseISO(i.to ?? i.from);
    return to ? daysBetween(base, to) >= 0 : false;
  });
  return live ?? list.find((i) => !i.from) ?? null;
}

const KIND: Record<string, { label: string; tone: string }> = {
  get closure() { return { label: t("alerts.kind.closure"), tone: "danger" }; },
  get aeration() { return { label: t("alerts.kind.aeration"), tone: "warn" }; },
  get fee_change() { return { label: t("alerts.kind.fee_change"), tone: "info" }; },
  get note() { return { label: t("alerts.kind.note"), tone: "neutral" }; },
  get notice() { return { label: t("alerts.kind.notice"), tone: "neutral" }; },
  get event() { return { label: t("alerts.kind.event"), tone: "neutral" }; },
};

type Status = "ongoing" | "upcoming" | "undated" | "past";

function statusOf(item: AlertItem, base = today()): Status {
  const from = parseISO(item.from);
  const to = parseISO(item.to ?? item.from);
  if (!from) return "undated";
  if (to && daysBetween(base, to) < 0) return "past";
  if (daysBetween(base, from) > 0) return "upcoming";
  return "ongoing";
}

function periodText(item: AlertItem): string {
  const from = parseISO(item.from);
  const to = parseISO(item.to);
  if (from && to) return from.getTime() === to.getTime() ? fmtDay(from) : `${fmtDay(from)} ~ ${fmtDay(to)}`;
  if (from) return `${fmtDay(from)} ~`;
  return t("alerts.periodUnknown");
}

const GROUPS: Array<{ key: Status; label: string; hint: string }> = [
  { get key() { return "ongoing" as Status; }, get label() { return t("alerts.groupOngoing"); }, get hint() { return t("alerts.hintOngoing"); } },
  { get key() { return "upcoming" as Status; }, get label() { return t("alerts.groupUpcoming"); }, get hint() { return t("alerts.hintUpcoming"); } },
  { get key() { return "undated" as Status; }, get label() { return t("alerts.groupUndated"); }, get hint() { return t("alerts.hintUndated"); } },
  { get key() { return "past" as Status; }, get label() { return t("alerts.groupPast"); }, get hint() { return t("alerts.hintPast"); } },
];

interface State {
  kind: string;
  sido: string;
  includePast: boolean;
  favoritesOnly: boolean;
  undated: boolean;
}

const state: State = { kind: "", sido: "", includePast: false, favoritesOnly: false, undated: true };

export function resetAlertsFilter(): void {
  state.kind = "";
  state.sido = "";
  state.includePast = false;
  state.favoritesOnly = false;
  state.undated = true;
}

function statusFiltered(list: AlertItem[]): AlertItem[] {
  const base = today();
  return list.filter((i) => {
    const st = statusOf(i, base);
    if (st === "past" && !state.includePast) return false;
    if (st === "undated" && !state.undated) return false;
    return true;
  });
}

function rowHTML(item: AlertItem): string {
  const kind = KIND[item.kind] ?? KIND.notice;
  const from = parseISO(item.from);
  const to = parseISO(item.to ?? item.from);
  const st = statusOf(item);
  const dday = from ? daysBetween(today(), from) : null;
  const ddayBadge = st === "undated"
    ? `<span class="alert-dd is-unknown">${esc(t("alerts.undatedBadge"))}</span>`
    : st === "ongoing"
      ? `<span class="alert-dd is-today">${esc(t("alerts.ongoing"))}</span>`
      : dday === 0 ? `<span class="alert-dd is-today">${esc(t("alerts.today"))}</span>`
        : dday != null && dday > 0 ? `<span class="alert-dd">D-${dday}</span>`
          : `<span class="alert-dd is-past">${esc(t("alerts.passed"))}</span>`;
  const confirmed = item.source === "alert"
    ? (item.confirmed ? `<span class="src-tag src-official">${esc(t("alerts.confirmed"))}</span>` : `<span class="src-tag src-neutral">${esc(t("alerts.fromNotice"))}</span>`)
    : `<span class="src-tag src-neutral">${esc(t("alerts.fromTitle"))}</span>`;
  return `<li class="alert-row is-link">
    <a class="card-hit" href="#/c/${esc(item.id)}" aria-label="${esc(t("card.viewDetailAria", { name: item.name }))}"></a>
    <div class="alert-when">${ddayBadge}${st === "undated" ? "" : `<span class="alert-period">${esc(periodText(item))}</span>`}</div>
    <div class="alert-main">
      <h3 class="alert-name">${esc(item.name)}
        <span class="badge ${kind.tone}">${esc(kind.label)}</span>${confirmed}</h3>
      <p class="alert-title">${esc(item.title || t("alerts.noTitle"))}</p>
      ${item.detail ? `<p class="alert-detail">${esc(item.detail)}</p>` : ""}
      <p class="alert-meta">${esc([item.sido, item.sigungu].filter(Boolean).join(" "))}${
        item.updated ? ` · ${esc(t("alerts.posted", { date: item.updated.slice(0, 10).replaceAll("-", ".") }))}` : ""}${
        item.to && from && to && daysBetween(from, to) === 0 ? "" : ""}</p>
    </div>
    <span class="card-cta alert-cta">${esc(t("common.detail"))}${icon("chevron")}</span>
  </li>`;
}

export function renderAlerts(root: HTMLElement): void {
  if (!file) {
    root.innerHTML = `<div class="page"><header class="page-head">${iconTile("calendar", "orange", "lg")}
      <div class="page-head-text"><h1 class="page-title" tabindex="-1">${esc(t("alerts.title"))}</h1>
      <p class="page-lead">${alertsFailed() ? esc(t("alerts.failed")) : esc(t("alerts.loading"))}</p></div></header></div>`;
    return;
  }
  // 같은 구장·같은 종류는 alert(확인된 알림) 쪽만 남긴다 — 같은 휴장이 알림과 공지로 두 번 보이지 않게
  const alerted = new Set(file.items.filter((i) => i.source === "alert").map((i) => `${i.id}|${i.kind}`));
  const all = file.items.filter((i) => i.source === "alert" || !alerted.has(`${i.id}|${i.kind}`));
  const sidoList = [...new Set(all.map((i) => i.sido ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const favs = new Set(favoriteIds());
  const filtered = statusFiltered(all).filter((i) => {
    if (state.kind && i.kind !== state.kind) return false;
    if (state.sido && i.sido !== state.sido) return false;
    if (state.favoritesOnly && !favs.has(i.id)) return false;
    return true;
  });
  const byStatus = new Map<Status, AlertItem[]>();
  for (const item of filtered) {
    const st = statusOf(item);
    const arr = byStatus.get(st) ?? [];
    arr.push(item);
    byStatus.set(st, arr);
  }
  for (const arr of byStatus.values()) {
    arr.sort((a, b) => (a.from ?? "9999").localeCompare(b.from ?? "9999") || a.name.localeCompare(b.name, "ko"));
  }
  const counts = {
    closure: all.filter((i) => i.kind === "closure").length,
    aeration: all.filter((i) => i.kind === "aeration").length,
    fee: all.filter((i) => i.kind === "fee_change").length,
    undated: all.filter((i) => statusOf(i) === "undated").length,
    past: all.filter((i) => statusOf(i) === "past").length,
  };

  const kindChip = (key: string, label: string, n: number): string =>
    `<button type="button" class="chip${state.kind === key ? " is-on" : ""}" data-alert-kind="${key}" aria-pressed="${state.kind === key}">${esc(label)}<span class="chip-n">${n}</span></button>`;

  const groups = GROUPS.filter((g) => g.key !== "past" || state.includePast)
    .map((g) => {
      const arr = byStatus.get(g.key) ?? [];
      if (!arr.length) return "";
      const list = `<ul class="alert-list">${arr.map((it) => rowHTML(it)).join("")}</ul>`;
      if (g.key === "undated") {
        // 기간을 읽지 못한 항목은 양이 많아 접어 둔다 — 제목만 확인된 항목임을 먼저 밝힌다
        return `<details class="alert-undated"${state.kind ? " open" : ""}>
          <summary>${esc(t("alerts.groupUndated"))} <span class="alert-count">${arr.length}</span><span class="alert-group-hint">${esc(g.hint)}</span></summary>
          ${list}
        </details>`;
      }
      return `<section class="alert-group" aria-labelledby="ag-${g.key}">
        <div class="alert-group-head"><h2 id="ag-${g.key}">${esc(g.label)}<span class="alert-count">${arr.length}</span></h2>
        <span class="alert-group-hint">${esc(g.hint)}</span></div>
        ${list}
      </section>`;
    }).join("");

  root.innerHTML = `<div class="page alerts-page">
    <header class="page-head">
      ${iconTile("calendar", "orange", "lg")}
      <div class="page-head-text">
        <h1 class="page-title" tabindex="-1">${esc(t("alerts.title"))}</h1>
        <p class="page-lead">${esc(t("alerts.lead"))}</p>
      </div>
    </header>
    <div class="stat-row">
      <div class="stat"><span class="stat-n">${counts.closure}</span><span class="stat-l">${esc(t("alerts.statClosure"))}</span></div>
      <div class="stat"><span class="stat-n">${counts.aeration}</span><span class="stat-l">${esc(t("alerts.statAeration"))}</span></div>
      <div class="stat"><span class="stat-n">${counts.fee}</span><span class="stat-l">${esc(t("alerts.statFee"))}</span></div>
      <div class="stat"><span class="stat-n">${counts.undated}</span><span class="stat-l">${esc(t("alerts.statUndated"))}</span></div>
    </div>
    <div class="alert-toolbar">
      <div class="chip-row" role="group" aria-label="${esc(t("alerts.kindAria"))}">${kindChip("", t("common.all"), all.length)}${kindChip("closure", t("alerts.kind.closure"), counts.closure)}${kindChip("aeration", t("alerts.kind.aeration"), counts.aeration)}${kindChip("fee_change", t("alerts.kind.fee_change"), counts.fee)}</div>
      <label class="field field-inline"><span>${esc(t("alerts.region"))}</span>
        <select id="alert-sido"><option value="">${esc(t("common.all"))}</option>${sidoList.map((s) => `<option value="${esc(s)}"${state.sido === s ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>
      </label>
      <label class="check"><input type="checkbox" id="alert-undated"${state.undated ? " checked" : ""}> <span>${esc(t("alerts.includeUndated"))}</span></label>
      <label class="check"><input type="checkbox" id="alert-past"${state.includePast ? " checked" : ""}> <span>${esc(t("alerts.includePast", { n: counts.past }))}</span></label>
      ${favs.size ? `<label class="check"><input type="checkbox" id="alert-fav"${state.favoritesOnly ? " checked" : ""}> <span>${esc(t("alerts.favOnly"))}</span></label>` : ""}
    </div>
    ${groups || `<div class="state-box"><h2 class="state-title">${esc(t("alerts.none"))}</h2>
      <p class="state-desc">${state.undated ? esc(t("alerts.noneWiden")) : esc(t("alerts.noneUndated"))}</p></div>`}
    <p class="source-line">${esc(t("alerts.sourceNote"))}</p>
    <p class="source-line">${esc(t("alerts.meta", { date: (file.dataset.built_at ?? "").slice(0, 10).replaceAll("-", "."), all: all.length, dated: file.dataset.with_period ?? 0 }))}</p>
  </div>`;

  root.querySelectorAll<HTMLButtonElement>("[data-alert-kind]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.kind = btn.dataset.alertKind ?? "";
      renderAlerts(root);
    });
  });
  root.querySelector<HTMLSelectElement>("#alert-sido")?.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t instanceof HTMLSelectElement) {
      state.sido = t.value;
      renderAlerts(root);
    }
  });
  const bindCheck = (id: string, key: "undated" | "includePast" | "favoritesOnly"): void => {
    root.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener("change", (ev) => {
      const t = ev.target;
      if (t instanceof HTMLInputElement) {
        state[key] = t.checked;
        renderAlerts(root);
      }
    });
  };
  bindCheck("alert-undated", "undated");
  bindCheck("alert-past", "includePast");
  bindCheck("alert-fav", "favoritesOnly");
}
