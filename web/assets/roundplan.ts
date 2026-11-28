/**
 * H2 · H3 · M1 — 라운드 플래너 (상세 01 요금·예약 안의 계산 카드)
 *
 * 라운드 예정일 하나로 세 가지를 계산한다.
 *  - 취소 마감·위약 단계(H2): 규정에서 읽은 무료 마감일과 % 위약
 *  - 예약 오픈일(H3): N주 전 + 요일 + 시각 → 실제 오픈 일시, .ics 내보내기
 *  - 날씨(M1): Open-Meteo 예보 + 악천후 정산 규정
 *
 * 계산하지 못한 값은 숫자를 만들지 않고 "원문 확인"으로 남긴다.
 */
import type { ParsedCancel, ParsedOpen } from "../../shared/types";
import { esc } from "./util.js";
import { icon } from "./icons.js";
import {
  addDays,
  buildIcs,
  ddayText,
  dayTypeOf,
  daysBetween,
  daysSince,
  downloadIcs,
  fmtDay,
  fmtDayShort,
  freeDeadline,
  isoOf,
  openInfo,
  parseISO,
  penaltyRows,
  penaltySummary,
  today,
  weekdayName,
} from "./rules.js";
import type { DayType } from "./rules.js";
import { loadWeather, suitability, weatherFor } from "./weather.js";
import type { DailyWeather } from "./weather.js";
import { courseUrl } from "./text.js";

export interface RoundPlanModel {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  cancel: ParsedCancel | null;
  open: ParsedOpen | null;
  cancelRaw: string;
  openRaw: string;
  weatherSummary: string[];
  weekdayFee: number | null;
  weekendFee: number | null;
  asOf: string;
}

interface PlanState {
  date: string;
  override: DayType | null;
}

function nextSaturday(): string {
  const base = today();
  const diff = (6 - base.getDay() + 7) % 7;
  return isoOf(addDays(base, diff === 0 ? 7 : diff));
}

function money(n: number | null): string {
  return n == null ? "" : `${Math.round(n).toLocaleString("ko-KR")}원`;
}

const CONFIDENCE: Record<string, { label: string; tone: string }> = {
  high: { label: "규정에서 자동 계산", tone: "ok" },
  medium: { label: "규정에서 자동 계산 · 확인 권장", tone: "warn" },
  low: { label: "원문 확인 필요", tone: "warn" },
};

function confidenceBadge(level: string | undefined): string {
  const meta = CONFIDENCE[level ?? "low"] ?? CONFIDENCE.low;
  return `<span class="plan-conf ${meta.tone}">${esc(meta.label)}</span>`;
}

