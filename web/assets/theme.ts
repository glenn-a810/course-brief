/**
 * 테마 선택 — 자동(시스템) / 라이트 / 다크 3택.
 *
 * 이전에는 버튼 하나가 3단 순환했지만, 원하는 상태까지 몇 번 눌러야 하는지 외워야 했다.
 * 지금은 헤더의 테마 버튼이 메뉴를 열고, 세 선택지 중 하나를 바로 고른다.
 *
 * html[data-theme] 가 CSS 변수(--bg, --text …)를 바꾸고, 선택값은 localStorage 에 저장한다.
 * 첫 페인트 전 적용(깜빡임 방지)은 index.html <head> 의 초기화 스크립트가 맡으므로
 * 저장 키와 값 이름은 그 스크립트와 같아야 한다(coursebrief-theme / light·dark).
 */
export type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "coursebrief-theme";
const CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];
const LABEL: Record<ThemeChoice, string> = { system: "자동(시스템 설정)", light: "라이트", dark: "다크" };
const THEME_COLOR: Record<"light" | "dark", string> = { light: "#f5f5f7", dark: "#000000" };

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function isChoice(v: string | null | undefined): v is ThemeChoice {
  return typeof v === "string" && (CHOICES as readonly string[]).includes(v);
}

function readChoice(): ThemeChoice {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isChoice(raw) ? raw : "system";
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

function effective(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  return darkQuery.matches ? "dark" : "light";
}

/** html 속성·모바일 브라우저 상단바 색·선택 상태를 한 번에 맞춘다.
 *  announce 는 사용자가 직접 바꾼 경우에만 true — 첫 로드에서 스크린리더가 읽지 않게 한다. */
function paint(choice: ThemeChoice, announce = false): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);

  const color = THEME_COLOR[effective(choice)];
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.setAttribute("content", color);
  }

  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-theme-choice]")) {
    btn.setAttribute("aria-pressed", btn.dataset.themeChoice === choice ? "true" : "false");
  }
  const menu = document.getElementById("theme-toggle");
  const summary = menu?.querySelector("summary");
  summary?.setAttribute("aria-label", `테마: ${LABEL[choice]} — 눌러서 변경`);
  summary?.setAttribute("title", `테마: ${LABEL[choice]}`);

  const status = document.getElementById("theme-status");
  if (status && announce) status.textContent = `테마 ${LABEL[choice]}`;
}

export function initTheme(): void {
  let choice = readChoice();
  paint(choice);

  const menu = document.getElementById("theme-toggle");
  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-theme-choice]")) {
    btn.addEventListener("click", () => {
      const next = btn.dataset.themeChoice;
      if (!isChoice(next)) return;
      choice = next;
      saveChoice(choice);
      paint(choice, true);
      if (menu instanceof HTMLDetailsElement) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    });
  }

  // 바깥을 누르면 메뉴를 닫는다(details 는 기본으로 열린 채 남는다)
  document.addEventListener("click", (ev) => {
    if (!(menu instanceof HTMLDetailsElement) || !menu.open) return;
    const target = ev.target;
    if (target instanceof Node && !menu.contains(target)) menu.open = false;
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape" || !(menu instanceof HTMLDetailsElement) || !menu.open) return;
    menu.open = false;
    menu.querySelector("summary")?.focus();
  });

  // 시스템 모드에서 OS 설정이 바뀌면 CSS 는 자동으로 따라가지만,
  // 상단바 색은 JS 가 맞춰 줘야 한다.
  darkQuery.addEventListener("change", () => {
    if (choice === "system") paint(choice);
  });
}
