/**
 * M6(2) — 일반 사용자용 `정보 오류·누락 제보` 창구.
 *
 * 이 사이트는 백엔드가 없는 정적 사이트다. 그래서 제보를 '접수'하는 척하지 않고,
 * 사용자가 쓴 내용을 그대로 담아 **GitHub 이슈 작성 페이지를 여는** 데까지만 한다
 * (로그인이 필요하면 '내용 복사'로 우회할 수 있게 둘 다 제공).
 *
 * 개인정보는 선택 항목 하나(회신용 연락처)뿐이고, 이슈 본문에 그대로 들어간다는 것을
 * 입력칸 옆에 적는다. 구장·항목·내용·현재 값은 제보 품질을 위해 자동으로 붙인다.
 */
import { icon, iconTile } from "./icons.js";
import { esc } from "./util.js";
import { copyText } from "./text.js";

export interface ReportCourse {
  id: string;
  name: string;
  sido: string;
  sigungu: string;
}

export interface ReportOptions {
  repoUrl: string;
  courses: ReportCourse[];
  /** `#/report?c={id}` 로 들어왔을 때 미리 고를 구장 */
  initialId?: string;
  initialField?: string;
}

/** 제보 항목 — 상세 화면의 영역 이름과 맞춘다 */
export const REPORT_FIELDS = [
  "요금·예약",
  "코스 스펙",
  "현장 운영",
  "부대시설",
  "위치·교통",
  "공지·브리핑",
  "클럽 렌탈",
  "구장 기본 정보(명칭·주소·전화)",
  "기타",
] as const;

function findCourse(courses: ReportCourse[], key: string): ReportCourse | null {
  if (!key) return null;
  return courses.find((c) => c.id === key) ?? courses.find((c) => c.name === key) ?? null;
}

