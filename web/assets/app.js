import {
  STATUS, badge, chosung, debounce, esc, fmtDate, fmtNum, fmtPct, fmtWon, isMissing, textOf,
} from "./util.js";
import { createSearchAdapter } from "./search.js";

const CONFIG = {
  dataBase: "data/v29/",
  pageSize: 48,
  ...(window.COURSEBRIEF_CONFIG || {}),
};
const REPO_URL = CONFIG.repoUrl || "https://github.com/glenn-a810/course-brief";

const OPS = {
  nocaddie: "노캐디", two_player: "2인 플레이", three_player: "3인 플레이",
  five_player: "5인 플레이", marshal_caddie: "마샬 캐디", cart_type: "카트 종류",
  cart_entry: "카트 페어웨이 진입", bagdrop: "셀프 백드롭", mat: "매트 티샷",
  checkin: "체크인", locker: "락카", sauna: "사우나", dress: "복장 규정", pace: "진행 속도",
};
const FAC = {
  practice: "연습그린·연습장", indoor_range: "실내 연습장", food: "식당·조식",
  snack_bar: "그늘집·스낵", locker_sauna: "락카·사우나", lodging: "숙박",
  other: "기타 시설", night: "야간 라운드", closed_days: "휴장일", shuttle: "셔틀",
  ev_charge: "전기차 충전", proshop: "프로샵",
};
const GRASS = { tee: "티잉구역", fairway: "페어웨이", green: "그린" };
const LEVEL = { info: "info", caution: "warn", closure: "danger" };

const state = {
  index: null,
  clusters: new Map(),
  sido: [],
  rental: null,
  adapter: null,
  q: "",
  filters: { sido: "", type: "", holes: "", fee: "", sort: "name", status: new Set(["operating"]) },
  shown: CONFIG.pageSize,
  matches: null, // Map<id, score> | null
  groups: [],
  navToken: 0,
};

const $ = (sel) => document.querySelector(sel);

