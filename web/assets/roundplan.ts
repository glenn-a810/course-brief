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
import { t } from "./i18n.js";

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
  get high() { return { label: t("plan.conf.high"), tone: "ok" }; },
  get medium() { return { label: t("plan.conf.medium"), tone: "warn" }; },
  get low() { return { label: t("plan.conf.low"), tone: "warn" }; },
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
  const dayLabel = day === "weekend" ? t("common.weekend") : t("common.weekday");
  if (!pc) {
    return `<section class="plan-card" aria-labelledby="plan-cancel-h">
      <h4 class="plan-card-h" id="plan-cancel-h">${icon("clock")}${esc(t("plan.cancelTitle"))}</h4>
      <p class="plan-empty">${esc(t("plan.cancelFail"))}</p>
      ${model.cancelRaw ? `<details class="plan-raw"><summary>${esc(t("plan.rawCancel"))}</summary><p>${esc(model.cancelRaw.slice(0, 320))}${model.cancelRaw.length > 320 ? "…" : ""}</p></details>` : ""}
    </section>`;
  }
  const scopeNote = pc.scope === "member"
    ? `<p class="plan-warn">${icon("alert")}${esc(t("plan.memberWarn"))}</p>`
    : "";
  const deadlineBlock = dl
    ? `<div class="plan-big">
        <span class="plan-big-label">${esc(t("plan.deadlineLabel", { d: dayLabel }))}</span>
        <strong class="plan-big-value">${esc(fmtDayShort(dl.date))}${dl.time ? ` ${esc(dl.time)}` : ` <span class="plan-unknown">${esc(t("plan.timeUnknown"))}</span>`}</strong>
        <span class="plan-dd ${dl.passed ? "is-past" : ""}">${dl.passed ? esc(t("plan.passed")) : ddayText(dl.date)}</span>
      </div>
      <p class="plan-sub">${esc(t("plan.deadlineSub", { days: `${dl.daysBefore}${dl.time ? ` ${dl.time}` : ""}` }))}${
        dl.borrowed ? esc(t("plan.borrowed", { d: dayLabel, other: day === "weekend" ? t("common.weekday") : t("common.weekend") })) : ""}</p>`
    : `<p class="plan-empty">${esc(t("plan.cancelEmpty"))}</p>`;

  const tierRows = tiers.length
    ? `<ul class="plan-tiers">${tiers.map((t) => {
        const range = t.minDays === t.maxDays ? `D-${t.maxDays}` : `D-${t.maxDays}~D-${t.minDays}`;
        return `<li><span class="plan-tier-range">${esc(range)}</span>
          <span class="plan-tier-value">${esc(penaltySummary(t))}${t.amount != null ? ` <small>약 ${money(t.amount)} · ${esc(t.amountLabel)}</small>` : ""}</span></li>`;
      }).join("")}</ul>`
    : `<p class="plan-sub muted">${esc(t("plan.tierUnknown"))}</p>`;

  return `<section class="plan-card" aria-labelledby="plan-cancel-h">
    <h4 class="plan-card-h" id="plan-cancel-h">${icon("clock")}${esc(t("plan.cancelTitle"))}</h4>
    ${deadlineBlock}
    ${scopeNote}
    ${tierRows}
    <div class="plan-actions">
      ${dl ? `<button type="button" class="btn btn-ghost btn-sm" data-plan-ics="cancel">${icon("calendar")}${esc(t("plan.addIcs"))}</button>` : ""}
      <span class="plan-status" role="status"></span>
    </div>
    <div class="plan-foot">${confidenceBadge(pc.confidence)}<span class="plan-note">${esc(t("plan.confirmRecommended"))}</span></div>
    ${model.cancelRaw ? `<details class="plan-raw"><summary>${esc(t("plan.rawCancelOpen"))}</summary><p>${esc(model.cancelRaw)}</p></details>` : ""}
  </section>`;
}

