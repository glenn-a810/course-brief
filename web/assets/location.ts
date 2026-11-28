/**
 * M2 — 위치·교통 영역.
 *
 * 기본·입지의 '소재'(주소·최단 IC)와 역할을 나눠, 여기서는 **찾아가는 방법**만 다룬다:
 * 주소 복사 → 지도 앱 3종(네이버·카카오·구글) → 최단 IC·좌표 → 주차 → 셔틀·대중교통.
 *
 * 데이터 원칙
 *  - 주차는 `facilities.parking.value` 처럼 **공식 안내에서 확인된 값만** 쓴다.
 *    근거 문장에서 '주차'라는 낱말만 보고 뽑아낸 조각(보통 하차 동선·약관 문구)은
 *    512곳 중 9곳뿐이고 오탐이 섞여 있어 값으로 쓰지 않는다 — 없는 곳은 '미확인'으로 적는다.
 *  - 값이 없을 때 칸을 없애지 않는다. '미확인'과 '없음'은 다르고, 라운드 전날 확인이
 *    필요한 정보라 전화 안내와 함께 자리를 지킨다.
 *  - 좌표·지도 링크는 값이 아니라 계산이므로 좌표가 없으면 해당 버튼만 뺀다.
 *
 * 딥링크(0원·정확)만 쓴다. 실시간 소요시간은 이동 API 키가 필요해 넣지 않는다.
 */
import { icon, iconTile } from "./icons.js";
import { esc } from "./util.js";

export interface LocationModel {
  id: string;
  name: string;
  /** 시도 · 시군구 (지도 검색어 보조) */
  region: string;
  address: string;
  addressNote: string;
  ic: { name: string; km: number | null } | null;
  icNote: string;
  lat: number | null;
  lng: number | null;
  /** 확인된 주차 안내(없으면 빈 문자열) */
  parking: string;
  /** 확인된 셔틀·대중교통 안내(없으면 빈 문자열) */
  transit: string;
  tel: string | null;
}

/** 지도 앱 링크 — 출발지는 지도 앱의 현재 위치를 쓴다(사이트는 위치를 묻지 않는다) */
export function mapLinks(m: Pick<LocationModel, "name" | "address" | "region" | "lat" | "lng">): {
  naver: string;
  kakao: string;
  google: string;
} {
  const query = [m.name, m.address || m.region].filter(Boolean).join(" ");
  const hasGeo = m.lat != null && m.lng != null;
  const lat = m.lat ?? 0;
  const lng = m.lng ?? 0;
  return {
    naver: `https://map.naver.com/p/search/${encodeURIComponent(m.address || m.name)}`,
    kakao: hasGeo
      ? `https://map.kakao.com/link/to/${encodeURIComponent(m.name)},${lat},${lng}`
      : `https://map.kakao.com/link/search/${encodeURIComponent(query)}`,
    google: hasGeo
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
  };
}

/** 좌표 표기 — 복사·표시에 같은 소수를 쓴다(6자리는 약 10cm) */
export function coordText(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

function copyBtn(text: string, label: string, smallLabel = "복사"): string {
  return `<button type="button" class="copy-inline" data-copy="${esc(text)}" data-copy-label="${esc(label)}">${icon("copy")}${esc(smallLabel)}</button>`;
}

const UNKNOWN = `<span class="loc-unknown">미확인</span>`;

export function locationSection(m: LocationModel): string {
  const links = mapLinks(m);
  const hasGeo = m.lat != null && m.lng != null;
  const address = m.address || "";
  const tel = m.tel ? m.tel.replace(/[^\d+]/g, "") : "";

  const addressBlock = address
    ? `<div class="loc-card">
        <span class="loc-label">주소</span>
        <p class="loc-addr">${esc(address)}</p>
        ${m.addressNote ? `<p class="loc-sub">${esc(m.addressNote)}</p>` : ""}
        <div class="loc-card-actions">${copyBtn(address, "주소")}</div>
      </div>`
    : `<div class="loc-card">
        <span class="loc-label">주소</span>
        <p class="loc-addr loc-unknown">확인된 주소가 없습니다</p>
        <p class="loc-sub">지도 앱에서 구장 이름으로 검색하거나 골프장에 전화로 확인하세요.</p>
      </div>`;

  const mapsBlock = `<div class="loc-maps" role="group" aria-label="지도 앱에서 길찾기">
      <a class="loc-map" href="${esc(links.naver)}" target="_blank" rel="noopener noreferrer">
        <b>네이버 지도</b><span>길찾기</span>
      </a>
      <a class="loc-map" href="${esc(links.kakao)}" target="_blank" rel="noopener noreferrer">
        <b>카카오맵</b><span>길찾기</span>
      </a>
      <a class="loc-map" href="${esc(links.google)}" target="_blank" rel="noopener noreferrer">
        <b>구글 지도</b><span>길찾기</span>
      </a>
    </div>`;

  const icValue = m.ic
    ? `${esc(m.ic.name)}${m.ic.km != null ? ` <b>${esc(String(m.ic.km))}km</b>` : ""}`
    : UNKNOWN;

  const rows: string[] = [
    `<div class="mini-fact"><span>최단 IC</span><b>${icValue}</b></div>`,
  ];
  if (hasGeo) {
    const lat = m.lat as number;
    const lng = m.lng as number;
    rows.push(`<div class="mini-fact"><span>좌표</span><b>${esc(lat.toFixed(4))}, ${esc(lng.toFixed(4))} ${copyBtn(coordText(lat, lng), "좌표")}</b></div>`);
  } else {
    rows.push(`<div class="mini-fact"><span>좌표</span><b>${UNKNOWN}</b></div>`);
  }
  rows.push(
    `<div class="mini-fact"><span>주차</span><b>${m.parking ? esc(m.parking) : UNKNOWN}</b></div>`,
  );
  rows.push(
    `<div class="mini-fact"><span>셔틀·교통</span><b>${m.transit ? esc(m.transit) : UNKNOWN}</b></div>`,
  );

  const missing = [!m.parking, !m.transit].filter(Boolean).length;

  return `<section class="section" id="s-loc" aria-labelledby="s-loc-h">
    <div class="section-head">
      <h2 id="s-loc-h">${iconTile("pin", "teal", "sm")}위치 · 교통</h2>
      <p class="section-desc">주소와 최단 IC, 지도 앱 길찾기, 주차·셔틀 안내. 확인된 값만 적고 확인되지 않은 항목은 '미확인'으로 표시합니다.</p>
    </div>
    <div class="section-body">
      <div class="loc-grid">
        ${addressBlock}
        <div class="loc-card is-maps">
          <span class="loc-label">지도에서 길찾기</span>
          ${mapsBlock}
          <p class="loc-sub">출발지는 지도 앱의 현재 위치를 씁니다. 이 사이트는 위치 정보를 요청하지 않습니다.</p>
        </div>
      </div>
      <div class="mini-facts">${rows.join("")}</div>
      ${m.icNote ? `<p class="source-line">${esc(m.icNote)}</p>` : ""}
      ${
        missing
          ? `<p class="loc-hint">${icon("info")}<span>주차·셔틀 정보가 없는 구장입니다. 예약 전 ${
              tel ? `<a class="link" href="tel:${esc(tel)}">골프장(${esc(m.tel ?? "")})</a>` : "골프장"
            }에 전화로 확인하세요.</span></p>`
          : ""
      }
    </div>
  </section>`;
}
