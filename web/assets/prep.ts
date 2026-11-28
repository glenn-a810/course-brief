/**
 * M5 — 라운드 준비 카드 (전날 요약·인쇄)
 *
 * 상세의 7개 영역에 흩어진 "라운드 당일 확인 항목"만 모아 한 장으로 만든다.
 *  - 확인된 값만 적고, 값이 없으면 줄을 만들지 않는다("미확인"을 "없음"으로 바꾸지 않는다).
 *  - 날짜를 바꾸면 취소 마감(H2)과 날씨(M1)가 함께 다시 계산된다.
 *  - 인쇄는 브라우저 인쇄(@media print)로 처리한다 — 별도 PDF 생성 없이 종이·PDF 모두 가능.
 */
import type { ParsedCancel } from "../../shared/types";
import { esc } from "./util.js";
import { icon } from "./icons.js";
import {
  addDays,
  buildIcs,
  daysBetween,
  dayTypeOf,
  downloadIcs,
  fmtDay,
  freeDeadline,
  isoOf,
  parseISO,
  today,
  weekdayName,
} from "./rules.js";
import { loadWeather, suitability, weatherFor } from "./weather.js";
import type { DailyWeather } from "./weather.js";
import { copyText, courseUrl } from "./text.js";

export interface PrepFact {
  label: string;
  value: string;
}

export interface PrepModel {
  id: string;
  name: string;
  region: string;
  address: string;
  ic: string;
  tel: string;
  homepage: string;
  lat: number | null;
  lng: number | null;
  weekdayFee: number | null;
  weekendFee: number | null;
  cart: number | null;
  caddie: number | null;
  caddieNone: boolean;
  asOf: string;
  cancel: ParsedCancel | null;
  cancelRaw: string;
  weatherSummary: string[];
  ops: PrepFact[];
  facilities: PrepFact[];
  rental: string;
  note: string;
  updated: string;
}