function openCard(model: RoundPlanModel, round: Date, day: DayType): string {
  const po = model.open;
  const info = openInfo(po, round, day);
  const dayLabel = day === "weekend" ? t("common.weekend") : t("common.weekday");
  if (!info) {
    return `<section class="plan-card" aria-labelledby="plan-open-h">
      <h4 class="plan-card-h" id="plan-open-h">${icon("calendar")}${esc(t("plan.openTitle"))}</h4>
      <p class="plan-empty">${esc(t("plan.openFail"))}</p>
      ${model.openRaw ? `<details class="plan-raw"><summary>${esc(t("plan.rawOpen"))}</summary><p>${esc(model.openRaw.slice(0, 320))}${model.openRaw.length > 320 ? "…" : ""}</p></details>` : ""}
    </section>`;
  }
  const dday = daysBetween(today(), info.date);
  const isToday = dday === 0;
  const opened = dday < 0;
  const method = po?.method
    ? { lottery: t("plan.m.lottery"), fcfs: t("plan.m.fcfs"), online: t("plan.m.online"), phone: t("plan.m.phone"), onsite: t("plan.m.onsite") }[po.method]
    : "";
  return `<section class="plan-card" aria-labelledby="plan-open-h">
    <h4 class="plan-card-h" id="plan-open-h">${icon("calendar")}${esc(t("plan.openTitle"))}</h4>
    <div class="plan-big">
      <span class="plan-big-label">${esc(t("plan.openLabel", { d: dayLabel }))}</span>
      <strong class="plan-big-value">${esc(fmtDayShort(info.date))}${info.time ? ` ${esc(info.time)}` : ` <span class="plan-unknown">${esc(t("plan.timeUnknown"))}</span>`}</strong>
      <span class="plan-dd ${isToday ? "is-today" : opened ? "is-past" : ""}">${isToday ? esc(t("plan.todayOpen")) : opened ? esc(t("plan.opened", { n: -dday })) : ddayText(info.date)}</span>
    </div>
    ${opened ? `<p class="plan-sub muted">${esc(t("plan.openedNote"))}</p>` : ""}
    <p class="plan-sub">${esc(info.basis)}${method ? ` · ${esc(method)}` : ""}${po?.member_only ? ` · ${esc(t("plan.memberBasis"))}` : ""}</p>
    ${info.note ? `<p class="plan-warn">${icon("info")}${esc(info.note)}</p>` : ""}
    <div class="plan-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-plan-ics="open">${icon("calendar")}${esc(t("plan.addIcs"))}</button>
      <span class="plan-status" role="status"></span>
    </div>
    <div class="plan-foot">${confidenceBadge(po?.confidence)}<span class="plan-note">${esc(t("plan.notify30"))}</span></div>
    ${model.openRaw ? `<details class="plan-raw"><summary>${esc(t("plan.rawOpenOpen"))}</summary><p>${esc(model.openRaw)}</p></details>` : ""}
  </section>`;
}

