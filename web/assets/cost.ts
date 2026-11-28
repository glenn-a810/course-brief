/**
 * H1. 라운드 총비용 계산기
 *
 * 상세 페이지 `01 요금 · 예약` 의 요금 카드 바로 아래에 붙는다.
 * 데이터 규칙을 그대로 상속한다:
 *  - 없는 값은 '미확인'이며 0원이 아니다. 계산에서 빼고, 뺐다는 사실을 화면에 적는다.
 *  - 카트·캐디는 팀(4인 1팀) 기준 1회 청구로 계산하고, 그 가정을 카드에 밝힌다.
 *  - 2·3·5인은 '4인 요금이 적용되는 곳'이 많아 계산값과 함께 원문을 병기한다.
 */
import { cleanNote, shareOrCopy, won } from "./text.js";
import { esc } from "./util.js";
import { icon } from "./icons.js";

export type PlayerCount = 2 | 3 | 4 | 5;
export type PlayerState = "yes" | "conditional" | "no" | "unknown";
export type CostDay = "weekday" | "weekend";

export interface PlayerInfo {
  state: PlayerState;
  /** 데이터 원문(확인된 경우에만). 카드에 그대로 병기한다 */
  text: string;
}

export interface NineHoleFees {
  weekday: number | null;
  weekend: number | null;
  cart: number | null;
}

export interface CostModel {
  id: string;
  name: string;
  weekday: number | null;
  weekend: number | null;
  greenSource: "official" | "market" | null;
  cart: number | null;
  cartNote: string;
  caddie: number | null;
  caddieNote: string;
  caddieNone: boolean;
  asOf: string;
  players: Record<PlayerCount, PlayerInfo>;
  nine: NineHoleFees;
  note: string;
}

interface CostState {
  players: PlayerCount;
  day: CostDay;
  holes: 18 | 9;
  cart: boolean;
  caddie: boolean;
}

const PLAYER_ORDER: PlayerCount[] = [2, 3, 4, 5];
const PLAYER_STATE_LABEL: Record<PlayerState, string> = {
  yes: "가능",
  conditional: "조건부",
  no: "불가",
  unknown: "미확인",
};

/* ---------------- 9홀 요금 읽기 ---------------- */

function firstAmount(text: string): number | null {
  const m = /([0-9][0-9,]{2,})/.exec(text);
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
}