function cancelCard(model: RoundPlanModel, round: Date, day: DayType): string {
  const pc = model.cancel;
  const dl = freeDeadline(pc, day, round);
  const green = day === "weekend" ? model.weekendFee : model.weekdayFee;
  const tiers = penaltyRows(pc, day, green);
  const dayLabel = day === "weekend" ? "주말" : "주중";
  if (!pc) {
    return `<section class="plan-card" aria-labelledby="plan-cancel-h">
      <h4 class="plan-card-h" id="plan-cancel-h">${icon("clock")}취소 마감</h4>
      <p class="plan-empty">취소 규정을 자동으로 읽지 못했습니다. 아래 원문을 확인하고 골프장에 문의하세요.</p>
      ${model.cancelRaw ? `<details class="plan-raw"><summary>규정 원문</summary><p>${esc(model.cancelRaw.slice(0, 320))}${model.cancelRaw.length > 320 ? "…" : ""}</p></details>` : ""}
    </section>`;
  }
  const scopeNote = pc.scope === "member"
    ? `<p class="plan-warn">${icon("alert")}회원 기준 규정입니다 — 비회원은 다를 수 있습니다.</p>`
    : "";
  const deadlineBlock = dl
    ? `<div class="plan-big">
        <span class="plan-big-label">${esc(dayLabel)} 라운드 기준 무료 취소 마감</span>
        <strong class="plan-big-value">${esc(fmtDayShort(dl.date))}${dl.time ? ` ${esc(dl.time)}` : ` <span class="plan-unknown">시간 미확인</span>`}</strong>
        <span class="plan-dd ${dl.passed ? "is-past" : ""}">${dl.passed ? "마감 지남" : ddayText(dl.date)}</span>
      </div>
      <p class="plan-sub">라운드 ${dl.daysBefore}일 전${dl.time ? ` ${dl.time}` : ""}까지 · 이후 취소하면 아래 위약이 적용됩니다.${
        dl.borrowed ? ` (${dayLabel} 전용 규정이 확인되지 않아 ${day === "weekend" ? "주중" : "주말"} 기준을 썼습니다)` : ""}</p>`
    : `<p class="plan-empty">무료 취소 마감일을 읽지 못했습니다. 위약 단계만 확인되었습니다.</p>`;

  const tierRows = tiers.length
    ? `<ul class="plan-tiers">${tiers.map((t) => {
        const range = t.minDays === t.maxDays ? `D-${t.maxDays}` : `D-${t.maxDays}~D-${t.minDays}`;
        return `<li><span class="plan-tier-range">${esc(range)}</span>
          <span class="plan-tier-value">${esc(penaltySummary(t))}${t.amount != null ? ` <small>약 ${money(t.amount)} · ${esc(t.amountLabel)}</small>` : ""}</span></li>`;
      }).join("")}</ul>`
    : `<p class="plan-sub muted">위약 단계는 원문에서 확인되지 않았습니다. 실제 위약은 골프장에 확인하세요.</p>`;

  return `<section class="plan-card" aria-labelledby="plan-cancel-h">
    <h4 class="plan-card-h" id="plan-cancel-h">${icon("clock")}취소 마감</h4>
    ${deadlineBlock}
    ${scopeNote}
    ${tierRows}
    <div class="plan-actions">
      ${dl ? `<button type="button" class="btn btn-ghost btn-sm" data-plan-ics="cancel">${icon("calendar")}캘린더에 추가</button>` : ""}
      <span class="plan-status" role="status"></span>
    </div>
    <div class="plan-foot">${confidenceBadge(pc.confidence)}<span class="plan-note">골프장 확인 권장</span></div>
    ${model.cancelRaw ? `<details class="plan-raw"><summary>규정 원문 보기</summary><p>${esc(model.cancelRaw)}</p></details>` : ""}
  </section>`;
}

function openCard(model: RoundPlanModel, round: Date, day: DayType): string {
  const po = model.open;
  const info = openInfo(po, round, day);
  const dayLabel = day === "weekend" ? "주말" : "주중";
  if (!info) {
    return `<section class="plan-card" aria-labelledby="plan-open-h">
      <h4 class="plan-card-h" id="plan-open-h">${icon("calendar")}예약 오픈</h4>
      <p class="plan-empty">오픈 규칙을 자동으로 계산하지 못했습니다. 아래 원문을 달력에 직접 표시해 두세요.</p>
      ${model.openRaw ? `<details class="plan-raw"><summary>오픈 규정 원문</summary><p>${esc(model.openRaw.slice(0, 320))}${model.openRaw.length > 320 ? "…" : ""}</p></details>` : ""}
    </section>`;
  }
  const dday = daysBetween(today(), info.date);
  const isToday = dday === 0;
  const opened = dday < 0;
  const method = po?.method ? { lottery: "추첨", fcfs: "선착순", online: "온라인", phone: "전화", onsite: "현장" }[po.method] : "";
  return `<section class="plan-card" aria-labelledby="plan-open-h">
    <h4 class="plan-card-h" id="plan-open-h">${icon("calendar")}예약 오픈</h4>
    <div class="plan-big">
      <span class="plan-big-label">${esc(dayLabel)} 라운드 기준 예약 오픈</span>
      <strong class="plan-big-value">${esc(fmtDayShort(info.date))}${info.time ? ` ${esc(info.time)}` : ` <span class="plan-unknown">시간 미확인</span>`}</strong>
      <span class="plan-dd ${isToday ? "is-today" : opened ? "is-past" : ""}">${isToday ? "오늘 오픈" : opened ? `오픈 ${-dday}일 지남` : ddayText(info.date)}</span>
    </div>
    ${opened ? `<p class="plan-sub muted">이미 오픈된 날짜입니다 — 잔여 티타임은 예약 채널에서 확인하세요.</p>` : ""}
    <p class="plan-sub">${esc(info.basis)}${method ? ` · ${esc(method)}` : ""}${po?.member_only ? " · 회원 기준" : ""}</p>
    ${info.note ? `<p class="plan-warn">${icon("info")}${esc(info.note)}</p>` : ""}
    <div class="plan-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-plan-ics="open">${icon("calendar")}캘린더에 추가</button>
      <span class="plan-status" role="status"></span>
    </div>
    <div class="plan-foot">${confidenceBadge(po?.confidence)}<span class="plan-note">30분 전 알림 포함</span></div>
    ${model.openRaw ? `<details class="plan-raw"><summary>오픈 규정 원문 보기</summary><p>${esc(model.openRaw)}</p></details>` : ""}
  </section>`;
}

