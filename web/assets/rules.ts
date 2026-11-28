/**
 * H2·H3 — 취소 마감·위약 계산과 예약 오픈일 계산, 캘린더(.ics) 내보내기.
 *
 * 데이터 규칙
 *  - `parsed_cancel`·`parsed_open` 은 원문에서 기계적으로 읽어 낸 보조값이다. 없으면 계산하지 않고
 *    원문만 보여 준다(추측 금지).
 *  - 요일·시각이 확인되지 않은 값은 `null` 로 두고 화면에서 "시간 미확인"으로 적는다.
 *  - 계산 결과에는 항상 "골프장 확인 권장"을 붙인다(규정이 회원/비회원, 시즌별로 갈리는 구장이 있다).
 */
import type { ParsedCancel, ParsedOpen, ParsedOpenMonthly, ParsedPenalty } from "../../shared/types";

import { t } from "./i18n.js";

export type DayType = "weekday" | "weekend";

/** 요일 이름 — 화면 언어를 따른다(L1). 0=일요일 */
function wdLabel(i: number): string {
  switch (i) {
    case 0: return t("wd.0");
    case 1: return t("wd.1");
    case 2: return t("wd.2");
    case 3: return t("wd.3");
    case 4: return t("wd.4");
    case 5: return t("wd.5");
    default: return t("wd.6");
  }
}
const MONDAY_FIRST = ["월", "화", "수", "목", "금", "토", "일"];

/* ---------------- 날짜 ---------------- */

export function parseISO(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isoOf(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function today(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last));
  return x;
}

/** 월요일 시작 주의 월요일 */
export function mondayOf(d: Date): Date {
  const x = new Date(d.getTime());
  const shift = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - shift);
  return x;
}

export function isWeekendDay(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}

export function dayTypeOf(d: Date): DayType {
  return isWeekendDay(d) ? "weekend" : "weekday";
}

export function weekdayName(d: Date): string {
  return wdLabel(d.getDay());
}

/** 2026.12.24(목) */
export function fmtDay(d: Date): string {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}(${wdLabel(d.getDay())})`;
}

/** 12.24(목) */
export function fmtDayShort(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}(${wdLabel(d.getDay())})`;
}

export function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** D-day 표기 — 오늘 0, 지난 날짜는 음수 */
export function ddayText(d: Date, base: Date = today()): string {
  const n = daysBetween(base, d);
  if (n === 0) return t("common.today");
  return n > 0 ? `D-${n}` : `D+${-n}`;
}

/** 값의 신선도(M9) — 확인일로부터 지난 일수 */
export function daysSince(iso: string | null | undefined, base: Date = today()): number | null {
  const d = parseISO(iso);
  if (!d) return null;
  return daysBetween(d, base);
}

/* ---------------- H2: 취소 마감·위약 ---------------- */

export interface CancelDeadlineInfo {
  daysBefore: number;
  /** 확인된 시각. 없으면 null(화면은 "시간 미확인") */
  time: string | null;
  date: Date;
  /** 이 날짜의 기준이 요일 구분 그대로인지, 반대쪽 요일 값을 빌려 왔는지 */
  borrowed: boolean;
  dday: number;
  passed: boolean;
}

export function freeDeadline(pc: ParsedCancel | null | undefined, day: DayType, round: Date): CancelDeadlineInfo | null {
  if (!pc) return null;
  const own = pc.free?.[day];
  const other = day === "weekday" ? pc.free?.weekend : pc.free?.weekday;
  const slot = own ?? other;
  if (!slot || typeof slot.days_before !== "number") return null;
  const date = addDays(round, -slot.days_before);
  const dday = daysBetween(today(), date);
  return {
    daysBefore: slot.days_before,
    time: slot.time ?? null,
    date,
    borrowed: !own && Boolean(other),
    dday,
    passed: dday < 0,
  };
}

export interface PenaltyRow extends ParsedPenalty {
  /** 이 단계가 적용되는 일수 범위(라운드 N일 전 기준) */
  minDays: number;
  maxDays: number;
  /** 1인 또는 4인 그린피 기준 예시 금액. 기준이 불명확하면 null */
  amount: number | null;
  amountLabel: string;
}