/* ---------------- 데이터 ---------------- */
async function loadJSON(name) {
  const res = await fetch(`${CONFIG.dataBase}${name}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  return res.json();
}

async function boot() {
  try {
    const [index, clusters, sido, rental] = await Promise.all([
      loadJSON("index.json"),
      loadJSON("clusters.json").catch(() => ({ clusters: [] })),
      loadJSON("sido.json").catch(() => ({ sido: [] })),
      loadJSON("rental_providers.json").catch(() => null),
    ]);
    state.index = index;
    state.rental = rental;
    for (const c of index.clusters || clusters.clusters || []) state.clusters.set(c.id, c);
    state.sido = sido.sido || index.sido || [];
    state.adapter = await createSearchAdapter(CONFIG, { courses: index.courses });
    buildStaticUI();
    await route();
    window.addEventListener("hashchange", () => { state.shown = CONFIG.pageSize; route(); });
  } catch (err) {
    console.error(err);
    $("#results").innerHTML = `<div class="error-box">
      <strong>데이터를 불러오지 못했습니다.</strong>
      <p>${esc(err.message)}</p>
      <p>정적 서버로 열어야 합니다. 리포지토리에서 <code>npm run preview</code> 또는 <code>npm run build</code> 후 <code>npx serve dist</code> 로 확인하세요.</p>
    </div>`;
  }
}

function buildStaticUI() {
  const d = state.index.dataset;
  $("#hero-count").textContent = String(d.counts.total);
  $("#footer-meta").textContent =
    `${d.version} · ${d.built_at?.slice(0, 10).replaceAll("-", ".") || ""} 기준 · ${d.counts.total}곳 (상세 ${d.counts.with_detail} / 요약 ${d.counts.master_only})`;

  const sel = $("#f-sido");
  for (const s of state.sido) {
    const o = document.createElement("option");
    o.value = s.code;
    o.textContent = `${s.short || s.name} (${s.count})`;
    sel.appendChild(o);
  }
  const chips = $("#status-chips");
  for (const btn of chips.querySelectorAll(".chip")) {
    const st = btn.dataset.status;
    const n = state.index.dataset.counts[st] ?? 0;
    btn.innerHTML = `${esc(STATUS[st]?.label || st)}<span class="n">${n}</span>`;
    btn.setAttribute("aria-pressed", state.filters.status.has(st) ? "true" : "false");
  }
}

/* ---------------- 상태·URL ---------------- */
function readHashQuery() {
  const hash = location.hash.replace(/^#/, "");
  const qi = hash.indexOf("?");
  if (qi < 0) return new URLSearchParams();
  return new URLSearchParams(hash.slice(qi + 1));
}

function hashQueryFromState() {
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

function syncHash() {
  history.replaceState(null, "", hashQueryFromState());
}

function applyHashQuery(params) {
  if (!params) return;
  state.q = params.get("q") || "";
  $("#q").value = state.q;
  $("#q-clear").hidden = !state.q;
  const f = state.filters;
  f.sido = params.get("sido") || "";
  f.type = params.get("type") || "";
  f.holes = params.get("holes") || "";
  f.fee = params.get("fee") || "";
  f.sort = params.get("sort") || "name";
  const st = params.get("status");
  f.status = new Set(st ? st.split(",").filter((s) => STATUS[s]) : ["operating"]);
  $("#f-sido").value = f.sido;
  $("#f-type").value = f.type;
  $("#f-holes").value = f.holes;
  $("#f-fee").value = f.fee;
  $("#f-sort").value = f.sort;
  for (const btn of $("#status-chips").querySelectorAll(".chip")) {
    const on = f.status.has(btn.dataset.status);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

/* ---------------- 목록 ---------------- */
function buildGroups(courses) {
  const grouped = new Map();
  for (const c of courses) {
    const key = c.cluster && state.clusters.has(c.cluster) ? c.cluster : `id:${c.id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(c);
  }
  const groups = [];
  for (const [key, members] of grouped) {
    const cluster = key.startsWith("id:") ? null : state.clusters.get(key);
    const holes = members.reduce((a, m) => a + (m.holes || 0), 0);
    const fees = members.map((m) => m.green_fee?.weekend ?? m.green_fee?.weekday).filter((v) => v != null);
    groups.push({
      key,
      name: cluster?.name || members[0].name,
      cluster,
      members: members.sort((a, b) => (b.holes || 0) - (a.holes || 0)),
      holes,
      fee: fees.length ? Math.min(...fees) : null,
      sido: members[0].sido,
      sigungu: [...new Set(members.map((m) => m.sigungu).filter(Boolean))].join(", "),
      statuses: [...new Set(members.map((m) => m.status))],
    });
  }
  return groups;
}

function passesFilters(c) {
  const f = state.filters;
  if (f.status.size && !f.status.has(c.status)) return false;
  if (f.sido && c.sido_code !== f.sido) return false;
  if (f.type && c.type !== f.type) return false;
  if (f.holes) {
    const h = c.holes || 0;
    if (f.holes === "36" ? h < 36 : h !== Number(f.holes)) return false;
  }
  if (f.fee) {
    const v = c.green_fee?.weekend ?? c.green_fee?.weekday;
    if (v == null || v > Number(f.fee)) return false;
  }
  return true;
}

function sortGroups(groups) {
  const s = state.filters.sort;
  const arr = [...groups];
  if (s === "fee-asc") arr.sort((a, b) => (a.fee ?? Infinity) - (b.fee ?? Infinity) || a.name.localeCompare(b.name, "ko"));
  else if (s === "fee-desc") arr.sort((a, b) => (b.fee ?? -1) - (a.fee ?? -1) || a.name.localeCompare(b.name, "ko"));
  else if (s === "holes-desc") arr.sort((a, b) => b.holes - a.holes || a.name.localeCompare(b.name, "ko"));
  else arr.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return arr;
}

async function renderList({ reset = false } = {}) {
  const courses = state.index.courses;
  let allowed = null;
  if (state.q) {
    const res = await state.adapter.search(state.q, { limit: 0 });
    allowed = new Map((res || []).map((r) => [r.id, r.score]));
    $("#search-mode").hidden = false;
    $("#search-mode").textContent = `${state.adapter.label} · ${allowed.size}건 일치`;
  } else {
    $("#search-mode").hidden = true;
  }

  const filtered = courses.filter((c) => (allowed ? allowed.has(c.id) : true) && passesFilters(c));
  let groups = sortGroups(buildGroups(filtered));
  if (allowed) {
    // 검색 점수 순서를 유지(그룹은 최고 점수 기준)
    groups.sort((a, b) => {
      const sa = Math.max(...a.members.map((m) => allowed.get(m.id) ?? 0));
      const sb = Math.max(...b.members.map((m) => allowed.get(m.id) ?? 0));
      return sb - sa;
    });
  }
  state.groups = groups;

  const totalCourses = state.index.courses.length;
  const n = groups.length;
  const stLabel = state.filters.status.size
    ? [...state.filters.status].map((s) => STATUS[s].label).join("·")
    : "전체";
  $("#result-count").textContent =
    `${stLabel} · ${n.toLocaleString("ko-KR")}개 시설 / ${filtered.length.toLocaleString("ko-KR")}개 구장 (전체 ${totalCourses}곳)`;

  if (reset) state.shown = CONFIG.pageSize;
  const slice = groups.slice(0, state.shown);
  $("#results").innerHTML = slice.map(cardHTML).join("");
  $("#empty").hidden = n > 0;
  $("#more").hidden = n <= state.shown;
  $("#more").textContent = `더 보기 (${state.shown} / ${n})`;
}

function cardHTML(g) {
  const s = g.statuses.length === 1 ? g.statuses[0] : "operating";
  const st = STATUS[s] || STATUS.operating;
  const fee = g.fee;
  const feeLine = fee == null
    ? `<span>그린피 <b>미확인</b></span>`
    : `<span>주말 <b>${fmtWon(fee)}</b>~</span>`;
  const title = g.members.length > 1 ? `${g.name} (${g.holes}홀)` : g.name;
  const sub = g.members.length > 1
    ? g.members.map((m) => `${m.name} ${m.holes ? m.holes + "홀" : ""}`.trim()).join(" + ")
    : `${g.sido || ""} ${g.sigungu || ""}`.trim();

  const memberLinks = g.members.length > 1
    ? `<div class="card-members">${g.members.map((m) => {
        const ms = STATUS[m.status] || STATUS.operating;
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
        const ms = STATUS[m.status] || STATUS.operating;
        return `<a href="#/c/${esc(m.id)}">${esc(m.name)}${m.holes ? ` · ${m.holes}홀` : ""}${
          m.status !== "operating" ? ` <span class="badge ${ms.tone}">${esc(ms.label)}</span>` : ""}</a>`;
      }).join("")}</div>
      <div class="card-fee">${feeLine}</div>
    </div>`;
}

/* ---------------- 상세 ---------------- */
async function renderDetail(id) {
  const course = state.index.courses.find((c) => c.id === id);
  if (!course) {
    $("#view-detail").innerHTML = `<div class="page"><div class="error-box">해당 골프장을 찾을 수 없습니다. <a href="#/">목록으로</a></div></div>`;
    return;
  }
  let detail = null;
  if (course.detail) {
    try {
      detail = await loadJSON(`courses/${id}.json`);
    } catch (e) {
      console.warn(e);
    }
  }
  const cluster = course.cluster ? state.clusters.get(course.cluster) : null;
  const others = cluster
    ? (cluster.members || []).filter((m) => m !== course.name).map((name) => {
        const mc = state.index.courses.find((c) => c.name === name);
        return mc ? { name, id: mc.id, holes: mc.holes } : { name };
      })
    : [];

  const st = STATUS[course.status] || STATUS.operating;
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
        <div><dt>좌표</dt><dd>${course.lat != null ? `<a href="https://www.google.com/maps?q=${course.lat},${course.lng}" target="_blank" rel="noopener noreferrer">${course.lat.toFixed(5)}, ${course.lng.toFixed(5)}</a>` : "—"}</dd></div>
      </dl>
    </div>`;

  const clusterBox = cluster ? `<div class="callout info">
      <strong>같은 부지 시설 ${cluster.members?.length || 1}개 코스</strong>
      ${esc(cluster.relationship || cluster.basis || "같은 소재지의 코스가 별도 레코드로 등록되어 있습니다.")}
      ${others.length ? `<div class="tags" style="margin-top:8px">${others.map((o) =>
        o.id ? `<a class="tag" href="#/c/${esc(o.id)}">${esc(o.name)}${o.holes ? ` · ${o.holes}홀` : ""} →</a>`
             : `<span class="tag">${esc(o.name)}</span>`).join("")}</div>` : ""}
    </div>` : "";

  const nav = `
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

  $("#view-detail").innerHTML = `<div class="detail">${head}${clusterBox}${nav}${body}</div>`;
  window.scrollTo({ top: 0 });
}

function shortUrl(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

function feeSummaryText(c) {
  const f = c.green_fee;
  if (!f) return "미확인";
  const parts = [];
  if (f.weekday) parts.push(`주중 ${fmtWon(f.weekday)}`);
  if (f.weekend) parts.push(`주말 ${fmtWon(f.weekend)}`);
  if (!parts.length) return "미확인";
  return `${parts.join(" / ")} <span class="sub">${f.basis === "official" ? "공식 요금표" : "실거래 관측 최저가"}${f.as_of ? ` · ${fmtDate(f.as_of)}` : ""}</span>`;
}

function valCell(v) {
  if (isMissing(v)) return null;
  const t = textOf(v);
  if (!t || t === "미확인") return null;
  return t;
}

function evidenceDetails(evidence, label = "근거") {
  const arr = (Array.isArray(evidence) ? evidence : []).filter(Boolean).slice(0, 3);
  if (!arr.length) return "";
  return `<details class="ev"><summary>${esc(label)} ${arr.length}건</summary><ul>${arr
    .map((e) => `<li>${esc(String(e).slice(0, 220))}</li>`).join("")}</ul></details>`;
}

function kvRow(label, value, sub = "") {
  return `<div class="kv"><dt>${esc(label)}</dt><dd>${value}${sub ? `<span class="sub">${sub}</span>` : ""}</dd></div>`;
}

function sections(d, c) {
  const m = d.master || {};
  const co = d.course || {};
  const fee = d.fee || {};
  const cancel = d.cancel || {};
  const ops = d.ops || {};
  const fac = d.facilities || {};
  const br = d.briefing || {};
  const rt = d.rental || {};
  const cov = d.coverage || {};

  /* 01 기본·입지 */
  const holes = m.holes || {};
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
      ${kvRow("면적", m.area_sqm ? `${fmtNum(m.area_sqm)}㎡ ${m.area_sqm ? `(${fmtNum(Math.round(m.area_sqm / 3.3058))}평)` : ""}` : "미확인")}
      ${kvRow("운영사", esc((m.operators || []).join(", ") || "미확인"), m.operators_note ? esc(m.operators_note) : "")}
      ${m.designer ? kvRow("설계", esc(m.designer)) : ""}
      ${kvRow("주소", esc(m.address || "미확인"), m.address_note ? esc(m.address_note) : "")}
      ${m.nearest_ic ? kvRow("최단 IC", `${esc(m.nearest_ic.name)}${m.nearest_ic.distance_km ? ` · ${m.nearest_ic.distance_km}km` : ""}`, esc(m.nearest_ic.source || "")) : ""}
      ${m.nearest_ic_note ? kvRow("IC 비고", esc(m.nearest_ic_note)) : ""}
      ${m.expected_open ? kvRow("개장 예정", esc(m.expected_open), esc(m.project_stage || "")) : ""}
      ${m.access === "military_only" ? `<div class="callout warn"><strong>군 전용 체력단련장</strong>일반인 이용이 제한되는 시설입니다(현역·군인공제회 등).</div>` : ""}
      ${(m.name_variants || []).length > 1 ? kvRow("이명·구 명칭", esc(m.name_variants.slice(0, 8).join(", "))) : ""}
      ${(m.merged_ids || []).length ? kvRow("병합된 레코드", esc((m.merged_ids || []).join(", ")), "중복 등록이 확인되어 하나로 합친 구장입니다") : ""}
    </div>
  </section>`;

  /* 02 코스 스펙 */
  const grass = co.grass || {};
  const grassRows = Object.entries(GRASS).map(([k, label]) => {
    const g = grass[k];
    if (isMissing(g)) return null;
    if (typeof g === "object" && g.value === undefined && g.evidence) return null;
    const t = valCell(g);
    return t ? kvRow(`잔디 · ${label}`, esc(t)) : null;
  }).filter(Boolean).join("");

  let kgaHTML = "";
  const kga = co.kga || m.kga;
  if (kga && typeof kga === "object") {
    const combos = kga.hole_combinations || [];
    if (combos.length) {
      const rows = [];
      for (const cb of combos.slice(0, 4)) {
        for (const t of (cb.tees || []).slice(0, 8)) {
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
    } else if (typeof kga === "string") {
      kgaHTML = esc(kga);
    }
  }

  const s2 = `
  <section class="section" id="s2">
    <h2><span class="num">02</span>코스 스펙</h2>
    <p class="section-desc">홀수·파·길이·잔디와 KGA 공식 레이팅. 레이팅은 난이도 비교의 1차 기준입니다.</p>
    <div class="section-body">
      ${kvRow("홀수 / 파", esc([co.holes ? `${co.holes}홀` : null, co.par ? `파 ${co.par}` : null].filter(Boolean).join(" / ") || "미확인"))}
      ${co.length_m ? kvRow("전장", `${fmtNum(co.length_m)}m (${fmtNum(Math.round(co.length_m * 1.0936))}yd)`) : ""}
      ${(co.blocks || []).length ? kvRow("코스 구성", esc(co.blocks.join(", "))) : ""}
      ${(m.course_blocks || []).length ? kvRow("세부 코스명", esc(m.course_blocks.join(", "))) : ""}
      ${co.course_names ? kvRow("코스명", esc(textOf(co.course_names))) : ""}
      ${kvRow("야간 라운드", isMissing(co.night_light) ? "미확인" : esc(textOf(co.night_light)))}
      ${grassRows}
      ${co.kga_hole_est ? kvRow("KGA 추정 홀수", esc(String(co.kga_hole_est))) : ""}
      ${co.extra_courses ? kvRow("추가 코스", esc(textOf(co.extra_courses))) : ""}
      ${kgaHTML ? `<div>${kgaHTML}</div>` : ""}
      ${co.hole_by_hole ? `<details class="ev"><summary>홀별 파·거리 보기</summary><pre class="pre">${esc(JSON.stringify(co.hole_by_hole, null, 1))}</pre></details>` : ""}
    </div>
  </section>`;

  /* 03 요금·예약·취소 */
  const unavailable = c.status === "closed" || c.status === "suspended";
  const feeNote = (fee.basis ? `<span class="sub">${esc(fee.basis)}</span>` : "");
  const asOf = fee.as_of || fee.checked_at;
  const member = fee.member;
  const tableHTML = (() => {
    const rows = (fee.official_table?.rows || []).filter((r) => r && (r.value || r.amounts?.length));
    if (!rows.length) return "";
    const groups = [];
    for (const r of rows) {
      const sec = (r.section || "요금").trim();
      let g = groups.find((x) => x.sec === sec);
      if (!g) { g = { sec, rows: [] }; groups.push(g); }
      const key = `${r.label || ""}|${r.value || ""}`;
      if (!g.rows.some((x) => `${x.label || ""}|${x.value || ""}` === key)) g.rows.push(r);
    }
    const groupHTML = (g) => `<tr class="group"><th colspan="2">${esc(g.sec === "구분" ? "요금" : g.sec)}</th></tr>` +
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
  const od = fee.official_detail || {};
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
      ${(fee.sources || []).length ? `<p class="section-desc">출처: ${fee.sources.slice(0, 4).map((s) => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.source || shortUrl(s.url))}</a>` : esc(s.source || "")).join(" · ")}</p>` : ""}
    </div>
  </section>`;

  /* 04 현장 운영 */
  const opsRows = [];
  const opsUnknown = [];
  for (const [k, label] of Object.entries(OPS)) {
    const v = ops[k];
    if (!v) { opsUnknown.push(label); continue; }
    const t = valCell(v.value);
    if (t) opsRows.push(kvRow(label, esc(t), evidenceDetails(v.evidence)));
    else opsUnknown.push(label);
  }
  const s4 = `
  <section class="section" id="s4">
    <h2><span class="num">04</span>현장 운영</h2>
    <p class="section-desc">노캐디·인원·카트·체크인처럼 예약 전에 알아야 하는 실제 플레이 조건.</p>
    <div class="section-body">
      ${opsRows.join("") || `<div class="callout">공식 채널에서 확인된 운영 정보가 아직 없습니다. 아래 항목은 전화·현장 확인이 필요합니다.</div>`}
      ${opsUnknown.length ? `<p class="unconfirmed-line">미확인 ${opsUnknown.length}개: ${esc(opsUnknown.join(", "))}</p>` : ""}
    </div>
  </section>`;

  /* 05 부대시설 */
  const facRows = [];
  const facUnknown = [];
  for (const [k, label] of Object.entries(FAC)) {
    const v = fac[k];
    if (!v) { facUnknown.push(label); continue; }
    const t = valCell(v.value);
    if (t) facRows.push(kvRow(label, esc(t), evidenceDetails(v.evidence)));
    else facUnknown.push(label);
  }
  const s5 = `
  <section class="section" id="s5">
    <h2><span class="num">05</span>부대시설</h2>
    <p class="section-desc">연습·식음·락카·숙박·야간 조명 등 라운드 환경.</p>
    <div class="section-body">
      ${facRows.join("") || `<div class="callout">확인된 부대시설 정보가 없습니다.</div>`}
      ${facUnknown.length ? `<p class="unconfirmed-line">미확인 ${facUnknown.length}개: ${esc(facUnknown.join(", "))}</p>` : ""}
      ${(fac.gf_facilities || []).length ? `<p class="section-desc">참고: ${esc(fac.gf_facilities.slice(0, 3).join(" / "))}</p>` : ""}
    </div>
  </section>`;

  /* 06 브리핑·공지 */
  const alert = br.alert;
  const notices = (br.notices?.items || []).slice(0, 10);
  const noticeHTML = notices.length ? `<ul class="notice-list">${notices.map((n) => {
    const link = n.url && /^https?:/.test(n.url);
    const title = link ? `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>` : esc(n.title);
    return `<li><time>${esc(fmtDate(n.date))}</time><span>${title}</span></li>`;
  }).join("")}</ul>` : `<p class="section-desc">최근 공지를 확인하지 못했습니다. 공지 게시판이 없거나 이미지 본문만 있는 경우입니다.</p>`;
  const s6 = `
  <section class="section" id="s6">
    <h2><span class="num">06</span>브리핑·공지</h2>
    <p class="section-desc">휴장·에어레이션·요금 변경 같은 최근 공지와 라운더 평가. 예약 전에 가장 먼저 볼 영역입니다.</p>
    <div class="section-body">
      ${alert ? `<div class="callout ${LEVEL[alert.level] || "info"}">
        <strong>${esc(alert.summary || (alert.confirmed ? "확인된 공지" : "확인 필요"))}</strong>
        ${esc(alert.detail || "")}
        ${alert.period ? `<div class="sub">기간: ${esc(alert.period)}</div>` : ""}
        ${alert.source_url ? `<div class="sub"><a href="${esc(alert.source_url)}" target="_blank" rel="noopener noreferrer">근거 보기</a></div>` : ""}
      </div>` : ""}
      ${br.review ? kvRow("라운더 평가", `${fmtNum(br.review.score_10, 1)} / 10${br.review.count ? ` · ${fmtNum(br.review.count)}건` : ""}`, esc(br.review.note || br.review.source || "")) : ""}
      ${br.course_notes ? kvRow("코스 메모", esc(br.course_notes)) : ""}
      ${br.recent_notice_text ? kvRow("공지 요약", esc(br.recent_notice_text)) : ""}
      <div>
        <h3 class="h3">최근 공지</h3>
        ${noticeHTML}
      </div>
      ${(br.notices?.tags && Object.keys(br.notices.tags).length) ? `<div class="tags">${Object.entries(br.notices.tags).slice(0, 6).map(([tag, arr]) =>
        `<span class="tag">${esc(tag)} ${Array.isArray(arr) ? arr.length : ""}</span>`).join("")}</div>` : ""}
      ${(br.notices?.url) ? `<p class="section-desc">공지 게시판: ${/^https?:/.test(br.notices.url) ? `<a href="${esc(br.notices.url)}" target="_blank" rel="noopener noreferrer">${esc(shortUrl(br.notices.url))}</a>` : "수집 아카이브"}</p>` : ""}
      ${(br.unconfirmed || []).length ? `<p class="unconfirmed-line">아직 확인되지 않은 항목 ${br.unconfirmed.length}개: ${esc(br.unconfirmed.slice(0, 14).join(", "))}</p>` : ""}
      ${br.collected_at ? `<p class="section-desc">수집 ${fmtDate(br.collected_at)}</p>` : ""}
      ${(br.sources || []).length ? `<p class="section-desc">출처: ${br.sources.slice(0, 5).map((u) => /^https?:/.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(shortUrl(u))}</a>` : esc(u)).join(" · ")}</p>` : ""}
    </div>
  </section>`;

  /* 07 클럽 렌탈 */
  const nd = rt.nearby_delivery;
  const rtRows = [
    ["대여 가능", rt.available], ["풀세트 요금", rt.full_set != null ? fmtWon(rt.full_set) : null],
    ["요금 안내", rt.fee_text], ["브랜드", rt.brand], ["좌타용", rt.left_handed],
    ["골프화", rt.shoes], ["9홀", rt.nine_hole], ["거리측정기", rt.range_finder],
    ["사전 예약", rt.reservation],
  ].map(([label, v]) => {
    const t = valCell(v);
    return t ? kvRow(label, esc(t)) : null;
  }).filter(Boolean).join("");
  const providers = (nd?.providers || []).map((p) => `
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
      ${rtRows || `<div class="callout">골프장 자체 클럽 대여 정보가 확인되지 않았습니다.</div>`}
      ${evidenceDetails(rt.evidence, "대여 근거")}
      ${nd ? `<div>
        <h3 class="h3">${esc(nd.region || "")} 권역 렌탈·딜리버리 ${providers ? `(${nd.provider_count || (nd.providers || []).length}곳)` : ""}</h3>
        <div class="providers">${providers || `<p class="section-desc">이 권역에 확인된 배송 업체가 없습니다.</p>`}</div>
        <p class="section-desc">${esc(nd.note_code || "")}${nd.verified_at ? ` · 확인 ${esc(nd.verified_at)}` : ""}</p>
      </div>` : ""}
      <p class="section-desc"><a href="#/rental">전체 렌탈·딜리버리 업체 8곳 보기 →</a></p>
    </div>
  </section>`;

  const covRow = Object.keys(cov).length ? `<div class="stat-grid" style="margin-top:14px">
    ${[["basic", "기본"], ["course", "코스"], ["fee", "요금"], ["ops", "운영"], ["facility", "시설"], ["briefing", "브리핑"], ["rental", "렌탈"]]
      .map(([k, l]) => `<div class="stat"><div class="n">${fmtPct(cov[k])}</div><div class="l">${l} 정보 충실도</div></div>`).join("")}
  </div>` : "";

  return `${s1}${s2}${s3}${s4}${s5}${s6}${s7}
  <section class="section"><h2>데이터 정보</h2>
    <p class="section-desc">7개 영역 채움률. 100%가 아니어도 비어 있는 값은 '미확인'이며 '없음'과 다릅니다.</p>
    ${covRow}
    <p class="section-desc" style="margin-top:14px">수집 ${esc(fmtDate(d.meta?.generated_at || d.meta?.normalized_at))} · 스키마 ${esc(d.meta?.schema || "")} · <a href="${REPO_URL}/blob/main/data/v29/schema.md" target="_blank" rel="noopener noreferrer">스키마 문서</a></p>
  </section>`;
}

/* ---------------- 렌탈 페이지 ---------------- */
function renderRental() {
  const r = state.rental;
  if (!r) {
    $("#view-page").innerHTML = `<div class="page"><h1>클럽 렌탈·딜리버리</h1><p class="page-lead">렌탈 데이터를 불러오지 못했습니다.</p></div>`;
    return;
  }
  const providers = r.providers || [];
  const regions = ["수도권", "강원", "충청", "호남", "영남", "제주"];
  const cards = providers.map((p) => `
    <article class="rental-card">
      <div class="rental-head">
        <span class="rental-name">${esc(p.name)}</span>
        <span class="tags">${(p.regions || []).map((rg) => `<span class="tag">${esc(rg)}</span>`).join("")}</span>
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

  $("#view-page").innerHTML = `<div class="page">
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
function renderAbout() {
  const d = state.index.dataset;
  const c = d.counts;
  $("#view-page").innerHTML = `<div class="page">
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
      <p><code>data/v29/index.json</code> — 목록·검색·필터용 경량 인덱스 ${Math.round(JSON.stringify(state.index).length / 1024)}KB, 전체 ${c.total}곳</p>
      <p><code>data/v29/courses/{id}.json</code> — 구장별 상세 12키 JSON ${c.total}개</p>
      <p><code>data/v29/clusters.json</code> — 같은 부지 복수 코스 시설 클러스터</p>
      <p><code>elasticsearch/</code> — nori 한글 분석기 매핑·bulk 적재·docker-compose·ES 어댑터(선택)</p>
    </div>

    <h2 class="h2">주의</h2>
    <div class="callout warn">
      <strong>참고 데이터입니다</strong>
      요금·운영 정보는 수집 시점의 공개 정보이며, 골프장 정책에 따라 수시로 바뀝니다. 예약·결제 전 반드시 공식 채널에서 최종 확인하세요. 이 사이트는 예약을 대행하지 않습니다.
    </div>
    <p class="section-desc" style="margin-top:16px">${esc(d.version)} · ${esc(d.built_at || "")} · <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">GitHub 저장소</a> · <a href="${REPO_URL}/blob/main/data/v29/schema.md" target="_blank" rel="noopener noreferrer">스키마 문서</a></p>
  </div>`;
  window.scrollTo({ top: 0 });
}

/* ---------------- 라우터 ---------------- */
function showView(name) {
  $("#view-list").hidden = name !== "list";
  $("#view-detail").hidden = name !== "detail";
  $("#view-page").hidden = name !== "page";
  for (const a of document.querySelectorAll("[data-nav]")) a.removeAttribute("aria-current");
}

async function route() {
  const hash = location.hash || "#/";
  const path = hash.replace(/^#/, "").split("?")[0];

  if (path.startsWith("/c/")) {
    showView("detail");
    const id = decodeURIComponent(path.slice(3));
    await renderDetail(id);
    return;
  }
  if (path === "/rental") {
    showView("page");
    document.querySelector('[data-nav="rental"]')?.setAttribute("aria-current", "page");
    renderRental();
    return;
  }
  if (path === "/about") {
    showView("page");
    document.querySelector('[data-nav="about"]')?.setAttribute("aria-current", "page");
    renderAbout();
    return;
  }
  showView("list");
  document.querySelector('[data-nav="list"]')?.setAttribute("aria-current", "page");
  applyHashQuery(readHashQuery());
  await renderList({ reset: true });
}

/* ---------------- 이벤트 ---------------- */
function wire() {
  const q = $("#q");
  const onQuery = debounce(() => {
    state.q = q.value.trim();
    state.shown = CONFIG.pageSize;
    const onList = location.hash.replace(/^#/, "").split("?")[0] === "/";
    if (onList) {
      syncHash();
      renderList({ reset: true });
    } else {
      location.hash = hashQueryFromState(); // 라우터가 목록으로 이동하며 검색어를 적용한다
    }
  }, 140);
  q.addEventListener("input", () => {
    $("#q-clear").hidden = !q.value;
    onQuery();
  });
  $("#q-clear").addEventListener("click", () => {
    q.value = "";
    $("#q-clear").hidden = true;
    state.q = "";
    syncHash();
    renderList({ reset: true });
    q.focus();
  });
  for (const [id, key] of [["#f-sido", "sido"], ["#f-type", "type"], ["#f-holes", "holes"], ["#f-fee", "fee"], ["#f-sort", "sort"]]) {
    document.querySelector(id).addEventListener("change", (e) => {
      state.filters[key] = e.target.value;
      state.shown = CONFIG.pageSize;
      syncHash();
      renderList({ reset: true });
    });
  }
  $("#status-chips").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    const st = btn.dataset.status;
    const on = state.filters.status.has(st);
    if (on) state.filters.status.delete(st);
    else state.filters.status.add(st);
    btn.classList.toggle("is-on", !on);
    btn.setAttribute("aria-pressed", on ? "false" : "true");
    state.shown = CONFIG.pageSize;
    syncHash();
    renderList({ reset: true });
  });
  $("#f-reset").addEventListener("click", resetFilters);
  $("#more").addEventListener("click", () => {
    state.shown += CONFIG.pageSize;
    renderList();
  });
  document.addEventListener("click", (e) => {
    if (e.target.id === "empty-reset") resetFilters();
  });
}

function resetFilters() {
  state.filters = { sido: "", type: "", holes: "", fee: "", sort: "name", status: new Set(["operating"]) };
  state.q = "";
  $("#q").value = "";
  $("#q-clear").hidden = true;
  $("#f-sido").value = "";
  $("#f-type").value = "";
  $("#f-holes").value = "";
  $("#f-fee").value = "";
  $("#f-sort").value = "name";
  for (const btn of $("#status-chips").querySelectorAll(".chip")) {
    const on = btn.dataset.status === "operating";
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  state.shown = CONFIG.pageSize;
  syncHash();
  renderList({ reset: true });
}

wire();
boot();
