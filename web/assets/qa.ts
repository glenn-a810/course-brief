/**
 * M6(1) — 관리자 데이터 QA 대시보드 (`#/admin-qa`).
 *
 * 이 서비스의 경쟁력은 540곳을 손으로 검증한 데이터인데, 지금까지 관리자 화면은 '보기'만 했다.
 * 채울 곳을 정하려면 "어느 구장의 어느 영역이 비었는지"를 한 화면에서 봐야 하므로,
 * 구장별·영역별 충실도를 히트맵으로 깔고, 값이 낡은 곳(90일+)·규정 파싱이 안 된 곳을
 * 같은 목록에서 걸러 볼 수 있게 한다.
 *
 * 데이터는 빌드가 만든 `data/v29/qa.json` 한 장(540행)이다. 상세 JSON 540개를 브라우저가
 * 받지 않도록, 채움률·확인일·파싱 여부를 빌드에서 미리 접는다(build-site.mjs).
 */
import { coverageBar, icon, iconTile } from "./icons.js";
import { daysSince } from "./rules.js";
import { esc, fmtDate } from "./util.js";
import { copyText } from "./text.js";

type AreaKey = "basic" | "course" | "fee" | "ops" | "facility" | "briefing" | "rental";

export interface QaRow {
  id: string;
  name: string;
  sido: string;
  sigungu: string;
  /** 7개 영역 채움률 0~1 (없는 영역은 키 없음) */
  cov: Partial<Record<AreaKey, number>>;
  /** 영역 평균(0~1). 상세가 없으면 null */
  avg: number | null;
  detail: boolean;
  fee_as_of: string | null;
  /** 공지를 수집한 날 */
  notice_at: string | null;
  /** 가장 최근 공지의 게시일 — 이 날짜가 오래됐으면 그 구장 공지는 낡은 것이다 */
  notice_latest: string | null;
  parking: boolean;
  transit: boolean;
  /** 예약 규정 원문 자체가 없는 구장 */
  has_rules: boolean;
  cancel_ok: boolean;
  open_ok: boolean;
}

interface QaFile {
  dataset: { built_at: string; count: number };
  areas: AreaKey[];
  rows: QaRow[];
}

const AREAS: Array<[AreaKey, string]> = [
  ["basic", "기본·입지"],
  ["course", "코스 스펙"],
  ["fee", "요금·예약"],
  ["ops", "현장 운영"],
  ["facility", "부대시설"],
  ["briefing", "공지·브리핑"],
  ["rental", "클럽 렌탈"],
];

/** 표 머리글용 짧은 이름 — 모바일에서 7개 열이 한 화면에 들어오도록 2글자로 줄인다 */
const SHORT: Record<AreaKey, string> = {
  basic: "기본", course: "코스", fee: "요금", ops: "운영", facility: "시설", briefing: "공지", rental: "렌탈",
};

const PAGE_STEP = 60;

interface QaState {
  q: string;
  only: Set<string>;
  sort: "low" | "high" | "name";
  shown: number;
}