function weatherCard(model: RoundPlanModel, round: Date, weather: DailyWeather[] | null, loading: boolean, failed: boolean): string {
  const iso = isoOf(round);
  const w = weatherFor(weather, iso);
  const suit = suitability(w);
  const week = (weather ?? []).slice(0, 7);
  const head = `<h4 class="plan-card-h">${icon("sun")}라운드 날씨</h4>`;
  if (model.lat == null || model.lng == null) {
    return `<section class="plan-card" aria-labelledby="plan-wx-h"><h4 class="plan-card-h" id="plan-wx-h">${icon("sun")}라운드 날씨</h4>
      <p class="plan-empty">좌표가 확인되지 않아 예보를 불러올 수 없습니다.</p></section>`;
  }
  if (loading) {
    return `<section class="plan-card" aria-labelledby="plan-wx-h"><h4 class="plan-card-h" id="plan-wx-h">${icon("sun")}라운드 날씨</h4>
      <p class="plan-empty">예보를 불러오는 중…</p></section>`;
  }
  if (failed || !weather) {
    return `<section class="plan-card" aria-labelledby="plan-wx-h"><h4 class="plan-card-h" id="plan-wx-h">${icon("sun")}라운드 날씨</h4>
      <p class="plan-empty">예보를 불러오지 못했습니다. 네트워크가 되면 다시 확인해 주세요.</p></section>`;
  }
  const strip = week.length
    ? `<div class="wx-strip" role="group" aria-label="7일 예보 — 날짜를 눌러 선택">${week.map((d) => {
        const dt = parseISO(d.date);
        const on = d.date === iso;
        const s = suitability(d);
        return `<button type="button" class="wx-day${on ? " is-on" : ""}" data-plan-wx="${esc(d.date)}" aria-pressed="${on}">
          <span class="wx-dow">${dt ? weekdayName(dt) : ""}</span>
          <span class="wx-date">${dt ? fmtDayShort(dt).slice(0, 5) : ""}</span>
          <span class="wx-pop">${d.pop != null ? `${d.pop}%` : "—"}</span>
          <span class="wx-dot ${s?.level ?? "good"}" aria-hidden="true"></span>
        </button>`;
      }).join("")}</div>`
    : "";
  const detail = w
    ? `<div class="plan-big">
        <span class="plan-big-label">${esc(fmtDay(w ? parseISO(w.date) ?? round : round))} 예보</span>
        <strong class="plan-big-value">${w.tMin != null && w.tMax != null ? `${Math.round(w.tMin)}~${Math.round(w.tMax)}℃` : "기온 미확인"}</strong>
        <span class="plan-dd suit-${suit?.level ?? "good"}">${esc(suit?.label ?? "")}</span>
      </div>
      <dl class="wx-facts">
        <div><dt>강수확률</dt><dd>${w.pop != null ? `${w.pop}%` : "미확인"}</dd></div>
        <div><dt>강수량</dt><dd>${w.precip != null ? `${w.precip}mm` : "미확인"}</dd></div>
        <div><dt>최대 풍속</dt><dd>${w.wind != null ? `${Math.round(w.wind)}km/h` : "미확인"}</dd></div>
        <div><dt>일출·일몰</dt><dd>${w.sunrise ? esc(w.sunrise.slice(11)) : "—"} / ${w.sunset ? esc(w.sunset.slice(11)) : "—"}</dd></div>
      </dl>
      <ul class="wx-reasons">${(suit?.reasons ?? []).map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`
    : `<p class="plan-empty">선택한 날짜는 예보 범위(16일) 밖입니다. 가까워지면 다시 확인하세요.</p>`;
  const storm = model.weatherSummary.length
    ? `<details class="plan-raw"><summary>이 구장 악천후 정산 규정</summary><ul>${model.weatherSummary.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
        <p class="muted">공개 규정 발췌입니다. 실제 정산은 골프장에 확인하세요.</p></details>`
    : "";
  return `<section class="plan-card" aria-labelledby="plan-wx-h">${head}${strip}${detail}${storm}
    <div class="plan-foot"><span class="plan-conf neutral">참고 예보</span><span class="plan-note">Open-Meteo · 실제 날씨와 다를 수 있습니다</span></div>
  </section>`;
}

