/**
 * H4. 지도 뷰 — 좌표가 확인된 구장을 지도에 얹는다.
 *
 * - 유료 키가 필요 없는 OpenStreetMap 타일 + Leaflet(CDN, 첫 사용 때만 내려받는다).
 * - 실패(차단·오프라인)하면 지도만 감추고 같은 화면에서 목록으로 돌아갈 수 있게 안내한다.
 * - 핀은 그린피 라벨을 달고, 누르면 구장 미리보기 카드(상세 링크)가 열린다.
 * - 다크 모드에서는 타일을 반전·채도 조정해 TDS 다크 톤에 맞춘다(타일 서버는 라이트 전용).
 */
import { esc } from "./util.js";
import { manwon } from "./text.js";

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  fee: number | null;
  region: string;
  /** 같은 부지의 다른 코스 — 미리보기 카드에 함께 적는다 */
  members: Array<{ id: string; name: string }>;
}

/* ---------------- Leaflet 최소 타입 ----------------
 * @types/leaflet 의존성을 추가하지 않기 위해, 이 파일이 실제로 쓰는 메서드만 적는다. */

interface LeafletMap {
  setView(center: [number, number], zoom: number): LeafletMap;
  fitBounds(bounds: [[number, number], [number, number]], opts?: Record<string, unknown>): void;
  getZoom(): number;
  on(event: string, fn: () => void): void;
  remove(): void;
  invalidateSize(): void;
  addLayer(layer: unknown): void;
  closePopup(): void;
}

interface LeafletLayer {
  addTo(map: LeafletMap): LeafletLayer;
}

interface LeafletMarker extends LeafletLayer {
  bindPopup(html: string, opts?: Record<string, unknown>): LeafletMarker;
  on(event: string, fn: () => void): LeafletMarker;
}

interface LeafletGroup {
  addTo(map: LeafletMap): LeafletGroup;
  clearLayers(): void;
  addLayer(layer: unknown): void;
}

interface LeafletApi {
  map(el: HTMLElement, opts?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, opts?: Record<string, unknown>): LeafletLayer;
  layerGroup(): LeafletGroup;
  divIcon(opts: Record<string, unknown>): unknown;
  marker(latlng: [number, number], opts?: Record<string, unknown>): LeafletMarker;
}

declare global {
  interface Window {
    L?: LeafletApi;
  }
}

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
/** 좌표가 몇 개 안 될 때 지도가 과하게 확대되지 않도록 하는 상한 */
const MAX_FIT_ZOOM = 12;
/** 이 개수·배율을 넘으면 핀을 묶어 그린다 */
const CLUSTER_THRESHOLD = 40;

let loader: Promise<LeafletApi | null> | null = null;

function loadLeaflet(): Promise<LeafletApi | null> {
  if (window.L) return Promise.resolve(window.L);
  if (loader) return loader;
  loader = new Promise<LeafletApi | null>((resolve) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => resolve(window.L ?? null));
    script.addEventListener("error", () => resolve(null));
    document.head.appendChild(script);
  });
  return loader;
}