function money(n: number | null): string {
  return n == null ? "" : `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function nextSaturday(): string {
  const base = today();
  const diff = (6 - base.getDay() + 7) % 7;
  return isoOf(addDays(base, diff === 0 ? 7 : diff));
}

function factsHTML(facts: PrepFact[]): string {
  if (!facts.length) return "";
  return `<dl class="prep-facts">${facts.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join("")}</dl>`;
}

function costHTML(model: PrepModel, day: "weekday" | "weekend"): string {
  const green = day === "weekend" ? model.weekendFee : model.weekdayFee;
  if (green == null && model.cart == null && model.caddie == null) return `<p class="prep-empty">요금 정보가 확인되지 않았습니다.</p>`;
  const greenTotal = green != null ? green * 4 : null;
  const caddie = model.caddieNone ? 0 : model.caddie;
  const total = greenTotal == null ? null : greenTotal + (model.cart ?? 0) + (caddie ?? 0);
  const missing = [model.cart == null ? "카트" : "", caddie == null && !model.caddieNone ? "캐디피" : ""].filter(Boolean);
  const row = (label: string, value: string, cls = ""): string => `<div class="prep-cost-row${cls}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  return `<div class="prep-cost">
    ${row("그린피 4인", greenTotal != null ? money(greenTotal) : "1인 요금 미확인")}
    ${row("카트(팀)", model.cart != null ? money(model.cart) : "미확인")}
    ${row("캐디피(팀)", model.caddieNone ? "노캐디" : model.caddie != null ? money(model.caddie) : "미확인")}
    ${row("4인 합계", total != null ? money(total) : "그린피 확인 필요", " is-total")}
    ${total != null ? row("1인당", money(Math.round(total / 4)), " is-sub") : ""}
  </div>
  ${missing.length ? `<p class="prep-note">${esc(missing.join("·"))} 미확인 — 합계에서 빠져 있습니다.</p>` : ""}
  <p class="prep-note">1인 18홀 비회원 기준 · 카트·캐디는 팀 기준 1회${model.asOf ? ` · 요금 확인 ${esc(model.asOf)}` : ""}</p>`;
}

export function renderPrep(root: HTMLElement, model: PrepModel, initialDate?: string): void {
  const state = { date: initialDate && parseISO(initialDate) ? initialDate : nextSaturday(), tee: "" };
  let weather: DailyWeather[] | null = null;
  let loading = true;

  const draw = (): void => {
    const round = parseISO(state.date) ?? today();
    const day = dayTypeOf(round);
    const dl = model.cancel ? freeDeadline(model.cancel, day, round) : null;
    const penaltyHint = model.cancel?.penalty?.length
      ? `위약 ${model.cancel.penalty
        .slice(0, 2)
        .map((p) => `D-${Math.max(p.from_days, p.to_days)}${p.pct != null ? ` ${p.pct}%` : ""}${p.suspend_months ? `·정지 ${p.suspend_months}개월` : ""}`)
        .join(", ")}`
      : "";
    const deadlineText = dl
      ? `${fmtDay(dl.date)}${dl.time ? ` ${dl.time}` : " (시간 미확인)"} · ${dl.passed ? "마감 지남" : `D-${daysBetween(today(), dl.date)}`.replace("D-0", "오늘")}`
      : penaltyHint
        ? `무료 마감 미확인 · ${penaltyHint}`
        : "규정 확인 필요";
    const w = weatherFor(weather, state.date);
    const suit = suitability(w);
    const cost = costHTML(model, day);

    root.innerHTML = `<div class="page prep-page" data-prep>
      <header class="prep-head">
        <div class="prep-head-main">
          <span class="prep-eyebrow">${icon("flag")}라운드 준비 카드</span>
          <h1 class="prep-title" tabindex="-1">${esc(model.name)}</h1>
          <p class="prep-sub">${esc([model.region, model.address].filter(Boolean).join(" · "))}</p>
        </div>
        <div class="prep-actions">
          <button type="button" class="btn btn-sm" data-prep-act="print">${icon("copy")}인쇄</button>
          <button type="button" class="btn btn-ghost btn-sm" data-prep-act="link">${icon("copy")}링크 복사</button>
          <button type="button" class="btn btn-ghost btn-sm" data-prep-act="ics">${icon("calendar")}캘린더</button>
          <a class="btn btn-ghost btn-sm" href="#/c/${esc(model.id)}">${icon("arrow-right")}상세</a>
        </div>
      </header>

      <div class="prep-controls">
        <label class="field field-inline"><span>라운드 날짜</span><input type="date" id="prep-date" value="${esc(state.date)}"></label>
        <label class="field field-inline"><span>티업 시간</span><input type="time" id="prep-tee" value="${esc(state.tee)}"></label>
        <span class="prep-daytag">${esc(weekdayName(round))}요일 · ${day === "weekend" ? "주말" : "주중"} 기준</span>
      </div>

      <div class="prep-grid">
        <section class="prep-block">
          <h2>${icon("calendar")}일정</h2>
          <dl class="prep-facts">
            <div><dt>라운드</dt><dd>${esc(fmtDay(round))}</dd></div>
            <div><dt>티업</dt><dd>${state.tee ? esc(state.tee) : "미입력"}</dd></div>
            <div><dt>취소 마감</dt><dd class="${dl?.passed ? "is-warn" : ""}">${esc(deadlineText)}</dd></div>
            <div><dt>인원</dt><dd>4인 기준 정산</dd></div>
          </dl>
          <p class="prep-note">${esc(model.cancelRaw || "취소 규정이 확인되지 않았습니다. 예약 전 전화로 확인하세요.")}</p>
        </section>

        <section class="prep-block">
          <h2>${icon("pin")}장소 · 연락</h2>
          <dl class="prep-facts">
            ${model.address ? `<div><dt>주소</dt><dd>${esc(model.address)}</dd></div>` : ""}
            ${model.ic ? `<div><dt>최단 IC</dt><dd>${esc(model.ic)}</dd></div>` : ""}
            ${model.tel ? `<div><dt>전화</dt><dd><a class="link" href="tel:${esc(model.tel.replace(/[^\d+]/g, ""))}">${esc(model.tel)}</a></dd></div>` : ""}
          </dl>
          <div class="prep-links">
            ${model.tel ? `<a class="btn btn-ghost btn-sm" href="tel:${esc(model.tel.replace(/[^\d+]/g, ""))}">${icon("phone")}전화</a>` : ""}
            ${model.lat != null && model.lng != null ? `<a class="btn btn-ghost btn-sm" href="https://www.google.com/maps?q=${model.lat},${model.lng}" target="_blank" rel="noopener noreferrer">${icon("pin")}지도</a>` : ""}
            ${model.homepage ? `<a class="btn btn-ghost btn-sm" href="${esc(model.homepage)}" target="_blank" rel="noopener noreferrer">${icon("globe")}홈페이지</a>` : ""}
          </div>
        </section>

        <section class="prep-block">
          <h2>${icon("card")}비용 (4인)</h2>
          ${cost}
        </section>

        <section class="prep-block">
          <h2>${icon("sun")}날씨</h2>
          ${loading ? `<p class="prep-empty">예보를 불러오는 중…</p>`
            : w
              ? `<div class="prep-wx">
                  <div><b>${w.tMin != null && w.tMax != null ? `${Math.round(w.tMin)}~${Math.round(w.tMax)}℃` : "기온 미확인"}</b>
                  <span class="prep-suit suit-${suit?.level ?? "good"}">${esc(suit?.label ?? "")}</span></div>
                  <p>강수 ${w.pop != null ? `${w.pop}%` : "미확인"} · 강수량 ${w.precip != null ? `${w.precip}mm` : "미확인"} · 풍속 ${w.wind != null ? `${Math.round(w.wind)}km/h` : "미확인"}</p>
                  <p class="prep-note">${esc((suit?.reasons ?? []).join(" · "))}</p>
                  <p class="prep-note">일출 ${w.sunrise ? esc(w.sunrise.slice(11)) : "—"} · 일몰 ${w.sunset ? esc(w.sunset.slice(11)) : "—"} · Open-Meteo 참고 예보</p>
                </div>`
              : `<p class="prep-empty">이 날짜는 예보 범위(16일) 밖입니다.</p>`}
          ${model.weatherSummary.length ? `<div class="prep-storm"><b>악천후 정산</b><ul>${model.weatherSummary.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>` : ""}
        </section>

        <section class="prep-block is-wide">
          <h2>${icon("golf")}현장</h2>
          ${model.ops.length ? factsHTML(model.ops) : `<p class="prep-empty">확인된 현장 정보가 없습니다. 전화로 확인하세요.</p>`}
        </section>

        <section class="prep-block is-wide">
          <h2>${icon("building")}부대시설 · 렌탈</h2>
          ${model.facilities.length ? factsHTML(model.facilities) : `<p class="prep-empty">확인된 시설 정보가 없습니다.</p>`}
          ${model.rental ? `<p class="prep-note">클럽 렌탈: ${esc(model.rental)}</p>` : ""}
        </section>
      </div>

      ${model.note ? `<p class="prep-footnote">${esc(model.note)}</p>` : ""}
      <p class="prep-footnote">확인된 항목 ${model.ops.length + model.facilities.length + (model.address ? 1 : 0) + (model.tel ? 1 : 0) + (model.weekdayFee != null || model.weekendFee != null ? 1 : 0)}개 · 값이 없는 항목은 '없음'이 아니라 '확인하지 못함'입니다. ${esc(model.updated)} 기준.</p>
      <p class="prep-footnote">CourseBrief · 코스브리프 · ${esc(courseUrl(model.id))}</p>
    </div>`;

    root.querySelector<HTMLInputElement>("#prep-date")?.addEventListener("change", (ev) => {
      const t = ev.target;
      if (t instanceof HTMLInputElement && t.value) {
        state.date = t.value;
        draw();
      }
    });
    root.querySelector<HTMLInputElement>("#prep-tee")?.addEventListener("change", (ev) => {
      const t = ev.target;
      if (t instanceof HTMLInputElement) {
        state.tee = t.value;
        draw();
      }
    });
  };

  root.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const act = target.closest<HTMLElement>("[data-prep-act]")?.dataset.prepAct;
    if (!act) return;
    if (act === "print") {
      window.print();
      return;
    }
    if (act === "link") {
      const url = `${courseUrl(model.id).replace(/#\/c\//, "#/prep/")}?d=${state.date}`;
      void copyText(url).then((ok) => {
        const box = root.querySelector<HTMLElement>("[data-prep-status]");
        if (box) box.textContent = ok ? "준비 카드 링크를 복사했습니다." : "복사하지 못했습니다.";
      });
      return;
    }
    if (act === "ics") {
      const round = parseISO(state.date) ?? today();
      const title = `[코스브리프] ${model.name} 라운드`;
      downloadIcs(
        `코스브리프-라운드-${model.name}.ics`,
        buildIcs({
          uid: `round-${model.id}-${isoOf(round)}`,
          title,
          date: round,
          time: state.tee || "07:30",
          description: `${model.name} 라운드 ${fmtDay(round)}${state.tee ? ` ${state.tee}` : ""}\n${model.address}\n${courseUrl(model.id)}`,
          url: courseUrl(model.id),
          alarmMinutes: 90,
        }),
      );
    }
  });

  draw();
  void loadWeather(model.lat, model.lng).then((days) => {
    weather = days;
    loading = false;
    draw();
  });
}
