/**
 * M8 — 오프라인(PWA) 배선.
 *
 * 골프장은 산·외곽이 많아 라운드 당일 전파가 약하다. 앱 셸·index.json·최근 본 구장 JSON 을
 * Service Worker(`/sw.js`, 빌드가 해시 버전으로 생성)가 캐시하고, 이 모듈은 그 등록과
 * 두 가지 안내(오프라인 / 새 버전)만 맡는다.
 *
 * 버전 관리 원칙: sw.js 의 캐시 이름에 빌드 시각이 들어가므로 새 배포는 항상 새 캐시를 쓴다.
 * 그래도 열려 있는 탭은 옛 셸을 쓰므로, 새 워커가 설치되면 '새로고침' 배너로 사용자가
 * 직접 넘어가게 한다(자동 새로고침은 입력 중인 검색·폼을 지운다).
 */

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

function byId<T extends HTMLElement>(id: string): T | null {
  const node = document.getElementById(id);
  return node instanceof HTMLElement ? (node as T) : null;
}

function setNetBanner(show: boolean, text?: string): void {
  const banner = byId<HTMLElement>("net-banner");
  if (!banner) return;
  const label = banner.querySelector<HTMLElement>(".net-banner-text");
  if (text && label) label.innerHTML = text;
  banner.hidden = !show;
}

function setUpdateBanner(show: boolean): void {
  const banner = byId<HTMLElement>("update-banner");
  if (banner) banner.hidden = !show;
}

export function initPWA(dataBase: string, savedIds: string[] = []): void {
  // 오프라인 안내는 Service Worker 없이도 동작한다(네트워크 상태만 본다)
  const offlineText = "<b>오프라인 상태예요</b> 최근에 본 화면과 저장한 구장만 열려요.";
  const onlineText = "<b>다시 연결됐어요</b>";
  const paintNet = (): void => {
    setNetBanner(!navigator.onLine, navigator.onLine ? onlineText : offlineText);
  };
  paintNet();
  window.addEventListener("offline", () => setNetBanner(true, offlineText));
  window.addEventListener("online", () => {
    setNetBanner(true, onlineText);
    window.setTimeout(() => setNetBanner(false), 2600);
  });

  if (!("serviceWorker" in navigator)) return;
  // 등록은 https(또는 localhost)에서만 의미가 있다 — 실패해도 사이트는 그대로 동작한다
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!reloading) return;
    location.reload();
  });

  const offerUpdate = (worker: ServiceWorker): void => {
    // 첫 설치에는 배너를 띄우지 않는다(이미 새 셸로 열린 화면이다)
    if (!navigator.serviceWorker.controller) return;
    setUpdateBanner(true);
    const button = byId<HTMLButtonElement>("update-reload");
    if (!button || button.dataset.wired === "1") return;
    button.dataset.wired = "1";
    button.addEventListener("click", () => {
      reloading = true;
      button.disabled = true;
      worker.postMessage({ type: "SKIP_WAITING" });
      // 워커가 응답하지 않는 경우(구형 브라우저)를 대비해 곧바로 새로고침한다
      window.setTimeout(() => {
        if (reloading) location.reload();
      }, 1500);
    });
  };

  navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .then((reg) => {
      if (reg.waiting) offerUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed") offerUpdate(worker);
        });
      });
      window.setInterval(() => void reg.update().catch(() => undefined), UPDATE_INTERVAL_MS);
    })
    .catch((err: unknown) => {
      console.warn("service worker 등록 실패", err);
    });

  navigator.serviceWorker.ready
    .then((reg) => prefetchSaved(reg.active, dataBase, savedIds))
    .catch(() => undefined);
}

/** 내 구장(즐겨찾기)의 상세 JSON 을 미리 캐시에 넣는다 — 오프라인에서도 열리게 */
function prefetchSaved(worker: ServiceWorker | null, dataBase: string, ids: string[]): void {
  if (!worker || !ids.length) return;
  try {
    const urls = ids.slice(0, 20).map((id) => new URL(`${dataBase}courses/${id}.json`, location.href).href);
    worker.postMessage({ type: "CACHE_URLS", urls });
  } catch {
    // URL 을 만들 수 없는 환경 — 미리 캐시하지 않는다
  }
}
