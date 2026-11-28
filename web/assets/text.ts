/**
 * 새 기능 모듈(총비용 계산기·비교·예약 채널)이 함께 쓰는 표기 도우미.
 *
 * app.ts 안의 규칙과 같은 기준을 따른다:
 *  - `null` 은 '미확인'이며 '없음'과 다르다 — 값을 지어내지 않는다.
 *  - 수집 흔적(접속 차단·수집 실패 등)과 '미확인' 표기는 일반 화면의 값으로 쓰지 않는다
 *    (app.ts 의 INTERNAL_NOTE 와 같은 목록. 모듈 순환 import 를 피하려고 여기에 둔다).
 */
import { manwonLabel, money } from "./i18n.js";

const UNKNOWN_TEXT = /미확인|확인\s*안\s*됨|확인하지\s*못한/;
const COLLECTION_NOTE =
  /접속\s*차단|접속\s*불가|접속\s*실패|페이지\s*차단|수집\s*실패|수집\s*불가|차단됨|타임\s*아웃|타임아웃|응답\s*없음|로그인\s*필요|HTTP\s*[45]\d\d/;

/** 일반 화면에서 값으로 낼 수 없는 표기(미확인 + 수집 상태 메모) */
export const INTERNAL_NOTE = new RegExp(`(?:${UNKNOWN_TEXT.source})|(?:${COLLECTION_NOTE.source})`);

/** 원 단위 금액. 값이 없으면 빈 문자열(자리표시자 없음) */
export function won(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return money(n);
}

/** 만원 단위 축약 — 지도 핀처럼 좁은 자리에 큰 금액을 넣을 때 */
export function manwon(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return manwonLabel(n);
}

/** 문장형 값에서 내부 표기를 걷어낸다. 남는 게 없으면 빈 문자열 */
export function cleanNote(v: string | null | undefined): string {
  if (!v || !v.trim()) return "";
  const text = v.trim();
  if (!INTERNAL_NOTE.test(text)) return text;
  // 괄호 안이 수집 메모면 괄호째 빼고, 남은 문장에 미확인이 있으면 값으로 쓰지 않는다
  const withoutParen = text.replace(/\s*\(([^()]*)\)/g, (m: string, inner: string) => (INTERNAL_NOTE.test(inner) ? "" : m));
  return INTERNAL_NOTE.test(withoutParen) ? "" : withoutParen.trim();
}

/** 현재 화면의 구장 상세 링크 — 공유 문구에 쓴다 */
export function courseUrl(id: string): string {
  const base = `${location.origin}${location.pathname}`.replace(/index\.html$/, "");
  return `${base}#/c/${encodeURIComponent(id)}`;
}

/**
 * 공유하기 — Web Share API 가 있으면 시스템 공유 시트, 없으면 클립보드 복사.
 * 둘 다 실패하면 false 를 돌려 호출부가 실패 문구를 낸다.
 */
export async function shareOrCopy(text: string, url?: string): Promise<"shared" | "copied" | "failed"> {
  const payload = url ? `${text}\n${url}` : text;
  const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> };
  if (typeof nav.share === "function") {
    try {
      await nav.share({ text, ...(url ? { url } : {}) });
      return "shared";
    } catch (err) {
      // 사용자가 공유 시트를 닫은 경우(AbortError)는 실패가 아니다 — 복사로 넘어간다
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
    }
  }
  return (await copyText(payload)) ? "copied" : "failed";
}

/** 클립보드 복사 — 권한이 막힌 브라우저를 위해 execCommand 폴백을 둔다 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 아래 폴백으로 넘어간다
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