function labelled(text: string, labels: string, gap = 10): number | null {
  const re = new RegExp(`(?:${labels})[^0-9]{0,${gap}}([0-9][0-9,]{2,})`);
  const m = re.exec(text);
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * 공식 요금 문장에서 9홀 요금만 읽는다.
 * 18홀 요금을 9홀로 나누는 추정은 하지 않는다(그런 값은 데이터가 아니다).
 * 인식하지 못하면 null 로 두고 화면에서 9홀 토글을 잠근다.
 */
export function parseNineHole(
  greenDetail: string | null | undefined,
  cartDetail: string | null | undefined,
): NineHoleFees {
  const none: NineHoleFees = { weekday: null, weekend: null, cart: null };
  let weekday: number | null = null;
  let weekend: number | null = null;
  if (greenDetail) {
    const at = greenDetail.indexOf("9홀");
    if (at >= 0) {
      const tail = greenDetail.slice(at, at + 160);
      const seg = tail.split(/[.。\n]/)[0] ?? tail;
      weekday = labelled(seg, "주중|평일");
      weekend = labelled(seg, "주말|공휴일");
    }
  }
  let cart: number | null = null;
  if (cartDetail) {
    const at = cartDetail.indexOf("9홀");
    if (at >= 0) cart = firstAmount(cartDetail.slice(at, at + 40));
  }
  return {
    weekday: weekday ?? null,
    weekend: weekend ?? null,
    cart: cart ?? null,
  };
}

/* ---------------- 계산 ---------------- */

interface CostLine {
  label: string;
  detail: string;
  amount: number | null;
  excluded: boolean;
}

interface CostResult {
  lines: CostLine[];
  total: number | null;
  perPerson: number | null;
  excludedLabels: string[];
  unitGreen: number | null;
  cartPrice: number | null;
}

function greenUnit(model: CostModel, st: CostState): number | null {
  if (st.holes === 9) return model.nine[st.day];
  return st.day === "weekday" ? model.weekday : model.weekend;
}

function compute(model: CostModel, st: CostState): CostResult {
  const unitGreen = greenUnit(model, st);
  const green = unitGreen != null ? unitGreen * st.players : null;
  // 9홀 카트는 18홀 카트와 다른 요금이라, 따로 확인된 값이 없으면 미확인으로 둔다
  const cartPrice = st.holes === 9 ? model.nine.cart : model.cart;
  const caddiePrice = model.caddieNone ? 0 : model.caddie;

  const excludedLabels: string[] = [];
  const lines: CostLine[] = [
    {
      label: "그린피",
      detail: unitGreen != null ? `${st.players}인 × ${won(unitGreen)}` : `${st.players}인 · 1인 요금 미확인`,
      amount: green,
      excluded: false,
    },
  ];

  if (!st.cart) {
    lines.push({ label: "카트", detail: "미포함", amount: 0, excluded: false });
  } else if (cartPrice == null) {
    excludedLabels.push(st.holes === 9 ? "9홀 카트" : "카트");
    lines.push({ label: "카트", detail: "미확인", amount: null, excluded: true });
  } else {
    lines.push({ label: "카트", detail: "팀 기준 1회", amount: cartPrice, excluded: false });
  }

  if (model.caddieNone) {
    lines.push({ label: "캐디피", detail: "노캐디", amount: 0, excluded: false });
  } else if (!st.caddie) {
    lines.push({ label: "캐디피", detail: "미포함", amount: 0, excluded: false });
  } else if (caddiePrice == null) {
    excludedLabels.push("캐디피");
    lines.push({ label: "캐디피", detail: "미확인", amount: null, excluded: true });
  } else {
    lines.push({ label: "캐디피", detail: "팀 기준 1회", amount: caddiePrice, excluded: false });
  }

  const total = green == null ? null : lines.reduce((a, l) => a + (l.amount ?? 0), 0);
  return {
    lines,
    total,
    perPerson: total == null ? null : Math.round(total / st.players),
    excludedLabels,
    unitGreen,
    cartPrice,
  };
}

function initialState(model: CostModel): CostState {
  const day: CostDay = model.weekday != null ? "weekday" : "weekend";
  return {
    players: 4,
    day,
    holes: 18,
    cart: model.cart != null,
    caddie: model.caddie != null && !model.caddieNone,
  };
}

function dayLabel(day: CostDay): string {
  return day === "weekday" ? "주중" : "주말";
}

function sourceLabel(source: CostModel["greenSource"]): string {
  if (source === "official") return "공식 요금표";
  if (source === "market") return "관측 최저가";
  return "";
}

/** 정산·공유에 쓰는 한 줄 요약 */
export function settlementText(model: CostModel, st: CostState): string {
  const r = compute(model, st);
  const opts: string[] = [];
  if (st.cart && r.cartPrice != null) opts.push("카트 포함");
  if (model.caddieNone) opts.push("노캐디");
  else if (st.caddie && model.caddie != null) opts.push("캐디 포함");
  const head = `${model.name} · ${st.players}인 ${dayLabel(st.day)} ${st.holes}홀`;
  if (r.total == null || r.perPerson == null) {
    return `${head} · 팀 비용은 그린피 확인 후 계산됩니다`;
  }
  const total = st.holes === 9 && model.nine.cart == null ? `${won(r.total)} (카트 미확인 제외)` : `${won(r.total)}`;
  return `${head} · 팀 ${total} · 1인 ${won(r.perPerson)}${opts.length ? `, ${opts.join("·")}` : ""}`;
}

/* ---------------- 화면 ---------------- */

function segButton(
  label: string,
  sub: string,
  pressed: boolean,
  attrs: string,
  disabled = false,
): string {
  return `<button type="button" class="seg-btn${pressed ? " is-on" : ""}"${attrs} aria-pressed="${pressed}"
    ${disabled ? "disabled" : ""}><span class="seg-main">${esc(label)}</span>${
    sub ? `<span class="seg-sub">${esc(sub)}</span>` : ""
  }</button>`;
}

function playersHTML(model: CostModel, st: CostState): string {
  const buttons = PLAYER_ORDER.map((n) => {
    const info = model.players[n];
    const pressed = st.players === n;
    const disabled = info.state === "no";
    const sub = n === 4 ? "기본" : PLAYER_STATE_LABEL[info.state];
    const cls = info.state === "no" ? " is-blocked" : info.state === "unknown" ? " is-unknown" : "";
    return `<button type="button" class="seg-btn${pressed ? " is-on" : ""}${cls}" data-cost-players="${n}"
      aria-pressed="${pressed}"${disabled ? " disabled" : ""}><span class="seg-main">${n}인</span>${
      sub ? `<span class="seg-sub">${esc(sub)}</span>` : ""
    }</button>`;
  }).join("");
  return `<div class="calc-row">
    <span class="calc-label">인원</span>
    <div class="seg seg-4" role="group" aria-label="라운드 인원">${buttons}</div>
  </div>`;
}

function playerNoteHTML(model: CostModel, st: CostState): string {
  const info = model.players[st.players];
  if (st.players === 4 && info.state !== "no") {
    return info.text ? `<p class="calc-hint">4인 · ${esc(info.text)}</p>` : "";
  }
  const parts: string[] = [];
  if (info.state === "unknown") parts.push(`${st.players}인 플레이 여부가 확인되지 않았습니다. 전화로 확인하세요.`);
  if (info.state === "no") parts.push(`${st.players}인 플레이는 불가로 확인된 구장입니다.`);
  if (info.state === "conditional") parts.push(`${st.players}인은 조건·추가요금이 붙을 수 있습니다.`);
  if (st.players !== 4) parts.push("2·3·5인은 4인 요금(또는 조인)이 적용되는 구장이 많습니다 — 계산값은 아래 원문과 함께 확인하세요.");
  if (info.text) parts.push(`원문: ${info.text}`);
  return parts.length ? `<p class="calc-hint">${esc(parts.join(" "))}</p>` : "";
}

function dayHTML(model: CostModel, st: CostState): string {
  const pair: Array<[CostDay, number | null]> = [
    ["weekday", st.holes === 9 ? model.nine.weekday : model.weekday],
    ["weekend", st.holes === 9 ? model.nine.weekend : model.weekend],
  ];
  const buttons = pair.map(([day, value]) =>
    segButton(dayLabel(day), value != null ? won(value) : "미확인", st.day === day,
      ` data-cost-day="${day}"`, value == null),
  ).join("");
  const holes = [18, 9].map((h) => {
    const enabled = h === 18 || model.nine[st.day] != null;
    return segButton(`${h}홀`, h === 9 && !enabled ? "미확인" : "", st.holes === h,
      ` data-cost-holes="${h}"`, !enabled);
  }).join("");
  return `<div class="calc-row">
      <span class="calc-label">요일</span>
      <div class="seg" role="group" aria-label="요일">${buttons}</div>
    </div>
    <div class="calc-row">
      <span class="calc-label">홀수</span>
      <div class="seg" role="group" aria-label="홀수">${holes}</div>
    </div>`;
}

function optionsHTML(model: CostModel, st: CostState): string {
  const cartValue = model.cart == null ? "미확인" : `${won(model.cart)}/팀`;
  const caddieValue = model.caddieNone ? "노캐디" : model.caddie == null ? "미확인" : `${won(model.caddie)}/팀`;
  const opt = (key: "cart" | "caddie", label: string, value: string, on: boolean, disabled: boolean): string =>
    `<button type="button" class="opt${on ? " is-on" : ""}" data-cost-opt="${key}" aria-pressed="${on}"${
      disabled ? " disabled" : ""
    }>
      <span class="opt-check" aria-hidden="true">${icon("check")}</span>
      <span class="opt-label">${esc(label)}</span>
      <span class="opt-value">${esc(value)}</span>
    </button>`;
  return `<div class="calc-opts">
    ${opt("cart", "카트", cartValue, st.cart, model.cart == null && st.holes === 9)}
    ${opt("caddie", "캐디피", caddieValue, st.caddie, model.caddieNone || model.caddie == null)}
  </div>`;
}

function totalHTML(model: CostModel, st: CostState, r: CostResult): string {
  if (r.total == null || r.perPerson == null) {
    return `<div class="calc-total">
      <p class="calc-total-empty">${esc(dayLabel(st.day))} ${st.holes}홀 1인 그린피가 확인되지 않아 합계를 계산할 수 없습니다.</p>
    </div>`;
  }
  const caption = r.excludedLabels.length
    ? `<p class="calc-total-caption">${esc(r.excludedLabels.join("·"))} 미확인 — 미확인 항목 제외 합계</p>`
    : `<p class="calc-total-caption">카트·캐디는 팀 기준 1회 청구로 계산했습니다</p>`;
  return `<div class="calc-total">
    ${caption}
    <div class="calc-total-row">
      <span class="calc-total-label">팀 합계</span>
      <strong class="calc-total-value">${won(r.total)}</strong>
    </div>
    <div class="calc-total-row is-sub">
      <span class="calc-total-label">1인당</span>
      <span class="calc-total-per">${won(r.perPerson)}</span>
    </div>
  </div>`;
}

function notesHTML(model: CostModel, st: CostState, r: CostResult): string {
  const notes: string[] = [];
  if (st.players === 5 && model.cart != null) {
    notes.push("5인 카트는 팀 구성·요금이 다른 구장이 있습니다 — 카트 요금은 별도 확인이 필요합니다.");
  }
  if (st.holes === 9 && model.nine.cart == null && st.cart) {
    notes.push("9홀 카트 요금은 확인되지 않았습니다 — 합계에서 빠져 있습니다.");
  }
  if (model.cart == null && st.holes === 18) {
    notes.push("카트 요금이 확인되지 않아 합계에서 빠졌습니다.");
  }
  if (model.caddie == null && !model.caddieNone) {
    notes.push("캐디피가 확인되지 않아 합계에서 빠졌습니다.");
  }
  if (model.note) notes.push(model.note);
  notes.push("시설이용료·세금·봉사료는 포함되지 않았을 수 있습니다. 예약 화면의 최종 금액과 다를 수 있습니다.");
  const srcLabel = sourceLabel(model.greenSource);
  const src = srcLabel ? `<p class="calc-src">${esc(srcLabel)} 기준 1인 18홀 비회원 요금${model.asOf ? ` · 확인 ${esc(model.asOf)}` : ""}</p>` : "";
  return `${src}<ul class="calc-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
}

function cardHTML(model: CostModel, st: CostState, status: string): string {
  const r = compute(model, st);
  return `<div class="calc" aria-labelledby="calc-title-${esc(model.id)}">
    <div class="calc-head">
      <div>
        <span class="calc-eyebrow">라운드 총비용</span>
        <h3 class="calc-title" id="calc-title-${esc(model.id)}">그래서 총 얼마?</h3>
        <p class="calc-desc">인원·요일을 고르면 그린피에 카트·캐디를 더해 팀 합계와 1인당 금액을 계산합니다.</p>
      </div>
      <span class="calc-badge">${icon("card")}계산기</span>
    </div>
    <div class="calc-controls">
      ${playersHTML(model, st)}
      ${playerNoteHTML(model, st)}
      ${dayHTML(model, st)}
      ${optionsHTML(model, st)}
    </div>
    <dl class="calc-lines">
      ${r.lines.map((l) => `<div class="calc-line${l.excluded ? " is-excluded" : ""}">
        <dt>${esc(l.label)}<span class="calc-line-detail">${esc(l.detail)}</span></dt>
        <dd>${l.amount == null ? `<span class="calc-unknown">미확인</span>` : won(l.amount)}</dd>
      </div>`).join("")}
    </dl>
    ${totalHTML(model, st, r)}
    ${notesHTML(model, st, r)}
    <div class="calc-actions">
      <button type="button" class="btn btn-sm" data-cost-act="copy">${icon("copy")}정산 문구 복사</button>
      <button type="button" class="btn btn-ghost btn-sm" data-cost-act="share">${icon("external")}공유하기</button>
      <span class="calc-status" role="status">${esc(status)}</span>
    </div>
  </div>`;
}

/** 계산기 카드를 붙이고 조작을 연결한다. 상태는 이 카드 안에서만 산다(URL 에 넣지 않는다). */
export function mountCostCard(container: HTMLElement, model: CostModel): void {
  const st = initialState(model);
  let status = "";
  let statusTimer: ReturnType<typeof setTimeout> | undefined;

  const draw = (): void => {
    container.innerHTML = cardHTML(model, st, status);
  };

  const announce = (text: string): void => {
    status = text;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      status = "";
      const node = container.querySelector<HTMLElement>(".calc-status");
      if (node) node.textContent = "";
    }, 3200);
  };

  container.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest<HTMLElement>("button");
    if (!btn || btn.hasAttribute("disabled")) return;

    const players = btn.dataset.costPlayers;
    if (players) {
      const n = Number(players);
      if (n === 2 || n === 3 || n === 4 || n === 5) {
        st.players = n;
        // 선택한 인원에 9홀 요금이 없으면 18홀로 돌린다
        if (st.holes === 9 && model.nine[st.day] == null) st.holes = 18;
        draw();
      }
      return;
    }
    const day = btn.dataset.costDay;
    if (day === "weekday" || day === "weekend") {
      st.day = day;
      if (st.holes === 9 && model.nine[day] == null) st.holes = 18;
      draw();
      return;
    }
    const holes = btn.dataset.costHoles;
    if (holes === "18" || holes === "9") {
      st.holes = Number(holes) === 9 ? 9 : 18;
      draw();
      return;
    }
    const opt = btn.dataset.costOpt;
    if (opt === "cart") {
      st.cart = !st.cart;
      draw();
      return;
    }
    if (opt === "caddie") {
      st.caddie = !st.caddie;
      draw();
      return;
    }

    const act = btn.dataset.costAct;
    if (act === "copy") {
      void shareOrCopy(settlementText(model, st)).then((how) => {
        announce(how === "failed" ? "복사하지 못했습니다 — 브라우저 권한을 확인해 주세요." : "정산 문구를 복사했습니다.");
      });
      return;
    }
    if (act === "share") {
      void shareOrCopy(settlementText(model, st)).then((how) => {
        announce(
          how === "shared" ? "공유했습니다."
            : how === "copied" ? "공유 시트가 없어 정산 문구를 복사했습니다."
              : "공유하지 못했습니다 — 브라우저 권한을 확인해 주세요.",
        );
      });
    }
  });

  draw();
}

/** 데이터에서 계산기 모델을 만든다 — app.ts 가 요금·운영 규칙을 적용해 넘긴다 */
export function costModelFrom(parts: {
  id: string;
  name: string;
  weekday: number | null;
  weekend: number | null;
  greenSource: "official" | "market" | null;
  cart: number | null;
  cartNote: string;
  caddie: number | null;
  caddieNote: string;
  caddieNone: boolean;
  asOf: string;
  players: Record<PlayerCount, PlayerInfo>;
  greenDetail: string | null;
  cartDetail: string | null;
  note: string;
}): CostModel {
  return {
    id: parts.id,
    name: parts.name,
    weekday: parts.weekday,
    weekend: parts.weekend,
    greenSource: parts.greenSource,
    cart: parts.cart,
    cartNote: cleanNote(parts.cartNote),
    caddie: parts.caddie,
    caddieNote: cleanNote(parts.caddieNote),
    caddieNone: parts.caddieNone,
    asOf: parts.asOf,
    players: parts.players,
    nine: parseNineHole(parts.greenDetail, parts.cartDetail),
    note: cleanNote(parts.note),
  };
}