/**
 * 위약 단계 — 라운드일 기준 N일 전 구간. `%` 요율이면 그린피로 예시 금액을 계산하고,
 * 기준(1인/팀)이 확인되지 않으면 금액을 만들지 않는다.
 */
export function penaltyRows(pc: ParsedCancel | null | undefined, day: DayType, green: number | null): PenaltyRow[] {
  if (!pc || !pc.penalty?.length) return [];
  const rows: PenaltyRow[] = [];
  for (const p of pc.penalty) {
    if (p.day && p.day !== day) continue;
    const minDays = Math.min(p.from_days, p.to_days);
    const maxDays = Math.max(p.from_days, p.to_days);
    let amount: number | null = null;
    let amountLabel = "";
    if (p.pct != null && green != null) {
      if (pc.basis === "person") {
        amount = Math.round((green * p.pct) / 100);
        amountLabel = "1인 그린피 기준";
      } else if (pc.basis === "team") {
        amount = Math.round((green * 4 * p.pct) / 100);
        amountLabel = "4인 그린피 기준";
      }
    }
    rows.push({ ...p, minDays, maxDays, amount, amountLabel });
  }
  return rows.sort((a, b) => b.maxDays - a.maxDays);
}

/** 라운드일 기준 N일 전에 지금 적용되는 단계 */
export function activePenalty(rows: PenaltyRow[], daysBefore: number): PenaltyRow | null {
  for (const r of rows) if (daysBefore >= r.minDays && daysBefore <= r.maxDays) return r;
  return null;
}

export function penaltySummary(r: PenaltyRow): string {
  const bits: string[] = [];
  if (r.pct != null) bits.push(`${r.pct}%`);
  if (r.suspend_months != null) bits.push(`예약정지 ${r.suspend_months}개월`);
  if (r.suspend_days != null) bits.push(`예약정지 ${r.suspend_days}일`);
  if (!bits.length) return "위약 규정 있음(금액 미확인)";
  return bits.join(" · ");
}

/* ---------------- H3: 예약 오픈 ---------------- */

export interface OpenInfo {
  date: Date;
  time: string | null;
  /** 계산 근거 문구 — 화면이 그대로 보여 준다 */
  basis: string;
  /** 오늘 기준 D-day(오픈일) */
  dday: number;
  /** 규정이 여러 갈래라 가장 이른 기준을 쓴 경우 등 */
  note: string;
}

function weekdayIndex(word: string): number {
  return MONDAY_FIRST.indexOf(word);
}

function ruleDate(rule: { unit?: string; before?: number; weekday?: string | null }, round: Date): Date | null {
  const before = rule.before ?? 0;
  if (rule.unit === "day") return addDays(round, -before);
  if (rule.unit === "month") {
    const base = addMonths(round, -before);
    if (rule.weekday && weekdayIndex(rule.weekday) >= 0) {
      const mon = mondayOf(base);
      return addDays(mon, weekdayIndex(rule.weekday));
    }
    return base;
  }
  if (rule.unit === "week") {
    if (rule.weekday && weekdayIndex(rule.weekday) >= 0) {
      const mon = addDays(mondayOf(round), -before * 7);
      return addDays(mon, weekdayIndex(rule.weekday));
    }
    return addDays(round, -before * 7);
  }
  return null;
}

/** 매월 N일(또는 첫 번째 X요일) 규칙의 다음 오픈일 */
function nextMonthlyDate(m: ParsedOpenMonthly, from: Date): Date | null {
  const candidates: Date[] = [];
  for (let i = 0; i < 2; i += 1) {
    const month = addMonths(new Date(from.getFullYear(), from.getMonth(), 1, 12), i);
    if (m.day != null) {
      candidates.push(new Date(month.getFullYear(), month.getMonth(), m.day, 12));
    } else if (m.weekday) {
      const idx = weekdayIndex(m.weekday);
      if (idx >= 0) {
        const mon = mondayOf(new Date(month.getFullYear(), month.getMonth(), 1, 12));
        const first = addDays(mon, idx);
        candidates.push(first.getMonth() === month.getMonth() ? first : addDays(first, -7));
      }
    }
  }
  const future = candidates.filter((d) => d.getDate() >= 1).sort((a, b) => a.getTime() - b.getTime());
  return future.find((d) => daysBetween(from, d) >= 0) ?? future[0] ?? null;
}

