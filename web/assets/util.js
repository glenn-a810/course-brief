// 공통 유틸 — 포맷·한글 초성·이스케이프
export const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

/** 한글 음절을 초성으로 바꾼다. 한글이 아닌 글자는 그대로 둔다. */
export function chosung(str = "") {
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
export function isChosungQuery(q = "") {
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

export function normalize(str = "") {
  // NFKC 는 한글 호환 자모(ㅇㅅ)를 조합용 자모(ᄋᄉ)로 풀어 초성 비교가 깨지므로 NFC 를 쓴다.
  return String(str).toLowerCase().normalize("NFC").replace(/[\s\-_.·'"()[\]]/g, "");
}

export function esc(str = "") {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function fmtWon(n) {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("ko-KR") + "원";
}

export function fmtNum(n, digits = 0) {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

export function fmtDate(d) {
  if (!d) return "";
  return String(d).slice(0, 10).replaceAll("-", ".");
}

export function fmtPct(x) {
  if (x === null || x === undefined) return "—";
  return Math.round(Number(x) * 100) + "%";
}

export const STATUS = {
  operating: { label: "영업중", tone: "ok" },
  suspended: { label: "휴업(영업중단)", tone: "warn" },
  closed: { label: "폐업", tone: "danger" },
  under_construction: { label: "건설중", tone: "info" },
  planned: { label: "미착공", tone: "neutral" },
};

export function badge(tone, text) {
  return `<span class="badge ${tone}">${esc(text)}</span>`;
}

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** 값이 '미확인'인지 (null/빈 배열/빈 문자열) */
export function isMissing(v) {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/** 문자열/숫자/객체(value·text)를 사람이 읽는 한 줄로 */
export function textOf(v) {
  if (v === null || v === undefined || v === "") return "미확인";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") {
    if (v.value !== undefined && v.value !== null) {
      if (typeof v.value === "boolean") return v.value ? "가능" : "불가";
      return String(v.value) + (v.text ? ` (${v.text})` : "");
    }
    if (v.text) return String(v.text);
    if (v.note) return String(v.note);
  }
  return "미확인";
}

export function debounce(fn, ms = 120) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