export function renderReport(host: HTMLElement, opts: ReportOptions): void {
  const initial = findCourse(opts.courses, opts.initialId ?? "");
  const fields = [...REPORT_FIELDS];
  const fieldOptions = fields
    .map((f) => `<option value="${esc(f)}"${opts.initialField === f ? " selected" : ""}>${esc(f)}</option>`)
    .join("");

  host.innerHTML = `<div class="page report-page">
    <header class="page-head">
      ${iconTile("bell", "yellow", "lg")}
      <div class="page-head-text">
        <h1 class="page-title" tabindex="-1">정보 오류·누락 제보</h1>
        <p class="page-lead">현장에서 확인한 값이 사이트와 다르면 알려주세요. 제보는 공개 저장소(GitHub)의 이슈로 접수됩니다.</p>
      </div>
    </header>

    <form class="report-form" id="report-form" novalidate>
      <div class="report-grid">
        <label class="field">
          <span>골프장</span>
          <input id="rp-course" type="text" list="rp-course-list" autocomplete="off"
                 placeholder="골프장 이름 (예: 아난티클럽서울)" value="${esc(initial?.name ?? "")}">
          <small>목록에 없는 이름도 그대로 적어 주세요.</small>
        </label>
        <label class="field">
          <span>항목</span>
          <select id="rp-field">${fieldOptions}</select>
        </label>
      </div>
      <datalist id="rp-course-list">
        ${opts.courses.map((c) => `<option value="${esc(c.name)}">${esc([c.sido, c.sigungu].filter(Boolean).join(" "))}</option>`).join("")}
      </datalist>

      <label class="field">
        <span>현재 사이트에 표시된 값 <small class="muted">(선택)</small></span>
        <input id="rp-current" type="text" autocomplete="off" placeholder="예: 주중 120,000원">
      </label>

      <label class="field">
        <span>제보 내용 <b class="req">필수</b></span>
        <textarea id="rp-body" rows="6" placeholder="예: 2026년 11월 기준 주중 그린피가 135,000원으로 인상되었습니다. 카트비는 별도 100,000원입니다."></textarea>
      </label>

      <label class="field">
        <span>회신용 연락처 <small class="muted">(선택)</small></span>
        <input id="rp-contact" type="text" autocomplete="off" placeholder="이메일 또는 전화번호">
        <small>적으면 이슈 본문에 그대로 공개됩니다. 필요할 때만 적어 주세요.</small>
      </label>

      <p class="report-error" id="rp-error" role="alert" hidden></p>

      <div class="report-preview">
        <span class="inline-fact-label">이슈에 들어갈 내용</span>
        <pre class="pre" id="rp-preview"></pre>
      </div>

      <div class="report-actions">
        <button class="btn btn-primary" type="submit" id="rp-submit">${icon("external")}GitHub에서 이슈 작성</button>
        <button class="btn btn-ghost" type="button" id="rp-copy">${icon("copy")}내용 복사</button>
        <button class="btn btn-ghost" type="button" id="rp-reset">초기화</button>
      </div>
      <p class="report-status" id="rp-status" role="status"></p>

      <div class="callout">
        <strong>${icon("info")}접수 방식</strong>
        이슈 작성 페이지가 새 탭에서 열리고, 아래 내용이 제목·본문에 미리 채워집니다. GitHub 로그인이 필요하므로,
        로그인 없이 보내려면 <b>내용 복사</b>로 복사해 원하는 경로로 전달해 주세요. 접수 여부는 저장소의 이슈에서 확인할 수 있습니다.
        <a class="link" href="${esc(opts.repoUrl)}/issues" target="_blank" rel="noopener noreferrer">열린 제보 보기</a>
      </div>
    </form>
  </div>`;

  const form = host.querySelector<HTMLFormElement>("#report-form");
  const courseInput = host.querySelector<HTMLInputElement>("#rp-course");
  const fieldSelect = host.querySelector<HTMLSelectElement>("#rp-field");
  const currentInput = host.querySelector<HTMLInputElement>("#rp-current");
  const bodyInput = host.querySelector<HTMLTextAreaElement>("#rp-body");
  const contactInput = host.querySelector<HTMLInputElement>("#rp-contact");
  const preview = host.querySelector<HTMLElement>("#rp-preview");
  const error = host.querySelector<HTMLElement>("#rp-error");
  const status = host.querySelector<HTMLElement>("#rp-status");
  if (!form || !courseInput || !fieldSelect || !currentInput || !bodyInput || !contactInput || !preview) return;

  const matched = (): ReportCourse | null => findCourse(opts.courses, courseInput.value.trim());

  const compose = (): { title: string; body: string } => {
    const course = matched();
    const name = course?.name ?? (courseInput.value.trim() || "(구장 미지정)");
    const id = course ? ` (${course.id})` : "";
    const field = fieldSelect.value;
    const current = currentInput.value.trim();
    const body = bodyInput.value.trim();
    const contact = contactInput.value.trim();
    const title = `[제보] ${name} — ${field}`.slice(0, 120);
    const lines = [
      "### 정보 오류·누락 제보",
      "",
      `- **골프장**: ${name}${id}`,
      `- **항목**: ${field}`,
      ...(current ? [`- **현재 표시 값**: ${current}`] : []),
      ...(contact ? [`- **회신 연락처**: ${contact}`] : []),
      "",
      "**제보 내용**",
      "",
      body || "(내용을 적어 주세요)",
      "",
      "---",
      `출처: CourseBrief 정보 오류 제보 화면 (${course ? `https://coursebrief.pages.dev/#/c/${course.id}` : "https://coursebrief.pages.dev/#/report"})`,
    ];
    return { title, body: lines.join("\n") };
  };

  const paint = (): void => {
    preview.textContent = `${compose().title}\n\n${compose().body}`;
  };

  const showError = (msg: string): void => {
    if (!error) return;
    error.textContent = msg;
    error.hidden = !msg;
  };

  form.addEventListener("input", () => {
    showError("");
    paint();
  });
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!bodyInput.value.trim()) {
      showError("제보 내용을 적어 주세요. 무엇이 어떻게 다른지 한 줄이면 충분합니다.");
      bodyInput.focus();
      return;
    }
    const { title, body } = compose();
    const url = `${opts.repoUrl}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    if (status) status.textContent = "이슈 작성 페이지를 새 탭에서 열었습니다. GitHub 로그인이 필요합니다.";
  });
  host.querySelector("#rp-copy")?.addEventListener("click", () => {
    if (!bodyInput.value.trim()) {
      showError("제보 내용을 적어 주세요.");
      bodyInput.focus();
      return;
    }
    const { title, body } = compose();
    void copyText(`${title}\n\n${body}`).then((ok) => {
      if (status) status.textContent = ok ? "제보 내용을 복사했습니다." : "복사하지 못했습니다. 내용을 직접 선택해 복사해 주세요.";
    });
  });
  host.querySelector("#rp-reset")?.addEventListener("click", () => {
    courseInput.value = initial?.name ?? "";
    fieldSelect.selectedIndex = 0;
    currentInput.value = "";
    bodyInput.value = "";
    contactInput.value = "";
    showError("");
    if (status) status.textContent = "";
    paint();
    courseInput.focus();
  });

  paint();
}