function darkMode(): boolean {
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export interface MapController {
  update(points: MapPoint[]): void;
  /** 패널이 다시 보일 때 크기를 다시 잰다 */
  invalidate(): void;
}

/**
 * 지도 패널을 만든다. 첫 update() 때 Leaflet 을 내려받으므로 목록만 보는
 * 사용자는 지도 코드·타일을 받지 않는다.
 */
export function createMap(opts: {
  canvas: HTMLElement;
  shell: HTMLElement;
  fallback: HTMLElement;
  onFallback: () => void;
}): MapController {
  const { canvas, shell, fallback } = opts;
  let map: LeafletMap | null = null;
  let L: LeafletApi | null = null;
  let group: LeafletGroup | null = null;
  let points: MapPoint[] = [];
  let failed = false;

  const applyTheme = (): void => {
    shell.setAttribute("data-map-theme", darkMode() ? "dark" : "light");
  };

  const popupHTML = (p: MapPoint): string => {
    const fee = p.fee == null ? "그린피 미확인" : `${manwon(p.fee)}원~`;
    const others = p.members.length
      ? `<div class="map-card-members">${p.members
          .map((m) => `<a href="#/c/${esc(m.id)}">${esc(m.name)}</a>`)
          .join("")}</div>`
      : "";
    return `<div class="map-card">
      <a class="map-card-name" href="#/c/${esc(p.id)}">${esc(p.name)}</a>
      <span class="map-card-sub">${esc(p.region)} · ${esc(fee)}</span>
      ${others}
      <a class="map-card-go" href="#/c/${esc(p.id)}">상세 보기 →</a>
    </div>`;
  };

  const pinIcon = (label: string, muted: boolean): unknown => L?.divIcon({
    className: `map-pin-wrap${muted ? " is-muted" : ""}`,
    html: `<span class="map-pin">${esc(label)}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  const clusterIcon = (count: number): unknown => L?.divIcon({
    className: "map-cluster-wrap",
    // 한 곳뿐인 칸은 숫자 대신 점으로 그린다 — 전국 배율에서 숫자 1이 잔뜩 겹치면 읽기 어렵다
    html: count === 1 ? `<span class="map-dot"></span>` : `<span class="map-cluster">${count}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  const draw = (): void => {
    if (!map || !L || !group) return;
    group.clearLayers();
    map.closePopup();
    if (!points.length) return;
    const zoom = map.getZoom();
    // 국가 전체가 보이는 배율에서는 묶어서 그리고, 확대하면 개별 핀으로 푼다
    const useCluster = points.length > CLUSTER_THRESHOLD && zoom <= 7;

    // 국가 전체 배율에서는 칸별로 묶어 밀도를 보여 주고(핀 클릭 → 확대), 확대하면 개별 가격 핀으로 푼다
    const singles: MapPoint[] = [];
    if (useCluster) {
      const cell = 360 / Math.pow(2, zoom + 2.5);
      const buckets = new Map<string, MapPoint[]>();
      for (const p of points) {
        const key = `${Math.floor(p.lat / cell)}:${Math.floor(p.lng / cell)}`;
        const arr = buckets.get(key);
        if (arr) arr.push(p);
        else buckets.set(key, [p]);
      }
      for (const arr of buckets.values()) {
        const center: [number, number] = [
          arr.reduce((a, p) => a + p.lat, 0) / arr.length,
          arr.reduce((a, p) => a + p.lng, 0) / arr.length,
        ];
        group.addLayer(L.marker(center, { icon: clusterIcon(arr.length), keyboard: false, title: `구장 ${arr.length}곳` })
          .on("click", () => {
            map?.setView(center, Math.min(arr.length === 1 ? zoom + 3 : zoom + 2, 12));
          }));
      }
    } else {
      singles.push(...points);
    }

    for (const p of singles) {
      const label = p.fee == null ? "—" : manwon(p.fee);
      group.addLayer(L.marker([p.lat, p.lng], {
        icon: pinIcon(label, p.fee == null),
        title: p.name,
        keyboard: true,
      }).bindPopup(popupHTML(p), { maxWidth: 240, closeButton: false, offset: [0, -4] }));
    }
  };

  /**
   * 범위 맞추기 — Leaflet 의 fitBounds 는 컨테이너 크기를 잴 때와 맞출 때가
   * 어긋나면 전국 단위에서 한 단계 낮은 배율을 고른다. 여기서는 메르카토르 비율로
   * 직접 계산해 항상 같은 배율이 나오게 한다(전국 핀 480개 기준 7단계).
   */
  const fit = (): void => {
    if (!map || !points.length) return;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of points) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    }
    if (!Number.isFinite(minLat)) return;
    const w = canvas.clientWidth || 1024;
    const h = canvas.clientHeight || 560;
    const merc = (lat: number): number =>
      (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
    const latFrac = Math.abs(merc(minLat) - merc(maxLat));
    const lngFrac = Math.abs(maxLng - minLng) / 360;
    const zW = Math.log2((w - 80) / Math.max(1e-9, lngFrac * 256));
    const zH = Math.log2((h - 80) / Math.max(1e-9, latFrac * 256));
    const raw = Math.min(zW, zH, MAX_FIT_ZOOM);
    const zoom = Math.max(6, Math.floor((Number.isFinite(raw) ? raw : 7) * 2) / 2);
    map.setView([(minLat + maxLat) / 2, (minLng + maxLng) / 2], zoom);
  };

  const showFallback = (): void => {
    failed = true;
    fallback.hidden = false;
    canvas.hidden = true;
    opts.onFallback();
  };

  return {
    update(next: MapPoint[]): void {
      points = next;
      if (failed) return;
      applyTheme();
      if (map) {
        draw();
        fit();
        return;
      }
      void loadLeaflet().then((api) => {
        if (!api) {
          showFallback();
          return;
        }
        L = api;
        map = api.map(canvas, {
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: true,
          center: [36.4, 127.8],
          zoom: 7,
          zoomSnap: 0.5,
          minZoom: 5,
          maxZoom: 18,
        });
        api.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
        }).addTo(map);
        group = api.layerGroup().addTo(map);
        map.on("zoomend", () => draw());
        // 패널이 막 보이기 시작하면 크기가 아직 0일 수 있다 — 크기를 잰 뒤에 범위를 맞춘다
        map.invalidateSize();
        draw();
        fit();
        setTimeout(() => {
          map?.invalidateSize();
          fit();
        }, 120);
      });
    },
    invalidate(): void {
      if (!map) return;
      map.invalidateSize();
      fit();
      draw();
    },
  } as MapController;
}
