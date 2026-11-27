/**
 * 관리자 모드 — 출처·수집 메타데이터는 관리자에게만 보이고, 일반 화면은 업데이트 날짜만 보여준다.
 *
 * 진입: 푸터의 작은 `관리자` 버튼 → 비밀번호 입력 → 일치하면
 *       localStorage["coursebrief-admin"] = "1" 로 저장돼 재방문에도 유지된다.
 *       배지의 `해제` 는 저장값을 지우고 즉시 일반 모드로 되돌린다.
 *
 * 이 저장소는 공개되어 있으므로 비밀번호 평문을 소스·산출물에 두지 않는다.
 * 비교는 Web Crypto(`crypto.subtle.digest`)로 계산한 SHA-256 해시로만 하고,
 * 코드에는 해시 상수 하나만 둔다.
 *
 * `crypto.subtle` 은 secure context(HTTPS·localhost)에서만 존재한다.
 * 없는 환경에서는 비교를 우회하지 않고 "이 환경에서는 켤 수 없다"고 알린다.
 */

const STORAGE_KEY = "coursebrief-admin";

/**
 * 관리자 비밀번호의 SHA-256(hex).
 * 평문은 이 파일에도, 빌드 산출물에도 두지 않는다 — `npm run verify` 가 평문 유입을 검사한다.
 */
const PASSWORD_SHA256 = "09510f26ae2b0d8bf0efdc6b9f652b73d4fff5418e1b636d659664bc05f5fbbe";

let admin = false;
let notify: (() => void) | null = null;

function byId<T extends HTMLElement>(id: string): T | null {
  const node = document.getElementById(id);
  return node instanceof HTMLElement ? (node as T) : null;
}

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // 저장소를 쓸 수 없는 환경 — 일반 모드로 동작
  }
}

function writeStored(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장 실패(사생활 모드·용량 초과) — 이번 화면에만 적용한다
  }
}

/** 관리자 모드 여부. 렌더링 시점마다 호출해 출처 노출을 분기한다. */
export function isAdmin(): boolean {
  return admin;
}

/** 입력값의 SHA-256(hex). secure context 가 아니면 null */
async function sha256Hex(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/** 푸터 배지·진입 버튼의 표시 상태를 현재 모드에 맞춘다 */
function paint(): void {
  const open = byId<HTMLButtonElement>("admin-open");
  const badge = byId<HTMLElement>("admin-badge");
  if (open) open.hidden = admin;
  if (badge) badge.hidden = !admin;
}

/** 스크린리더 알림(화면에는 보이지 않는다) */
function announce(message: string): void {
  const status = byId<HTMLElement>("admin-status");
  if (status) status.textContent = message;
}

function showError(message: string): void {
  const error = byId<HTMLElement>("admin-error");
  if (!error) return;
  error.textContent = message;
  error.hidden = !message;
}

function openDialog(): void {
  const dialog = byId<HTMLDialogElement>("admin-dialog");
  if (!dialog) return;
  const input = byId<HTMLInputElement>("admin-password");
  showError("");
  if (input) input.value = "";
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute("open", ""); // <dialog> 미지원 브라우저 폴백
  }
  input?.focus();
}

function closeDialog(): void {
  const dialog = byId<HTMLDialogElement>("admin-dialog");
  if (!dialog) return;
  if (dialog.open && typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

async function submitPassword(): Promise<void> {
  const input = byId<HTMLInputElement>("admin-password");
  const button = byId<HTMLButtonElement>("admin-submit");
  if (!input) return;
  const value = input.value;
  if (!value) {
    showError("비밀번호를 입력하세요.");
    input.focus();
    return;
  }
  if (button) button.disabled = true;
  try {
    const hex = await sha256Hex(value);
    if (hex === null) {
      showError("이 브라우저 환경에서는 관리자 모드를 켤 수 없습니다. HTTPS 주소(localhost 포함)에서 다시 시도하세요.");
      return;
    }
    if (hex !== PASSWORD_SHA256) {
      showError("비밀번호가 올바르지 않습니다.");
      input.select();
      return;
    }
    input.value = "";
    closeDialog();
    if (!admin) {
      admin = true;
      writeStored(true);
      paint();
      notify?.();
    }
    announce("관리자 모드로 전환했습니다. 출처 정보가 표시됩니다.");
  } finally {
    if (button) button.disabled = false;
  }
}

/**
 * 부팅 때 한 번 호출한다. 저장된 관리자 상태를 복원하고 푸터 UI 를 연결한다.
 * `onChange` 는 모드가 바뀔 때 화면을 다시 그리도록 앱이 넘기는 콜백이다.
 */
export function initAdmin(onChange: () => void): void {
  notify = onChange;
  admin = readStored();
  paint();

  byId<HTMLButtonElement>("admin-open")?.addEventListener("click", openDialog);
  byId<HTMLButtonElement>("admin-cancel")?.addEventListener("click", closeDialog);
  byId<HTMLButtonElement>("admin-exit")?.addEventListener("click", () => {
    if (admin) {
      admin = false;
      writeStored(false);
      paint();
      notify?.();
    }
    announce("관리자 모드를 해제했습니다. 출처 정보를 숨깁니다.");
    byId<HTMLButtonElement>("admin-open")?.focus();
  });
  byId<HTMLFormElement>("admin-form")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void submitPassword();
  });
}
