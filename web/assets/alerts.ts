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
  closure: { label: "휴장", tone: "danger" },
  aeration: { label: "에어레이션", tone: "warn" },
  fee_change: { label: "요금 변경", tone: "info" },
  note: { label: "참고", tone: "neutral" },
  notice: { label: "공지", tone: "neutral" },
  event: { label: "행사", tone: "neutral" },
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
  return "기간 미상";
}

const GROUPS: Array<{ key: Status; label: string; hint: string }> = [
  { key: "ongoing", label: "진행 중", hint: "오늘이 기간 안에 있는 일정" },
  { key: "upcoming", label: "예정", hint: "앞으로 시작하는 일정" },
  { key: "undated", label: "일정 미상", hint: "공지 제목에 기간이 없어 날짜를 읽지 못한 항목" },
  { key: "past", label: "지난 일정", hint: "이미 지난 일정" },
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
    ? `<span class="alert-dd is-unknown">일정 미상</span>`
    : st === "ongoing"
      ? `<span class="alert-dd is-today">진행 중</span>`
      : dday === 0 ? `<span class="alert-dd is-today">오늘</span>`
        : dday != null && dday > 0 ? `<span class="alert-dd">D-${dday}</span>`
          : `<span class="alert-dd is-past">지남</span>`;
  const confirmed = item.source === "alert"
    ? (item.confirmed ? `<span class="src-tag src-official">확인된 알림</span>` : `<span class="src-tag src-neutral">공지 확인</span>`)
    : `<span class="src-tag src-neutral">공지 제목</span>`;
  return `<li class="alert-row">
    <div class="alert-when">${ddayBadge}${st === "undated" ? "" : `<span class="alert-period">${esc(periodText(item))}</span>`}</div>
    <div class="alert-main">
      <h3 class="alert-name"><a class="link" href="#/c/${esc(item.id)}">${esc(item.name)}</a>
        <span class="badge ${kind.tone}">${esc(kind.label)}</span>${confirmed}</h3>
      <p class="alert-title">${esc(item.title || "제목 없음")}</p>
      ${item.detail ? `<p class="alert-detail">${esc(item.detail)}</p>` : ""}
      <p class="alert-meta">${esc([item.sido, item.sigungu].filter(Boolean).join(" "))}${
        item.updated ? ` · 게시 ${esc(item.updated.slice(0, 10).replaceAll("-", "."))}` : ""}${
        item.to && from && to && daysBetween(from, to) === 0 ? "" : ""}</p>
    </div>
    <a class="btn btn-ghost btn-sm alert-go" href="#/c/${esc(item.id)}">상세${icon("chevron")}</a>
  </li>`;
}

export function renderAlerts(root: HTMLElement): void {
  if (!file) {
    root.innerHTML = `<div class="page"><header class="page-head">${iconTile("calendar", "orange", "lg")}
      <div class="page-head-text"><h1 class="page-title" tabindex="-1">휴장·정비 캘린더</h1>
      <p class="page-lead">${alertsFailed() ? "일정 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." : "불러오는 중…"}</p></div></header></div>`;
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
          <summary>일정 미상 <span class="alert-count">${arr.length}</span><span class="alert-group-hint">${esc(g.hint)}</span></summary>
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
        <h1 class="page-title" tabindex="-1">휴장·정비 캘린더</h1>
        <p class="page-lead">예약 전에 확인할 휴장·에어레이션·요금 변경 일정을 한곳에 모았습니다. 확인된 운영 알림과 공지 제목에서 날짜를 읽은 항목만 표시합니다.</p>
      </div>
    </header>
    <div class="stat-row">
      <div class="stat"><span class="stat-n">${counts.closure}</span><span class="stat-l">휴장</span></div>
      <div class="stat"><span class="stat-n">${counts.aeration}</span><span class="stat-l">에어레이션</span></div>
      <div class="stat"><span class="stat-n">${counts.fee}</span><span class="stat-l">요금 변경</span></div>
      <div class="stat"><span class="stat-n">${counts.undated}</span><span class="stat-l">일정 미상</span></div>
    </div>
    <div class="alert-toolbar">
      <div class="chip-row" role="group" aria-label="일정 종류">${kindChip("", "전체", all.length)}${kindChip("closure", "휴장", counts.closure)}${kindChip("aeration", "에어레이션", counts.aeration)}${kindChip("fee_change", "요금 변경", counts.fee)}</div>
      <label class="field field-inline"><span>지역</span>
        <select id="alert-sido"><option value="">전체</option>${sidoList.map((s) => `<option value="${esc(s)}"${state.sido === s ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>
      </label>
      <label class="check"><input type="checkbox" id="alert-undated"${state.undated ? " checked" : ""}> <span>일정 미상 포함</span></label>
      <label class="check"><input type="checkbox" id="alert-past"${state.includePast ? " checked" : ""}> <span>지난 일정 포함(${counts.past})</span></label>
      ${favs.size ? `<label class="check"><input type="checkbox" id="alert-fav"${state.favoritesOnly ? " checked" : ""}> <span>내 구장만</span></label>` : ""}
    </div>
    ${groups || `<div class="state-box"><h2 class="state-title">조건에 맞는 일정이 없습니다</h2>
      <p class="state-desc">${state.undated ? "종류·지역 필터를 넓히거나 지난 일정 포함을 켜 보세요." : "이 종류는 기간이 확인된 일정이 없습니다 — '일정 미상 포함'을 켜면 제목만 확인된 항목을 볼 수 있습니다."}</p></div>`}
    <p class="source-line">이 캘린더는 골프장 공지·운영 알림에서 확인된 일정만 담습니다. 공지 본문이 이미지이거나 기간을 읽지 못한 항목은 '일정 미상'으로 남겨 두었습니다. 예약 전 골프장에 확인하세요.</p>
    <p class="source-line">데이터 ${esc((file.dataset.built_at ?? "").slice(0, 10).replaceAll("-", "."))} · ${all.length}건 중 기간 확인 ${file.dataset.with_period ?? 0}건</p>
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
