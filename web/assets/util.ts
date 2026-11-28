// 공통 유틸 — 포맷·한글 초성·이스케이프 (DOM 외 런타임 의존 없음)
import type { CourseStatus } from "../../shared/types";
import { money, t } from "./i18n.js";

export const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

/** 한글 음절을 초성으로 바꾼다. 한글이 아닌 글자는 그대로 둔다. */
export function chosung(str: string | null | undefined = ""): string {
  let out = "";
  for (const ch of String(str)) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) out += CHO[Math.floor((c - 0xac00) / 588)];
    else out += ch;
  }
  return out;
}

const CHO_SET = new Set([...CHO]);

/** 검색어가 초성만으로 이루어졌는지 */
export function isChosungQuery(q: string | null | undefined = ""): boolean {
  const s = String(q).replace(/[\s·.\-_]/g, "");
  if (!s) return false;
  let has = false;
  for (const ch of s) {
    if (CHO_SET.has(ch)) has = true;
    else if (/[a-z0-9]/i.test(ch)) return false;
    else if (!/[\s]/.test(ch)) return false;
  }
  return has;
}

export function normalize(str: string | null | undefined = ""): string {
  // NFKC 는 한글 호환 자모(ㅇㅅ)를 조합용 자모(ᄋᄉ)로 풀어 초성 비교가 깨지므로 NFC 를 쓴다.
  return String(str).toLowerCase().normalize("NFC").replace(/[\s\-_.·'"()[\]]/g, "");
}

export function esc(str: unknown = ""): string {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function fmtWon(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return money(v);
}

export function fmtNum(n: number | string | null | undefined, digits = 0): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  const s = String(d).trim();
  if (!s) return "";
  return s.slice(0, 10).replaceAll("-", ".");
}

export function fmtPct(x: number | null | undefined): string {
  if (x === null || x === undefined) return "—";
  return Math.round(Number(x) * 100) + "%";
}

/** 바이트 크기 → KB. index.json 처럼 실제 파일 크기를 보여줄 때 쓴다 */
export function fmtKB(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  return (bytes / 1024).toFixed(1) + "KB";
}

export type BadgeTone = "ok" | "warn" | "danger" | "info" | "neutral";

export interface StatusMeta {
  label: string;
  tone: BadgeTone;
}

/**
 * 운영 상태 — 라벨은 화면 언어로 만든다(L1). tone 은 언어와 무관하다.
 * getter 로 두면 `STATUS[x].label` 을 쓰는 모든 화면(칩·배지·요약)이 언어를 따라간다.
 */
export const STATUS: Record<CourseStatus, StatusMeta> = {
  get operating() { return { label: t("status.operating"), tone: "ok" as BadgeTone }; },
  get suspended() { return { label: t("status.suspended"), tone: "warn" as BadgeTone }; },
  get closed() { return { label: t("status.closed"), tone: "danger" as BadgeTone }; },
  get under_construction() { return { label: t("status.under_construction"), tone: "info" as BadgeTone }; },
  get planned() { return { label: t("status.planned"), tone: "neutral" as BadgeTone }; },
  get cancelled() { return { label: t("status.cancelled"), tone: "neutral" as BadgeTone }; },
};

const STATUS_IDS = Object.keys(STATUS) as CourseStatus[];

/** 알 수 없는 문자열이 와도 배지가 깨지지 않게 영업중으로 되돌린다 */
export function statusOf(status: string | null | undefined): StatusMeta {
  return status && isCourseStatus(status) ? STATUS[status] : STATUS.operating;
}

export function isCourseStatus(v: string | null | undefined): v is CourseStatus {
  return typeof v === "string" && (STATUS_IDS as string[]).includes(v);
}

export function badge(tone: BadgeTone | string, text: string): string {
  return `<span class="badge ${esc(tone)}">${esc(text)}</span>`;
}

export function el(html: string): HTMLElement | null {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement | null;
}

/** 값이 '미확인'인지 (null/빈 배열/빈 문자열) */
export function isMissing(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/** 문자열/숫자/객체(value·text·note)를 사람이 읽는 한 줄로 */
export function textOf(v: unknown): string {
  if (v === null || v === undefined || v === "") return "미확인";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.value !== undefined && o.value !== null) {
      if (typeof o.value === "boolean") return o.value ? "가능" : "불가";
      return String(o.value) + (o.text ? ` (${String(o.text)})` : "");
    }
    if (o.text) return String(o.text);
    if (o.note) return String(o.note);
  }
  return "미확인";
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms = 120): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t !== undefined) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