function pct(v: number | undefined | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

/** 0~1을 6단계 색으로 — 히트맵 셀의 클래스 */
function heatLevel(v: number | undefined | null): number {
  if (v == null) return 0;
  if (v >= 0.8) return 5;
  if (v >= 0.6) return 4;
  if (v >= 0.4) return 3;
  if (v >= 0.2) return 2;
  if (v > 0) return 1;
  return 0;
}

function ageText(iso: string | null | undefined): { text: string; days: number | null } {
  const days = daysSince(iso);
  if (days == null) return { text: "확인일 없음", days: null };
  if (days === 0) return { text: "오늘", days };
  return { text: `${days}일 전`, days };
}

function matches(row: QaRow, st: QaState): boolean {
  if (st.q) {
    const needle = st.q.replace(/\s/g, "").toLowerCase();
    const hay = `${row.name}${row.sido}${row.sigungu}${row.id}`.replace(/\s/g, "").toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  for (const key of st.only) {
    if (key === "sparse" && !(row.avg != null && row.avg < 0.35)) return false;
    if (key === "no-detail" && row.detail) return false;
    if (key === "stale-fee" && !((daysSince(row.fee_as_of) ?? -1) > 90)) return false;
    if (key === "stale-notice" && !((daysSince(row.notice_latest ?? row.notice_at) ?? -1) > 90)) return false;
    if (key === "unparsed" && row.cancel_ok && row.open_ok) return false;
    if (key === "no-parking" && row.parking) return false;
    if (key === "no-transit" && row.transit) return false;
  }
  return true;
}

function sortRows(rows: QaRow[], sort: QaState["sort"]): QaRow[] {
  const copy = [...rows];
  if (sort === "name") return copy.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const sign = sort === "low" ? 1 : -1;
  return copy.sort((a, b) => {
    const av = a.avg ?? -1;
    const bv = b.avg ?? -1;
    if (av !== bv) return (av - bv) * sign;
    return a.name.localeCompare(b.name, "ko");
  });
}

function csvOf(rows: QaRow[]): string {
  const head = ["구장", "ID", ...AREAS.map(([, label]) => label), "평균", "요금확인", "공지수집", "주차", "셔틀", "취소파싱", "오픈파싱"];
  const lines = [head.join(",")];
  for (const r of rows) {
    lines.push([
      `"${r.name.replace(/"/g, '""')}"`,
      r.id,
      ...AREAS.map(([k]) => (r.cov[k] == null ? "" : Math.round((r.cov[k] as number) * 100))),
      r.avg == null ? "" : Math.round(r.avg * 100),
      r.fee_as_of ?? "",
      r.notice_at ?? "",
      r.parking ? "O" : "",
      r.transit ? "O" : "",
      r.cancel_ok ? "O" : "",
      r.open_ok ? "O" : "",
    ].join(","));
  }
  return lines.join("\n");
}

export async function renderQa(host: HTMLElement, dataBase: string): Promise<void> {
  host.innerHTML = `<div class="page"><p class="section-desc" role="status">QA 데이터를 불러오는 중…</p></div>`;
  let file: QaFile;
  try {
    const res = await fetch(`${dataBase}qa.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`qa.json ${res.status}`);
    file = (await res.json()) as QaFile;
  } catch (e) {
    host.innerHTML = `<div class="page"><div class="state-box" role="alert">
      <span class="state-icon">${icon("alert")}</span>
      <h1 class="state-title">QA 데이터를 불러오지 못했습니다</h1>
      <p class="state-desc">빌드에서 만든 data/v29/qa.json 이 필요합니다. 네트워크를 확인한 뒤 다시 시도해 주세요.</p>
      <a class="btn" href="#/about">데이터 안내로</a>
    </div></div>`;
    console.warn(e);
    return;
  }

  const rows = file.rows;
  const st: QaState = { q: "", only: new Set<string>(), sort: "low", shown: PAGE_STEP };

  const areaAvg = (k: AreaKey): number | null => {
    const vals = rows.map((r) => r.cov[k]).filter((v): v is number => typeof v === "number");
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const overall = (() => {
    const vals = rows.map((r) => r.avg).filter((v): v is number => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();
  const staleFee = rows.filter((r) => (daysSince(r.fee_as_of) ?? -1) > 90).length;
  const staleNotice = rows.filter((r) => (daysSince(r.notice_latest ?? r.notice_at) ?? -1) > 90).length;
  const badCancel = rows.filter((r) => !r.cancel_ok).length;
  const badOpen = rows.filter((r) => !r.open_ok).length;

  const buckets = [0, 0, 0, 0, 0];
  for (const r of rows) {
    if (r.avg == null) continue;
    const i = r.avg >= 0.8 ? 4 : r.avg >= 0.6 ? 3 : r.avg >= 0.4 ? 2 : r.avg >= 0.2 ? 1 : 0;
    buckets[i] += 1;
  }
  const maxBucket = Math.max(1, ...buckets);
  const bucketLabels = ["~20%", "20~40%", "40~60%", "60~80%", "80%+"];

  host.innerHTML = `<div class="page qa-page">
    <header class="page-head">
      ${iconTile("chart", "purple", "lg")}
      <div class="page-head-text">
        <h1 class="page-title" tabindex="-1">데이터 QA</h1>
        <p class="page-lead">영역별 충실도·낡은 값·파싱 실패를 한 화면에서 봅니다. 관리자 모드에서만 열립니다. 기준 ${esc(fmtDate(file.dataset?.built_at))}</p>
      </div>
    </header>

    <div class="stat-row">
      <div class="stat"><span class="stat-n">${rows.length}</span><span class="stat-l">구장</span></div>
      <div class="stat"><span class="stat-n">${pct(overall)}</span><span class="stat-l">평균 충실도</span></div>
      <div class="stat"><span class="stat-n">${staleFee}</span><span class="stat-l">요금 90일 경과</span></div>
      <div class="stat"><span class="stat-n">${staleNotice}</span><span class="stat-l">공지 90일 경과</span></div>
      <div class="stat"><span class="stat-n">${badCancel}</span><span class="stat-l">취소 규정 미파싱</span></div>
      <div class="stat"><span class="stat-n">${badOpen}</span><span class="stat-l">오픈 규칙 미파싱</span></div>
    </div>

    <section class="about-block">
      <h2 class="h2">영역별 충실도</h2>
      <div class="cov-list">${AREAS.map(([k, label]) => coverageBar(label, areaAvg(k) ?? 0, `${rows.filter((r) => typeof r.cov[k] === "number").length}곳`)).join("")}</div>
      <div class="qa-hist" role="img" aria-label="구장별 평균 충실도 분포">
        ${buckets.map((n, i) => `<div class="qa-hist-col">
          <span class="qa-hist-n">${n}</span>
          <span class="qa-hist-bar" style="height:${Math.round((n / maxBucket) * 100)}%"></span>
          <span class="qa-hist-l">${bucketLabels[i]}</span>
        </div>`).join("")}
      </div>
      <p class="source-line">구장별 평균 충실도의 분포입니다. 막대 위 숫자는 구장 수.</p>
    </section>

    <section class="about-block qa-board">
      <div class="qa-board-head">
        <h2 class="h2">구장 × 영역 히트맵</h2>
        <div class="qa-tools">
          <div class="searchbox searchbox-sm">
            <input id="qa-q" type="search" placeholder="구장·지역 검색" aria-label="구장 검색">
          </div>
          <select id="qa-sort" aria-label="정렬">
            <option value="low">충실도 낮은순</option>
            <option value="high">충실도 높은순</option>
            <option value="name">이름순</option>
          </select>
          <button type="button" class="btn btn-ghost btn-sm" id="qa-csv">${icon("copy")}CSV 복사</button>
        </div>
      </div>
      <div class="chip-row qa-chips" role="group" aria-label="필터">
        <button type="button" class="chip" data-only="sparse">미확인 집중</button>
        <button type="button" class="chip" data-only="stale-fee">요금 90일+</button>
        <button type="button" class="chip" data-only="stale-notice">공지 90일+</button>
        <button type="button" class="chip" data-only="unparsed">규정 미파싱</button>
        <button type="button" class="chip" data-only="no-parking">주차 미확인</button>
        <button type="button" class="chip" data-only="no-transit">셔틀·대중교통 미확인</button>
        <button type="button" class="chip" data-only="no-detail">요약 데이터만</button>
      </div>
      <p class="qa-count" id="qa-count" role="status"></p>
      <div class="table-wrap qa-table-wrap">
        <table class="qa-table">
          <thead>
            <tr><th scope="col" class="qa-col-name">구장</th>${AREAS.map(([k, l]) => `<th scope="col" title="${esc(l)}"><span aria-hidden="true">${esc(SHORT[k])}</span><span class="sr-only">${esc(l)}</span></th>`).join("")}<th scope="col" class="qa-col-num">평균</th><th scope="col" class="qa-col-age">값 신선도</th></tr>
          </thead>
          <tbody id="qa-body"></tbody>
        </table>
      </div>
      <div class="qa-more"><button type="button" class="btn-more" id="qa-more" hidden>더 보기</button></div>
      <p class="source-line"><a class="link" href="#/report">제보 창구</a>로 들어온 사용자 제보는 GitHub 이슈에서 확인합니다. 히트맵은 확인된 값의 비율이며, 비어 있는 값은 '없음'이 아니라 '미확인'입니다.</p>
    </section>

    <section class="about-block">
      <h2 class="h2">값이 낡은 구장</h2>
      <p class="section-desc">요금 확인일 또는 공지 수집일이 90일을 넘긴 곳입니다. 요금은 라운드 전 최우선 재확인 대상입니다.</p>
      <div class="qa-list" id="qa-stale"></div>
    </section>

    <section class="about-block">
      <h2 class="h2">규정 파싱 실패</h2>
      <p class="section-desc">취소 마감·예약 오픈을 문장에서 읽지 못한 구장입니다. 원문이 없으면 '원문 없음', 있으면 '파싱 실패'입니다.</p>
      <div class="qa-list" id="qa-unparsed"></div>
    </section>
  </div>`;

  const body = host.querySelector<HTMLElement>("#qa-body");
  const count = host.querySelector<HTMLElement>("#qa-count");
  const more = host.querySelector<HTMLButtonElement>("#qa-more");
  const status = count;
  if (!body || !count || !more) return;

  const filtered = (): QaRow[] => sortRows(rows.filter((r) => matches(r, st)), st.sort);

  const heatCell = (r: QaRow, k: AreaKey, label: string): string => {
    const v = r.cov[k];
    const level = heatLevel(v);
    const title = `${label} ${pct(v)}`;
    return `<td class="hm-cell"><span class="hm hm-${level}" title="${esc(title)}"><span class="sr-only">${esc(title)}</span></span></td>`;
  };

  const rowHTML = (r: QaRow): string => {
    const fee = ageText(r.fee_as_of);
    const notice = ageText(r.notice_latest ?? r.notice_at);
    const stale = (fee.days ?? 999) > 90 || (notice.days ?? 999) > 90;
    return `<tr>
      <th scope="row" class="qa-col-name"><a class="link" href="#/c/${esc(r.id)}">${esc(r.name)}</a>
        <span class="qa-sub">${esc([r.sido, r.sigungu].filter(Boolean).join(" "))}</span>
        ${r.parking ? "" : `<span class="qa-flag" title="주차 미확인">주차</span>`}
        ${r.transit ? "" : `<span class="qa-flag" title="셔틀·대중교통 미확인">교통</span>`}
      </th>
      ${AREAS.map(([k, label]) => heatCell(r, k, label)).join("")}
      <td class="num qa-col-num">${r.avg == null ? "—" : Math.round(r.avg * 100)}</td>
      <td class="qa-age qa-col-age${stale ? " is-stale" : ""}">${esc(fee.text)}<span class="qa-sub">요금</span></td>
    </tr>`;
  };

  const paint = (): void => {
    const list = filtered();
    const shown = list.slice(0, st.shown);
    body.innerHTML = shown.map(rowHTML).join("") || `<tr><td colspan="${AREAS.length + 3}" class="qa-empty">조건에 맞는 구장이 없습니다.</td></tr>`;
    count.textContent = `${list.length}곳 중 ${shown.length}곳 표시${st.only.size ? ` · 필터 ${[...st.only].length}개` : ""}`;
    more.hidden = list.length <= shown.length;
    for (const btn of host.querySelectorAll<HTMLElement>("[data-only]")) {
      const on = btn.dataset.only ? st.only.has(btn.dataset.only) : false;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
    if (status === count) {
      // 스크린리더용 — 같은 문구를 role=status 로도 알린다
      count.setAttribute("aria-live", "polite");
    }
  };

  const paintLists = (): void => {
    const stale = host.querySelector<HTMLElement>("#qa-stale");
    const unparsed = host.querySelector<HTMLElement>("#qa-unparsed");
    if (stale) {
      const list = rows
        .map((r) => ({ r, fee: ageText(r.fee_as_of), notice: ageText(r.notice_latest ?? r.notice_at) }))
        .filter((x) => (x.fee.days ?? 999) > 90 || (x.notice.days ?? 999) > 90)
        .sort((a, b) => Math.max(b.fee.days ?? 0, b.notice.days ?? 0) - Math.max(a.fee.days ?? 0, a.notice.days ?? 0))
        .slice(0, 40);
      stale.innerHTML = list.length
        ? `<ul class="qa-list-rows">${list.map(({ r, fee, notice }) => `<li>
            <a class="link" href="#/c/${esc(r.id)}">${esc(r.name)}</a>
            <span class="qa-sub">요금 ${esc(fee.text)} · 공지 ${esc(notice.text)}</span>
          </li>`).join("")}</ul><p class="source-line">상위 40곳만 표시합니다. 전체는 위 히트맵의 '요금 90일+'·'공지 90일+' 필터로 확인하세요.</p>`
        : `<p class="section-desc">90일을 넘긴 값이 없습니다.</p>`;
    }
    if (unparsed) {
      const list = rows.filter((r) => !r.cancel_ok || !r.open_ok).slice(0, 40);
      unparsed.innerHTML = list.length
        ? `<ul class="qa-list-rows">${list.map((r) => `<li>
            <a class="link" href="#/c/${esc(r.id)}">${esc(r.name)}</a>
            <span class="qa-sub">${[
              r.has_rules ? "" : "원문 없음",
              r.cancel_ok ? "" : "취소 미파싱",
              r.open_ok ? "" : "오픈 미파싱",
            ].filter(Boolean).join(" · ")}</span>
          </li>`).join("")}</ul>`
        : `<p class="section-desc">파싱 실패가 없습니다.</p>`;
    }
  };

  host.querySelector("#qa-q")?.addEventListener("input", (ev) => {
    st.q = (ev.target as HTMLInputElement).value.trim();
    st.shown = PAGE_STEP;
    paint();
  });
  host.querySelector("#qa-sort")?.addEventListener("change", (ev) => {
    const v = (ev.target as HTMLSelectElement).value;
    st.sort = v === "high" || v === "name" ? v : "low";
    paint();
  });
  for (const btn of host.querySelectorAll<HTMLButtonElement>("[data-only]")) {
    btn.addEventListener("click", () => {
      const key = btn.dataset.only;
      if (!key) return;
      if (st.only.has(key)) st.only.delete(key);
      else st.only.add(key);
      st.shown = PAGE_STEP;
      paint();
    });
  }
  more.addEventListener("click", () => {
    st.shown += PAGE_STEP * 2;
    paint();
  });
  host.querySelector("#qa-csv")?.addEventListener("click", () => {
    const list = filtered();
    void copyText(csvOf(list)).then((ok) => {
      count.textContent = ok ? `${list.length}곳을 CSV로 복사했습니다.` : "복사하지 못했습니다.";
    });
  });

  paint();
  paintLists();
}