export function openInfo(po: ParsedOpen | null | undefined, round: Date, day: DayType): OpenInfo | null {
  if (!po) return null;
  const rules = po.rules ?? [];
  const own = rules.find((r) => (r.scope ?? "both") === day);
  const both = rules.find((r) => !r.scope || r.scope === "both");
  const rule = own ?? both;
  if (rule) {
    const d = ruleDate(rule, round);
    if (d) {
      const notes: string[] = [];
      if (po.member_only) notes.push("회원 기준 규정이에요 — 비회원은 다를 수 있어요");
      if (po.ambiguous) notes.push("규칙이 여러 갈래예요 — 가장 이른 기준으로 계산했어요");
      if (po.recurring) notes.push("정기(주 단위) 오픈 규정이에요");
      const basis = `${rule.before}${rule.unit === "week" ? "주" : rule.unit === "day" ? "일" : "개월"} 전${rule.weekday ? ` ${rule.weekday}요일` : ""}${rule.time ? ` ${rule.time}` : ""}`;
      return { date: d, time: rule.time ?? null, basis, dday: daysBetween(today(), d), note: notes.join(" · ") };
    }
  }
  const monthly = (po.monthly ?? []).filter((m) => m.day != null || m.weekday);
  if (monthly.length) {
    const best = monthly
      .map((m) => ({ m, d: nextMonthlyDate(m, today()) }))
      .filter((x): x is { m: ParsedOpenMonthly; d: Date } => x.d != null)
      .sort((a, b) => a.d.getTime() - b.d.getTime())[0];
    if (best) {
      const basis = best.m.day != null ? `매월 ${best.m.day}일` : `매월 ${best.m.weekday}요일(첫 회)`;
      return {
        date: best.d,
        time: best.m.time ?? null,
        basis,
        dday: daysBetween(today(), best.d),
        note: "월 단위 정기 오픈 — 다음 오픈일 기준이에요",
      };
    }
  }
  return null;
}

const METHOD_LABEL: Record<string, string> = {
  lottery: "추첨", fcfs: "선착순", online: "온라인", phone: "전화", onsite: "현장",
};

export function methodLabel(method: string | null | undefined): string {
  return method ? METHOD_LABEL[method] ?? "" : "";
}

/* ---------------- 캘린더(.ics) ---------------- */

export interface IcsEvent {
  uid: string;
  title: string;
  /** 한국 시간 기준 날짜 */
  date: Date;
  time: string | null;
  description: string;
  url?: string;
  /** 몇 분 전 알림. 지정하지 않으면 30분 */
  alarmMinutes?: number;
}

function utcStamp(d: Date, time: string | null, addMinutes = 0): string {
  const [h, m] = (time ?? "09:00").split(":").map((v) => Number(v));
  const ms = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), h, m) + addMinutes * 60_000 - 9 * 3_600_000;
  const t = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}T${p(t.getUTCHours())}${p(t.getUTCMinutes())}00Z`;
}

function icsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** RFC 5545 — 한국 시간(UTC+9, 서머타임 없음)을 UTC 로 바꿔 넣는다 */
export function buildIcs(event: IcsEvent): string {
  const alarm = event.alarmMinutes ?? 30;
  const start = utcStamp(event.date, event.time);
  const end = utcStamp(event.date, event.time, 60);
  const stamp = utcStamp(new Date(), `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CourseBrief//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}@coursebrief.pages.dev`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icsText(event.title)}`,
    `DESCRIPTION:${icsText(event.description)}`,
    ...(event.url ? [`URL:${event.url}`] : []),
    "BEGIN:VALARM",
    `TRIGGER:-PT${alarm}M`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(event.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|]/g, "").slice(0, 80) || "coursebrief.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