export function mountRoundPlan(container: HTMLElement, model: RoundPlanModel, initialDate?: string): void {
  const state: PlanState = { date: initialDate && parseISO(initialDate) ? initialDate : nextSaturday(), override: null };
  let weather: DailyWeather[] | null = null;
  let loading = true;
  let failed = false;

  const roundOf = (): Date => parseISO(state.date) ?? today();
  const dayOf = (d: Date): DayType => state.override ?? dayTypeOf(d);

  const announce = (text: string): void => {
    const node = container.querySelector<HTMLElement>(".plan-status");
    if (node) node.textContent = text;
  };

  const draw = (): void => {
    const round = roundOf();
    const day = dayOf(round);
    const dayLabel = day === "weekend" ? "주말" : "주중";
    const auto = state.override == null;
    container.innerHTML = `<div class="plan" aria-labelledby="plan-title">
      <div class="plan-head">
        <div>
          <span class="calc-eyebrow">라운드 플래너</span>
          <h3 class="plan-title" id="plan-title">내 라운드 날짜로 계산</h3>
          <p class="plan-desc">취소 마감·예약 오픈·날씨를 한 번에 확인합니다. 공휴일은 주말 기준으로 직접 바꿔 주세요.</p>
        </div>
        <a class="btn btn-ghost btn-sm" href="#/prep/${esc(model.id)}?d=${esc(state.date)}">${icon("copy")}라운드 준비 카드</a>
      </div>
      <div class="plan-date">
        <label class="field field-inline"><span>라운드 예정일</span>
          <input type="date" id="plan-date" value="${esc(state.date)}" min="${esc(isoOf(today()))}">
        </label>
        <div class="seg seg-2" role="group" aria-label="요일 구분">
          <button type="button" data-plan-day="weekday" aria-pressed="${day === "weekday"}">주중</button>
          <button type="button" data-plan-day="weekend" aria-pressed="${day === "weekend"}">주말</button>
        </div>
        <span class="plan-daytag">${auto ? `${esc(weekdayName(round))}요일 · ${dayLabel} 기준` : `${dayLabel} 기준(직접 선택)`}</span>
        <div class="plan-quick">
          <button type="button" class="chip" data-plan-quick="sat">가까운 토요일</button>
          <button type="button" class="chip" data-plan-quick="next">그다음 토요일</button>
        </div>
      </div>
      <div class="plan-grid">
        ${cancelCard(model, round, day)}
        ${openCard(model, round, day)}
        ${weatherCard(model, round, weather, loading, failed)}
      </div>
      <p class="plan-disclaimer">계산값은 규정 문구를 기계적으로 읽어 만든 참고값입니다. 예약·취소 전 골프장 공식 채널에서 최종 확인하세요.${
        model.asOf ? ` 요금 확인 ${esc(model.asOf)}.` : ""}</p>
    </div>`;

    const input = container.querySelector<HTMLInputElement>("#plan-date");
    input?.addEventListener("change", () => {
      if (!input.value) return;
      state.date = input.value;
      state.override = null;
      draw();
    });
  };

  container.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const dayBtn = target.closest<HTMLElement>("[data-plan-day]");
    if (dayBtn) {
      const v = dayBtn.dataset.planDay;
      if (v === "weekday" || v === "weekend") {
        state.override = state.override === v ? null : v;
        draw();
      }
      return;
    }
    const quick = target.closest<HTMLElement>("[data-plan-quick]");
    if (quick) {
      const base = today();
      let d: Date;
      if (quick.dataset.planQuick === "sat") {
        const diff = (6 - base.getDay() + 7) % 7;
        d = addDays(base, diff === 0 ? 7 : diff);
      } else {
        const diff = (6 - base.getDay() + 7) % 7;
        d = addDays(base, diff === 0 ? 7 : diff) as Date;
        d = addDays(d, 7);
      }
      state.date = isoOf(d);
      state.override = d.getDay() === 0 || d.getDay() === 6 ? "weekend" : null;
      draw();
      return;
    }
    const wx = target.closest<HTMLElement>("[data-plan-wx]");
    if (wx) {
      const d = wx.dataset.planWx;
      if (d) {
        state.date = d;
        state.override = null;
        draw();
      }
      return;
    }
    const ics = target.closest<HTMLElement>("[data-plan-ics]");
    if (ics) {
      const round = roundOf();
      const iso = isoOf(round);
      const base = `${location.origin}${location.pathname}`;
      if (ics.dataset.planIcs === "cancel" && model.cancel) {
        const dl = freeDeadline(model.cancel, dayOf(round), round);
        if (!dl) return;
        const title = `[코스브리프] ${model.name} 취소 마감`;
        const desc = `무료 취소 마감: ${fmtDay(dl.date)} ${dl.time ?? "시간 미확인"}\n라운드: ${fmtDay(round)}\n규정 원문: ${model.cancelRaw}\n${courseUrl(model.id)}`;
        downloadIcs(
          `코스브리프-취소마감-${model.name}.ics`,
          buildIcs({
            uid: `cancel-${model.id}-${iso}`,
            title,
            date: dl.date,
            time: dl.time ?? "09:00",
            description: desc,
            url: courseUrl(model.id),
            alarmMinutes: 120,
          }),
        );
        announce("캘린더 파일을 내려받았습니다.");
        return;
      }
      if (ics.dataset.planIcs === "open" && model.open) {
        const info = openInfo(model.open, round, dayOf(round));
        if (!info) return;
        const title = `[코스브리프] ${model.name} 예약 오픈`;
        const desc = `예약 오픈: ${fmtDay(info.date)} ${info.time ?? "시간 미확인"}\n라운드: ${fmtDay(round)}\n기준: ${info.basis}\n오픈 규정: ${model.openRaw}\n${courseUrl(model.id)}`;
        downloadIcs(
          `코스브리프-예약오픈-${model.name}.ics`,
          buildIcs({
            uid: `open-${model.id}-${iso}`,
            title,
            date: info.date,
            time: info.time ?? "09:00",
            description: desc,
            url: courseUrl(model.id),
            alarmMinutes: 30,
          }),
        );
        announce("캘린더 파일을 내려받았습니다.");
      }
    }
  });

  draw();
  void loadWeather(model.lat, model.lng).then((days) => {
    weather = days;
    loading = false;
    failed = !days;
    draw();
  });
}