function weatherCard(model: RoundPlanModel, round: Date, weather: DailyWeather[] | null, loading: boolean, failed: boolean): string {
  const iso = isoOf(round);
  const w = weatherFor(weather, iso);
  const suit = suitability(w);
  const week = (weather ?? []).slice(0, 7);
  const head = `<h4 class="plan-card-h">${icon("sun")}${esc(t("plan.weatherTitle"))}</h4>`;
  if (model.lat == null || model.lng == null) {
    return `<section class="plan-card" aria-labelledby="plan-wx-h"><h4 class="plan-card-h" id="plan-wx-h">${icon("sun")}${esc(t("plan.weatherTitle"))}</h4>
      <p class="plan-empty">${esc(t("plan.wxNoCoord"))}</p></section>`;
  }
  if (loading) {
    return `<section class="plan-card" aria-labelledby="plan-wx-h"><h4 class="plan-card-h" id="plan-wx-h">${icon("sun")}${esc(t("plan.weatherTitle"))}</h4>
      <p class="plan-empty">${esc(t("plan.wxLoading"))}</p></section>`;
  }
  if (failed || !weather) {
    return `<section class="plan-card" aria-labelledby="plan-wx-h"><h4 class="plan-card-h" id="plan-wx-h">${icon("sun")}${esc(t("plan.weatherTitle"))}</h4>
      <p class="plan-empty">${esc(t("plan.wxFail"))}</p></section>`;
  }
  const strip = week.length
    ? `<div class="wx-strip" role="group" aria-label="${esc(t("plan.wxStripAria"))}">${week.map((d) => {
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
        <span class="plan-big-label">${esc(t("plan.wxForecast", { date: fmtDay(w ? parseISO(w.date) ?? round : round) }))}</span>
        <strong class="plan-big-value">${w.tMin != null && w.tMax != null ? `${Math.round(w.tMin)}~${Math.round(w.tMax)}℃` : esc(t("plan.tempUnknown"))}</strong>
        <span class="plan-dd suit-${suit?.level ?? "good"}">${esc(suit?.label ?? "")}</span>
      </div>
      <dl class="wx-facts">
        <div><dt>${esc(t("plan.pop"))}</dt><dd>${w.pop != null ? `${w.pop}%` : esc(t("common.unknown"))}</dd></div>
        <div><dt>${esc(t("plan.precip"))}</dt><dd>${w.precip != null ? `${w.precip}mm` : esc(t("common.unknown"))}</dd></div>
        <div><dt>${esc(t("plan.wind"))}</dt><dd>${w.wind != null ? `${Math.round(w.wind)}km/h` : esc(t("common.unknown"))}</dd></div>
        <div><dt>${esc(t("plan.sun"))}</dt><dd>${w.sunrise ? esc(w.sunrise.slice(11)) : "—"} / ${w.sunset ? esc(w.sunset.slice(11)) : "—"}</dd></div>
      </dl>
      <ul class="wx-reasons">${(suit?.reasons ?? []).map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`
    : `<p class="plan-empty">${esc(t("plan.wxOut"))}</p>`;
  const storm = model.weatherSummary.length
    ? `<details class="plan-raw"><summary>${esc(t("plan.storm"))}</summary><ul>${model.weatherSummary.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
        <p class="muted">${esc(t("plan.stormNote"))}</p></details>`
    : "";
  return `<section class="plan-card" aria-labelledby="plan-wx-h">${head}${strip}${detail}${storm}
    <div class="plan-foot"><span class="plan-conf neutral">${esc(t("plan.forecastRef"))}</span><span class="plan-note">${esc(t("plan.forecastSrc"))}</span></div>
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
    const dayLabel = day === "weekend" ? t("common.weekend") : t("common.weekday");
    const auto = state.override == null;
    container.innerHTML = `<div class="plan" aria-labelledby="plan-title">
      <div class="plan-head">
        <div>
          <span class="calc-eyebrow">${esc(t("plan.eyebrow"))}</span>
          <h3 class="plan-title" id="plan-title">${esc(t("plan.title"))}</h3>
          <p class="plan-desc">${esc(t("plan.desc"))}</p>
        </div>
        <a class="btn btn-ghost btn-sm" href="#/prep/${esc(model.id)}?d=${esc(state.date)}">${icon("copy")}${esc(t("plan.prep"))}</a>
      </div>
      <div class="plan-date">
        <label class="field field-inline"><span>${esc(t("plan.date"))}</span>
          <input type="date" id="plan-date" value="${esc(state.date)}" min="${esc(isoOf(today()))}">
        </label>
        <div class="seg seg-2" role="group" aria-label="${esc(t("plan.dayAria"))}">
          <button type="button" data-plan-day="weekday" aria-pressed="${day === "weekday"}">${esc(t("common.weekday"))}</button>
          <button type="button" data-plan-day="weekend" aria-pressed="${day === "weekend"}">${esc(t("common.weekend"))}</button>
        </div>
        <span class="plan-daytag">${auto ? esc(t("plan.dayTagAuto", { w: weekdayName(round), d: dayLabel })) : esc(t("plan.dayOverride", { d: dayLabel }))}</span>
        <div class="plan-quick">
          <button type="button" class="chip" data-plan-quick="sat">${esc(t("plan.quickSat"))}</button>
          <button type="button" class="chip" data-plan-quick="next">${esc(t("plan.quickNext"))}</button>
        </div>
      </div>
      <div class="plan-grid">
        ${cancelCard(model, round, day)}
        ${openCard(model, round, day)}
        ${weatherCard(model, round, weather, loading, failed)}
      </div>
      <p class="plan-disclaimer">${esc(t("plan.disclaimer", { fee: model.asOf ? t("plan.feeChecked", { date: model.asOf }) : "" }))}</p>
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
        const title = t("plan.icsCancelTitle", { name: model.name });
        const desc = `${t("plan.cancelTitle")}: ${fmtDay(dl.date)} ${dl.time ?? t("plan.timeUnknown")}\n${t("plan.icsRound", { date: fmtDay(round) })}\n${t("plan.icsRule", { text: model.cancelRaw })}\n${courseUrl(model.id)}`;
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
        announce(t("plan.icsDone"));
        return;
      }
      if (ics.dataset.planIcs === "open" && model.open) {
        const info = openInfo(model.open, round, dayOf(round));
        if (!info) return;
        const title = t("plan.icsOpenTitle", { name: model.name });
        const desc = `${t("plan.openTitle")}: ${fmtDay(info.date)} ${info.time ?? t("plan.timeUnknown")}\n${t("plan.icsRound", { date: fmtDay(round) })}\n${t("plan.icsBasis", { text: info.basis })}\n${t("plan.icsOpenRule", { text: model.openRaw })}\n${courseUrl(model.id)}`;
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
        announce(t("plan.icsDone"));
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
