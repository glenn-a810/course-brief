/**
 * 테마 전환 — 시스템(기본) → 라이트 → 다크 순환.
 *
 * html[data-theme] 가 CSS 변수(--bg, --text …)를 바꾸고, 선택값은 localStorage 에 저장한다.
 * 첫 페인트 전 적용(깜빡임 방지)은 index.html <head> 의 초기화 스크립트가 맡으므로
 * 저장 키와 값 이름은 그 스크립트와 같아야 한다(coursebrief-theme / light·dark).
 */
export type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "coursebrief-theme";
const ORDER: readonly ThemeChoice[] = ["system", "light", "dark"];
const LABEL: Record<ThemeChoice, string> = { system: "시스템", light: "라이트", dark: "다크" };
const THEME_COLOR: Record<"light" | "dark", string> = { light: "#ffffff", dark: "#000000" };

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function readChoice(): ThemeChoice {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    return "system"; // 저장소를 쓸 수 없는 환경 — 시스템 설정으로 동작
  }
}

function saveChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // 저장 실패(사생활 모드·용량 초과) — 이번 방문에만 적용한다
  }
}

function nextChoice(choice: ThemeChoice): ThemeChoice {
  return ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
}

function effective(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  return darkQuery.matches ? "dark" : "light";
}

/** html 속성·모바일 브라우저 상단바 색·버튼 접근성 이름을 한 번에 맞춘다.
 *  announce 는 사용자가 직접 바꾼 경우에만 true — 첫 로드에서 스크린리더가 읽지 않게 한다. */
function paint(choice: ThemeChoice, announce = false): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);

  const color = THEME_COLOR[effective(choice)];
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.setAttribute("content", color);
  }

  const next = nextChoice(choice);
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.setAttribute("aria-label", `테마: ${LABEL[choice]} (누르면 ${LABEL[next]})`);
    btn.setAttribute("title", `테마: ${LABEL[choice]} — 누르면 ${LABEL[next]}`);
    btn.dataset.choice = choice;
  }
  const status = document.getElementById("theme-status");
  if (status && announce) status.textContent = `테마 ${LABEL[choice]}`;
}

export function initTheme(): void {
  let choice = readChoice();
  paint(choice);

  const btn = document.getElementById("theme-toggle");
  btn?.addEventListener("click", () => {
    choice = nextChoice(choice);
    saveChoice(choice);
    paint(choice, true);
  });

  // 시스템 모드에서 OS 설정이 바뀌면 CSS 는 자동으로 따라가지만,
  // 상단바 색은 JS 가 맞춰 줘야 한다.
  darkQuery.addEventListener("change", () => {
    if (choice === "system") paint(choice);
  });
}
