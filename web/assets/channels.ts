/**
 * H6. 예약 채널 딥링크
 *
 * 상세의 연락 액션(전화·홈페이지) 옆에, 실제 예약이 이뤄지는 채널로 가는 길을 붙인다.
 * - 공식 홈페이지·전화는 데이터에 있는 값 그대로.
 * - 예약 플랫폼(카카오골프예약·골프존 티스캐너·스마트스코어)은 각 채널의 공식 주소로 보내고,
 *   구장별 페이지 주소는 채널이 공개하지 않아 '채널에서 구장명으로 검색'임을 행마다 밝힌다.
 * - 구장별 페이지가 데이터에 있는 경우(티픽)는 그 URL 을 그대로 쓴다.
 * - 예약을 대행하지 않는다는 원칙은 문구로 고정한다.
 */
import type { CourseIndexItem } from "../../shared/types";
import { copyText, won } from "./text.js";
import { esc } from "./util.js";
import { icon } from "./icons.js";
import type { IconName } from "./icons.js";

export interface Channel {
  key: string;
  label: string;
  /** 이 채널에서 무엇을 할 수 있는지 한 줄 */
  note: string;
  url: string;
  iconName: IconName;
}

const KAKAO = "https://www.kakao.golf/";
const TEESCANNER = "https://www.teescanner.com/";
const SMARTSCORE = "https://www.smartscore.io/";

function telHref(tel: string): string {
  return `tel:${tel.replace(/[^\d+]/g, "")}`;
}

/** 이 구장에 쓸 수 있는 채널 목록 — 값이 없는 채널은 만들지 않는다 */
export function bookingChannels(c: CourseIndexItem, teepickUrl?: string | null): Channel[] {
  const out: Channel[] = [];
  if (c.homepage) {
    out.push({
      key: "official",
      label: "공식 홈페이지",
      note: "요금표·예약 안내",
      url: c.homepage,
      iconName: "globe",
    });
  }
  out.push({
    key: "kakao",
    label: "카카오골프예약",
    note: "채널에서 구장명 검색",
    url: KAKAO,
    iconName: "golf",
  });
  out.push({
    key: "teescanner",
    label: "골프존 티스캐너",
    note: "채널에서 구장명 검색",
    url: TEESCANNER,
    iconName: "golf",
  });
  out.push({
    key: "smartscore",
    label: "스마트스코어",
    note: "채널에서 구장명 검색",
    url: SMARTSCORE,
    iconName: "golf",
  });
  if (teepickUrl && /teepickgolf\.com/.test(teepickUrl)) {
    out.push({
      key: "teepick",
      label: "티픽 골프장",
      note: "관측 실거래·예약",
      url: teepickUrl,
      iconName: "golf",
    });
  }
  out.push({
    key: "naver",
    label: "네이버 검색",
    note: "예약·후기 검색",
    url: `https://search.naver.com/search.naver?query=${encodeURIComponent(`${c.name} 골프 예약`)}`,
    iconName: "search",
  });
  if (c.tel) {
    out.push({
      key: "tel",
      label: "전화 예약",
      note: c.tel,
      url: telHref(c.tel),
      iconName: "phone",
    });
  }
  return out;
}

/** 상세 요금 영역에 붙는 채널 블록 — 모바일에서는 가로 스크롤 없이 줄바꿈한다 */
export function channelBlockHTML(c: CourseIndexItem, channels: Channel[]): string {
  const rows = channels.map((ch) => `<li>
      <a class="channel-row" href="${esc(ch.url)}" target="_blank" rel="noopener noreferrer">
        <span class="channel-ic">${icon(ch.iconName)}</span>
        <span class="channel-body">
          <span class="channel-label">${esc(ch.label)}</span>
          <span class="channel-note">${esc(ch.note)}</span>
        </span>
        <span class="channel-go">${ch.key === "tel" ? icon("phone") : icon("external")}</span>
      </a>
    </li>`).join("");
  return `<div class="channel-block">
    <div class="channel-head">
      <h3 class="card-title">${icon("external")}예약 채널</h3>
      <button type="button" class="link-btn" data-booking-open>채널 고르기</button>
    </div>
    <ul class="channel-list">${rows}</ul>
    <p class="source-line">${esc(c.name)} — 가격·재고는 채널에서 확인하세요. 코스브리프는 예약을 대행하지 않습니다.</p>
  </div>`;
}

let openDialog: HTMLDialogElement | null = null;

/**
 * 예약 채널 바텀시트. 상세 hero 의 '예약하기' 버튼이 연다.
 * 링크는 새 탭으로 열고, 대화상자는 바로 닫는다(뒤로 가기 흐름을 막지 않게).
 */
export function openBookingSheet(c: CourseIndexItem, channels: Channel[]): void {
  const dialog = document.createElement("dialog");
  dialog.className = "booking-dialog";
  dialog.setAttribute("aria-labelledby", "booking-title");
  const price = c.green_fee?.weekend ?? c.green_fee?.weekday ?? null;
  dialog.innerHTML = `<div class="booking-sheet">
    <div class="booking-head">
      <div>
        <h2 id="booking-title" class="booking-title">예약 채널</h2>
        <p class="booking-sub">${esc(c.name)}${price != null ? ` · 그린피 ${won(price)}~` : ""}</p>
      </div>
      <button type="button" class="icon-btn" data-booking-close aria-label="닫기">${icon("close")}</button>
    </div>
    <ul class="booking-list">
      ${channels.map((ch) => `<li>
        <a class="booking-row" href="${esc(ch.url)}" target="_blank" rel="noopener noreferrer">
          <span class="channel-ic">${icon(ch.iconName)}</span>
          <span class="channel-body">
            <span class="channel-label">${esc(ch.label)}</span>
            <span class="channel-note">${esc(ch.note)}</span>
          </span>
          <span class="channel-go">${ch.key === "tel" ? icon("phone") : icon("external")}</span>
        </a>
      </li>`).join("")}
    </ul>
    <div class="booking-foot">
      <button type="button" class="btn btn-ghost btn-sm" data-booking-copy>${icon("copy")}구장명 복사</button>
      <span class="booking-status" role="status"></span>
    </div>
    <p class="source-line">플랫폼 채널은 구장별 주소를 공개하지 않아, 채널 안에서 구장명으로 검색합니다. 가격·재고는 채널에서 확인하세요. 코스브리프는 예약을 대행하지 않습니다.</p>
  </div>`;

  openDialog?.remove();
  openDialog = dialog;
  document.body.appendChild(dialog);

  const close = (): void => {
    if (dialog.open) dialog.close();
    else dialog.remove();
  };

  dialog.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-booking-close]")) {
      close();
      return;
    }
    if (target.closest("[data-booking-copy]")) {
      void copyText(c.name).then((ok) => {
        const status = dialog.querySelector<HTMLElement>(".booking-status");
        if (status) status.textContent = ok ? "구장명을 복사했습니다." : "복사하지 못했습니다.";
      });
      return;
    }
    if (target.closest(".booking-row")) close();
    // 시트 바깥(백드롭)을 누르면 닫는다
    if (target === dialog) close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") close();
  });

  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

/** 상세 화면의 예약하기·채널 블록 연결 */
export function wireBookingActions(root: HTMLElement, c: CourseIndexItem, channels: Channel[]): void {
  const open = (): void => openBookingSheet(c, channels);
  for (const btn of root.querySelectorAll<HTMLElement>("[data-booking-open]")) {
    btn.addEventListener("click", open);
  }
}
