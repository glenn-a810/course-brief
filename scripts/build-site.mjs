#!/usr/bin/env node
/**
 * 정적 사이트 빌드 — web/ 의 TypeScript 를 esbuild 로 번들해 dist/ 를 만든다.
 * 데이터는 손대지 않고 data/v29 를 그대로 복사한다.
 *
 * Cloudflare Pages: build command `npm run build`, output directory `dist`, root `/`
 * (`npm run build` 가 먼저 `npm run typecheck` 를 통과해야 한다)
 *
 * 3단계에서 더하는 산출물
 *  - `dist/c/{id}/index.html` : 구장별 프리렌더 HTML(검색·SNS 크롤러용 메타 + 정적 요약, M7)
 *  - `dist/sitemap.xml`       : 540곳 경로(M7)
 *  - `dist/data/v29/qa.json`  : 관리자 QA 대시보드용 구장별 충실도·신선도·파싱 여부(M6)
 *  - `dist/sw.js`             : 오프라인 셸(M8, 캐시 이름에 빌드 버전)
 *
 * 프리렌더는 index.html 한 장을 복제해 <head> 메타·본문 미리보기만 바꾼다. 그래서
 * 클라이언트 렌더와 같은 셸·같은 데이터 포맷을 쓰고, 방문자는 정적 요약을 먼저 본 뒤
 * SPA(#/c/{id})로 이어진다 — 두 화면의 내용이 어긋날 여지가 없다.
 */
import { cp, mkdir, readFile, rename, rm, stat, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const dataDir = path.join(root, "data/v29");
const BASE_URL = "https://coursebrief.pages.dev";

const REQUIRED = [
  "data/v29/index.json",
  "data/v29/clusters.json",
  "data/v29/sido.json",
  "data/v29/rental_providers.json",
  "data/v29/schema.md",
  "data/v29/alerts.json",
  "data/v29/booking_rules.json",
];

const AREAS = ["basic", "course", "fee", "ops", "facility", "briefing", "rental"];

function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function won(n) {
  return typeof n === "number" && Number.isFinite(n) ? `${Math.round(n).toLocaleString("ko-KR")}원` : "";
}

function ymd(iso) {
  const s = String(iso ?? "");
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
}

async function assertData() {
  const missing = REQUIRED.filter((p) => !existsSync(path.join(root, p)));
  if (missing.length) {
    console.error("데이터 파일이 없습니다:", missing.join(", "));
    console.error("먼저 `npm run data:build` 로 data/v29 를 생성하세요.");
    process.exit(1);
  }
  const idx = JSON.parse(await readFile(path.join(root, "data/v29/index.json"), "utf8"));
  const dir = path.join(root, "data/v29/courses");
  if (!existsSync(dir)) {
    console.error("data/v29/courses 가 없습니다.");
    process.exit(1);
  }
  return { idx };
}

/** web/ 에서 정적 자산만 복사한다(TypeScript 소스는 번들로만 나간다) */
async function copyWeb() {
  await cp(path.join(root, "web"), dist, {
    recursive: true,
    filter: (src) => !src.endsWith(".ts") && !src.endsWith(".map"),
  });
}

/** web/assets/app.ts → dist/assets/app.js (ES 모듈 번들) */
async function bundleWeb() {
  const result = await build({
    entryPoints: [path.join(root, "web/assets/app.ts")],
    outfile: path.join(dist, "assets/app.js"),
    bundle: true,
    format: "esm",
    target: ["es2020"],
    platform: "browser",
    charset: "utf8",
    legalComments: "none",
    logLevel: "warning",
    metafile: true,
  });
  const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
  return bytes;
}

/**
 * 정적 자산 파일명에 내용 해시를 붙인다(F-14).
 * HTML 은 no-cache 로 매번 확인하고, 해시가 붙은 자산만 1년 immutable 로 캐시하므로
 * 새 배포 뒤에 옛 번들이 남아 데이터와 UI 가 어긋나는 일이 없다.
 */
async function hashAssets() {
  const assets = path.join(dist, "assets");
  const out = { js: "", css: "" };
  const renameWithHash = async (file, ext) => {
    const filePath = path.join(assets, file);
    const hash = createHash("sha256").update(await readFile(filePath)).digest("hex").slice(0, 10);
    const name = `${path.basename(file, ext)}.${hash}${ext}`;
    await rename(filePath, path.join(assets, name));
    return name;
  };
  out.js = await renameWithHash("app.js", ".js");
  out.css = await renameWithHash("style.css", ".css");
  const htmlPath = path.join(dist, "index.html");
  let html = await readFile(htmlPath, "utf8");
  html = html.replace('href="assets/style.css"', `href="assets/${out.css}"`);
  html = html.replace('src="assets/app.js"', `src="assets/${out.js}"`);
  await writeFile(htmlPath, html);
  return out;
}

/* ------------------------------------------------------------------ */
/* 데이터 읽기 (프리렌더·QA 가 함께 쓴다)                              */
/* ------------------------------------------------------------------ */

async function loadDetails(courses) {
  const out = new Map();
  const CHUNK = 60;
  for (let i = 0; i < courses.length; i += CHUNK) {
    const slice = courses.slice(i, i + CHUNK);
    const loaded = await Promise.all(
      slice.map(async (c) => {
        try {
          const raw = await readFile(path.join(dataDir, "courses", `${c.id}.json`), "utf8");
          return [c.id, JSON.parse(raw)];
        } catch {
          return [c.id, null];
        }
      }),
    );
    for (const [id, detail] of loaded) out.set(id, detail);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* M6 — 관리자 QA 인덱스                                              */
/* ------------------------------------------------------------------ */

function qaRow(item, detail, rule) {
  const cov = detail?.coverage ?? {};
  // 공지 신선도 — '가장 최근 공지'가 90일을 넘으면 그 구장의 공지 영역은 낡은 것이다
  const noticeDates = (detail?.briefing?.notices?.items ?? [])
    .map((n) => String(n?.date ?? "").replace(/\./g, "-").match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "")
    .filter(Boolean)
    .sort();
  const noticeLatest = noticeDates.length ? noticeDates[noticeDates.length - 1] : null;
  const covOut = {};
  let sum = 0;
  let n = 0;
  for (const area of AREAS) {
    const v = cov[area];
    if (typeof v === "number") {
      covOut[area] = Math.round(v * 1000) / 1000;
      sum += v;
      n += 1;
    }
  }
  return {
    id: item.id,
    name: item.name,
    sido: item.sido ?? "",
    sigungu: item.sigungu ?? "",
    cov: covOut,
    avg: n ? Math.round((sum / n) * 1000) / 1000 : null,
    detail: Boolean(item.detail),
    fee_as_of: detail?.fee?.as_of ?? detail?.fee?.checked_at ?? item.green_fee?.as_of ?? null,
    notice_at: detail?.briefing?.collected_at ?? null,
    notice_latest: noticeLatest,
    parking: Boolean(detail?.facilities?.parking?.value),
    transit: Boolean(detail?.facilities?.shuttle?.value),
    has_rules: Boolean(rule),
    cancel_ok: Boolean(rule?.cancel?.free && Object.keys(rule.cancel.free).length),
    open_ok: Boolean(rule?.open?.rules?.length || rule?.open?.monthly?.length),
  };
}

async function writeQaIndex(idx, details, builtAt) {
  const rulesRaw = JSON.parse(await readFile(path.join(dataDir, "booking_rules.json"), "utf8"));
  const rules = rulesRaw.rules ?? {};
  const rows = idx.courses.map((c) => qaRow(c, details.get(c.id), rules[c.id] ?? null));
  const file = {
    dataset: { built_at: builtAt, count: rows.length },
    areas: AREAS,
    rows,
  };
  await writeFile(path.join(dist, "data/v29/qa.json"), JSON.stringify(file));
  return rows;
}

/* ------------------------------------------------------------------ */
/* M7 — 프리렌더 · sitemap · JSON-LD                                  */
/* ------------------------------------------------------------------ */

function metaFor(item, detail) {
  const region = [item.sido, item.sigungu].filter(Boolean).join(" ");
  const holes = item.holes ? `${item.holes}홀` : "";
  const type = item.type && item.type !== "미확인" ? item.type : "";
  const fee = item.green_fee ?? {};
  const weekday = won(fee.weekday);
  const weekend = won(fee.weekend);
  const feeLine = [weekday && `주중 ${weekday}`, weekend && `주말·공휴일 ${weekend}`].filter(Boolean).join(" · ");
  const title = `${item.name}${region ? ` (${region})` : ""} 그린피·예약 규칙 — CourseBrief`;
  const desc = [
    [region, holes, type].filter(Boolean).join(" "),
    feeLine || "그린피 확인 중",
    "코스 스펙·취소 규정·현장 운영·부대시설·최근 공지를 한 화면에.",
  ]
    .filter(Boolean)
    .join(". ")
    .slice(0, 175);
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "GolfCourse",
    name: item.name,
    url: `${BASE_URL}/c/${item.id}/`,
    image: `${BASE_URL}/og/${item.id}.png`,
    description: desc,
    ...(detail?.master?.address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: detail.master.address,
            addressLocality: item.sigungu || undefined,
            addressRegion: item.sido || undefined,
            addressCountry: "KR",
          },
        }
      : {}),
    ...(item.lat != null && item.lng != null
      ? { geo: { "@type": "GeoCoordinates", latitude: item.lat, longitude: item.lng } }
      : {}),
    ...(item.tel ? { telephone: String(item.tel) } : {}),
    ...(item.holes ? { numberOfHoles: item.holes } : {}),
  };
  return { title, desc, jsonld };
}

function prerenderBody(item, detail) {
  const region = [item.sido, item.sigungu].filter(Boolean).join(" ");
  const m = detail?.master ?? {};
  const fee = item.green_fee ?? {};
  const cheapest = [fee.weekday, fee.weekend].filter((v) => typeof v === "number");
  const low = cheapest.length ? Math.min(...cheapest) : null;
  const lowLabel = typeof fee.weekend === "number" && low === fee.weekend ? "주말" : "주중";
  const rows = [];
  if (m.address) rows.push(["주소", escHtml(m.address)]);
  if (m.nearest_ic?.name) {
    rows.push(["최단 IC", `${escHtml(m.nearest_ic.name)}${m.nearest_ic.distance_km ? ` · ${m.nearest_ic.distance_km}km` : ""}`]);
  }
  if (item.tel) rows.push(["대표전화", escHtml(item.tel)]);
  if (item.homepage) {
    rows.push(["홈페이지", `<a class="link" href="${escHtml(item.homepage)}" rel="noopener noreferrer">${escHtml(item.homepage.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>`]);
  }
  return `<div class="detail">
    <div class="detail-crumbs"><span class="crumb-loc">${escHtml(region)}</span></div>
    <section class="detail-hero" aria-labelledby="detail-title">
      <div class="detail-hero-main">
        <h1 class="detail-title" id="detail-title">${escHtml(item.name)}</h1>
        <p class="detail-meta"><span>${escHtml([region, item.holes ? `${item.holes}홀` : "", item.type && item.type !== "미확인" ? item.type : ""].filter(Boolean).join(" · "))}</span></p>
        <dl class="hero-kpis">
          ${item.holes ? `<div class="kpi"><dt>홀수</dt><dd><b>${item.holes}</b><span>홀</span></dd></div>` : ""}
          ${item.par ? `<div class="kpi"><dt>파</dt><dd><b>${item.par}</b></dd></div>` : ""}
          ${item.length ? `<div class="kpi"><dt>전장</dt><dd><b>${item.length.toLocaleString("ko-KR")}</b><span>m</span></dd></div>` : ""}
        </dl>
      </div>
      <aside class="fee-hero" aria-label="그린피 요약">
        <p class="fee-hero-title">그린피 <span>1인 · 18홀 · 비회원</span></p>
        ${low != null
          ? `<p class="fee-hero-value"><span class="fee-hero-from">${lowLabel} 최저</span>${won(low)}</p>`
          : `<p class="fee-hero-none">요금 안내 준비 중 · 전화 문의</p>`}
      </aside>
    </section>
    ${rows.length ? `<dl class="facts">${rows.map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>` : ""}
    <section class="section">
      <div class="section-body">
        <p class="section-desc">요금·예약 규칙, 코스 스펙, 위치·교통, 현장 운영, 부대시설, 최근 공지, 클럽 렌탈은 아래에서 이어집니다.</p>
        <p class="source-line"><a class="link" href="/#/c/${escHtml(item.id)}">CourseBrief에서 전체 정보 보기</a></p>
      </div>
    </section>
  </div>`;
}

async function writePrerender(idx, details) {
  const shell = await readFile(path.join(dist, "index.html"), "utf8");
  let written = 0;
  for (const item of idx.courses) {
    const detail = details.get(item.id) ?? null;
    const { title, desc, jsonld } = metaFor(item, detail);
    const url = `${BASE_URL}/c/${item.id}/`;
    let html = shell;

    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escHtml(title)}</title>`);
    html = html.replace(
      /<meta name="description" content="[^"]*">/,
      `<meta name="description" content="${escHtml(desc)}">`,
    );
    html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escHtml(title)}">`);
    html = html.replace(
      /<meta property="og:description" content="[^"]*">/,
      `<meta property="og:description" content="${escHtml(desc)}">`,
    );
    html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
    html = html.replace(
      /<meta property="og:image" content="[^"]*">/,
      `<meta property="og:image" content="${BASE_URL}/og/${item.id}.png">`,
    );
    html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
    // 구조화 데이터 — 검색엔진이 가격 없이도 '어느 지역 몇 홀 골프장'인지 읽는다
    html = html.replace(
      "</head>",
      `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>\n</head>`,
    );
    // 루트 기준 상대 경로 — 하위 경로(/c/{id}/)에서도 자산·데이터가 같은 곳을 가리키게
    html = html.replace("<head>", "<head>\n<base href=\"/\">");
    // 목록 셸은 숨기고 정적 요약을 먼저 보여 준다(JS 실패 시에도 내용이 남는다)
    html = html.replace('<div id="view-list">', '<div id="view-list" hidden>');
    html = html.replace('<div id="view-detail" hidden></div>', `<div id="view-detail">${prerenderBody(item, detail)}</div>`);
    // SPA 는 해시 라우터다 — 방문 URL 을 그대로 두고 해시만 맞춰 주면 같은 화면이 이어진다
    html = html.replace(
      '<script type="module"',
      `<script>try{history.replaceState(null,"","/#/c/${item.id}");}catch(e){}</script>\n<script type="module"`,
    );

    const dir = path.join(dist, "c", item.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), html);
    written += 1;
  }
  return written;
}

async function writeSitemap(idx, details) {
  const fallback = ymd(idx.dataset.built_at) || new Date().toISOString().slice(0, 10);
  const urls = [
    `<url><loc>${BASE_URL}/</loc><lastmod>${fallback}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
  ];
  for (const c of idx.courses) {
    const d = details.get(c.id);
    const lastmod =
      ymd(d?.fee?.as_of) || ymd(d?.briefing?.collected_at) || ymd(c.green_fee?.as_of) || fallback;
    urls.push(
      `<url><loc>${BASE_URL}/c/${c.id}/</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
    );
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  await writeFile(path.join(dist, "sitemap.xml"), xml);
  return urls.length;
}

/* ------------------------------------------------------------------ */
/* M8 — 오프라인 셸                                                   */
/* ------------------------------------------------------------------ */

async function writeServiceWorker(hashed, idx, builtAt) {
  // 캐시 이름에 쓰는 버전 — 날짜 + 번들 해시 앞자리(영숫자만)
  const hashOf = (file) => (file.match(/[0-9a-f]{10}/) ?? [""])[0];
  const version = `${(ymd(builtAt) || "0").replace(/-/g, "")}-${hashOf(hashed.js).slice(0, 8)}${hashOf(hashed.css).slice(0, 4)}`;
  const precache = [
    "/",
    "/index.html",
    "/manifest.webmanifest",
    `/assets/${hashed.js}`,
    `/assets/${hashed.css}`,
    "/data/v29/index.json",
  ];
  const js = `/* CourseBrief Service Worker — build ${version}
 * 앱 셸·index.json·최근 본 구장 JSON 을 캐시한다(M8).
 * 캐시 이름에 빌드 버전이 들어가므로 새 배포는 항상 새 캐시를 쓰고, 옛 캐시는 activate 에서 지운다.
 * 자동 skipWaiting 은 하지 않는다 — 열려 있는 탭의 입력을 지우지 않도록 '새로고침' 배너를 쓴다.
 */
const VERSION = ${JSON.stringify(version)};
const SHELL_CACHE = "cb-shell-" + VERSION;
const DATA_CACHE = "cb-data-" + VERSION;
const PRECACHE = ${JSON.stringify(precache, null, 2)};
const COURSE_LIMIT = 40;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, DATA_CACHE]);
    for (const key of await caches.keys()) {
      if (!keep.has(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "CACHE_URLS" && Array.isArray(data.urls)) {
    event.waitUntil(caches.open(DATA_CACHE).then((cache) => Promise.all(
      data.urls.slice(0, 40).map((url) => cache.add(url).catch(() => undefined)),
    )));
  }
});

async function trimCourseCache() {
  const cache = await caches.open(DATA_CACHE);
  const keys = (await cache.keys()).filter((req) => req.url.includes("/courses/"));
  if (keys.length <= COURSE_LIMIT) return;
  for (const req of keys.slice(0, keys.length - COURSE_LIMIT)) await cache.delete(req);
}

/** 오래된 값을 보여 주지 않도록 데이터는 stale-while-revalidate(캐시 즉시 + 백그라운드 갱신) */
async function dataResponse(request, event) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) {
        cache.put(request, res.clone()).then(trimCourseCache).catch(() => undefined);
      }
      return res;
    })
    .catch(() => null);
  event.waitUntil(network.then(() => undefined));
  if (cached) return cached;
  const fresh = await network;
  return fresh || new Response(JSON.stringify({ error: "offline" }), {
    status: 503,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 폰트 CDN 등은 브라우저에 맡긴다

  // 1) 화면 이동 — 네트워크 우선, 실패하면 캐시된 같은 화면 → 앱 셸
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(request);
        if (res && res.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, res.clone()).catch(() => undefined);
        }
        return res;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        const same = await cache.match(request);
        if (same) return same;
        const shell = (await cache.match("/index.html")) || (await cache.match("/"));
        if (shell) return shell;
        return new Response("오프라인 상태입니다. 연결 후 다시 열어 주세요.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })());
    return;
  }

  // 2) 해시가 붙은 자산·아이콘·OG 이미지 — 내용이 바뀌지 않으므로 캐시 우선
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/og/")) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res && res.ok) cache.put(request, res.clone()).catch(() => undefined);
      return res;
    })());
    return;
  }

  // 3) 데이터 JSON — 오래된 값 고정을 막기 위해 백그라운드 갱신
  if (url.pathname.startsWith("/data/v29/")) {
    event.respondWith(dataResponse(request, event));
    return;
  }

  // 4) manifest·sitemap 등 나머지 — 네트워크 우선, 실패하면 캐시
  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch {
      const cache = await caches.open(SHELL_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      throw new Error("offline");
    }
  })());
});
`;
  await writeFile(path.join(dist, "sw.js"), js);
  return version;
}

/* ------------------------------------------------------------------ */
/* L4 — 공개 API (/api/v1) · 임베드 (/embed)                           */
/* ------------------------------------------------------------------ */

/**
 * 공개 API — 정적 JSON 이므로 서버가 없다. 장점: 무료·무제한·항상 같은 응답.
 *  - `/api/v1/courses.json`      : 540곳 경량 목록(인덱스 레코드 + slope)
 *  - `/api/v1/courses/{id}.json` : 구장 1곳의 경량 레코드 + 상세·페이지 링크
 * 상세 12키 JSON 은 이미 `/data/v29/courses/{id}.json` 에 있으므로 복제하지 않고 링크로 가리킨다
 * (6.5MB 를 두 벌 두면 어느 한쪽이 낡을 위험이 생긴다).
 */
async function writeApi(idx, builtAt) {
  const apiDir = path.join(dist, "api/v1");
  await mkdir(path.join(apiDir, "courses"), { recursive: true });
  const dataset = {
    name: "CourseBrief 공개 데이터 API",
    schema: "coursebrief/api-1",
    version: idx.dataset.source_version ?? null,
    built_at: builtAt,
    data_built_at: idx.dataset.built_at ?? null,
    counts: idx.dataset.counts ?? {},
    license: "문체부 공공데이터(이용허락범위 제한 없음) + 골프장 공개 자료. 재배포 시 출처 표기",
    docs: `${BASE_URL.replace(/\/$/, "")}/api/v1/courses.json`,
    notes: [
      "green_fee 는 1인 18홀 비회원 기준. basis=market 은 공시가가 아닌 관측 최저가입니다.",
      "값이 없는 항목은 null 또는 필드 없음입니다. 0 이 아닙니다.",
      "상세 12키는 links.detail 에서 받으세요.",
    ],
  };
  const list = {
    dataset: { ...dataset, count: idx.courses.length, fields_url: `${BASE_URL}/data/v29/schema.md` },
    courses: idx.courses.map((c) => ({ ...c, links: apiLinks(c.id) })),
  };
  await writeFile(path.join(apiDir, "courses.json"), JSON.stringify(list));

  for (const c of idx.courses) {
    const one = {
      dataset: { schema: dataset.schema, version: dataset.version, built_at: builtAt },
      course: { ...c, links: apiLinks(c.id) },
    };
    await writeFile(path.join(apiDir, "courses", `${c.id}.json`), JSON.stringify(one));
  }
  return { list: idx.courses.length, single: idx.courses.length };
}

function apiLinks(id) {
  return {
    self: `${BASE_URL}/api/v1/courses/${id}.json`,
    detail: `${BASE_URL}/data/v29/courses/${id}.json`,
    page: `${BASE_URL}/c/${id}/`,
    embed: `${BASE_URL}/embed/${id}/`,
  };
}

const TAG_TEXT = { n: "노캐디", "2": "2인 가능", y: "야간", s: "사우나", l: "숙박", h: "셔틀", p: "연습장", f: "식당" };
const STATUS_TEXT = {
  operating: "영업중", suspended: "휴업", closed: "폐업",
  under_construction: "건설중", planned: "미착공", cancelled: "사업 취소",
};

/**
 * 임베드 카드 — iframe 이 실제로 거는 문서.
 * 앱 셸(index.html)을 쓰지 않는다: 12KB 도 안 되는 카드 하나 때문에 앱 번들을 받을 이유가 없고,
 * 루트는 X-Frame-Options 로 프레임이 막혀 있다(아래 _headers 에서 /embed/* 만 열어 둔다).
 */
function embedDoc(item) {
  const fee = item.green_fee ?? {};
  const weekend = typeof fee.weekend === "number";
  const value = weekend ? fee.weekend : fee.weekday;
  const feeLabel = weekend ? "주말" : "주중";
  const region = [item.sido, item.sigungu].filter(Boolean).join(" ");
  const meta = [region, item.holes ? `${item.holes}홀` : "", item.type && item.type !== "미확인" ? item.type : ""]
    .filter(Boolean).join(" · ");
  const tags = String(item.tags ?? "").split("").filter((t) => TAG_TEXT[t]).slice(0, 3)
    .map((t) => `<span class="tag">${escHtml(TAG_TEXT[t])}</span>`).join("");
  const slope = typeof item.slope?.value === "number" ? `<span class="tag">슬로프 ${item.slope.value}</span>` : "";
  const status = STATUS_TEXT[item.status] ?? "";
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escHtml(item.name)} — CourseBrief</title>
<style>
:root{--bg:#fff;--surface:#fff;--line:#e8ecef;--text:#191f28;--text-2:#4e5968;--text-3:#8b95a1;--accent:#3182f6;--ok:#12805c}
@media (prefers-color-scheme:dark){:root{--bg:#17171c;--surface:#1f1f26;--line:#2c2c35;--text:#f2f4f6;--text-2:#b0b8c1;--text-3:#7b8590;--accent:#4c9aff;--ok:#3ccf91}}
*{box-sizing:border-box}
body{margin:0;padding:8px;background:transparent;color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif}
a.card{display:grid;gap:8px;padding:16px 16px 14px;border-radius:16px;background:var(--surface);
  border:1px solid var(--line);color:var(--text);text-decoration:none;min-width:0}
a.card:hover{border-color:var(--accent)}
.head{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
.name{font-size:17px;font-weight:700;letter-spacing:-.01em;line-height:1.3;min-width:0;overflow-wrap:anywhere}
.badge{flex:none;font-size:11px;font-weight:700;color:var(--ok);background:color-mix(in srgb,var(--ok) 12%,transparent);padding:3px 8px;border-radius:999px;white-space:nowrap}
.sub{font-size:13px;color:var(--text-2);overflow-wrap:anywhere}
.fee{display:flex;align-items:baseline;gap:6px}
.fee small{font-size:12px;color:var(--text-3)}
.fee b{font-size:21px;font-weight:700;letter-spacing:-.02em}
.fee i{font-size:13px;color:var(--text-3);font-style:normal}
.fee .none{font-size:13px;color:var(--text-3)}
.tags{display:flex;flex-wrap:wrap;gap:6px}
.tag{font-size:11.5px;color:var(--text-2);background:var(--bg);border:1px solid var(--line);padding:2px 7px;border-radius:999px}
.foot{display:flex;align-items:center;justify-content:space-between;margin-top:2px;padding-top:10px;
  border-top:1px solid var(--line);font-size:12px;color:var(--text-3)}
.foot b{color:var(--accent);font-weight:700;letter-spacing:-.01em}
</style>
</head>
<body>
<a class="card" href="${BASE_URL}/c/${item.id}/" target="_blank" rel="noopener noreferrer">
  <span class="head"><strong class="name">${escHtml(item.name)}</strong>${status ? `<span class="badge">${escHtml(status)}</span>` : ""}</span>
  <span class="sub">${escHtml(meta)}</span>
  <span class="fee">${typeof value === "number"
    ? `<small>${feeLabel}</small><b>${value.toLocaleString("ko-KR")}원</b><i>~</i>`
    : `<span class="none">요금 미확인</span>`}</span>
  <span class="tags">${tags}${slope}</span>
  <span class="foot"><b>CourseBrief</b>전체 정보 보기 →</span>
</a>
</body>
</html>
`;
}

async function writeEmbeds(idx) {
  let written = 0;
  for (const item of idx.courses) {
    const dir = path.join(dist, "embed", item.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), embedDoc(item));
    written += 1;
  }
  return written;
}

/* ------------------------------------------------------------------ */

async function main() {
  const t0 = Date.now();
  const { idx } = await assertData();

  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  // 1) 웹 정적 자산 (index.html, assets/style.css, manifest, og, icons)
  await copyWeb();
  // 2) 웹 TypeScript 번들 → 내용 해시가 붙은 파일명으로 교체
  const bundleBytes = await bundleWeb();
  const hashed = await hashAssets();
  // 3) 데이터
  await cp(dataDir, path.join(dist, "data/v29"), { recursive: true });

  const builtAt = new Date().toISOString();
  const details = await loadDetails(idx.courses);

  // 4) 관리자 QA 인덱스
  const qaRows = await writeQaIndex(idx, details, builtAt);
  // 5) 프리렌더·sitemap
  const prerendered = await writePrerender(idx, details);
  const sitemapUrls = await writeSitemap(idx, details);
  // 5-1) L4 — 공개 API·임베드 카드
  const api = await writeApi(idx, builtAt);
  const embeds = await writeEmbeds(idx);
  // 6) 오프라인 셸
  const swVersion = await writeServiceWorker(hashed, idx, builtAt);

  // 7) 정적 호스팅 설정
  await writeFile(
    path.join(dist, "_headers"),
    [
      "/*",
      "  X-Content-Type-Options: nosniff",
      "  Referrer-Policy: strict-origin-when-cross-origin",
      "  X-Frame-Options: SAMEORIGIN",
      "",
      "/",
      "  Cache-Control: no-cache",
      "",
      "/index.html",
      "  Cache-Control: no-cache",
      "",
      "/c/*",
      "  Cache-Control: public, max-age=3600",
      "",
      "/sw.js",
      "  Cache-Control: no-cache",
      "  Service-Worker-Allowed: /",
      "",
      "/manifest.webmanifest",
      "  Content-Type: application/manifest+json; charset=utf-8",
      "  Cache-Control: public, max-age=3600",
      "",
      "/data/v29/index.json",
      "  Cache-Control: public, max-age=300",
      "",
      "/data/v29/qa.json",
      "  Cache-Control: private, no-store",
      "",
      "/data/v29/courses/*",
      "  Cache-Control: public, max-age=86400",
      "",
      // L4 — 공개 API: 어디서든 fetch 할 수 있게 CORS 허용. 데이터라 5분 캐시.
      "/api/v1/*",
      "  Access-Control-Allow-Origin: *",
      "  Access-Control-Allow-Methods: GET, HEAD, OPTIONS",
      "  Content-Type: application/json; charset=utf-8",
      "  Cache-Control: public, max-age=300",
      "",
      // L4 — 임베드 카드: 남의 사이트에 끼울 수 있어야 하므로 이 경로만 프레임을 열고,
      // 검색 색인은 막는다(중복 페이지). X-Frame-Options 는 위 /* 규칙에서 상속되므로 ! 로 지운다.
      "/embed/*",
      "  ! X-Frame-Options",
      "  Content-Security-Policy: frame-ancestors *",
      "  X-Robots-Tag: noindex",
      "  Cache-Control: public, max-age=3600",
      "",
      "/sitemap.xml",
      "  Content-Type: application/xml; charset=utf-8",
      "",
      "/assets/*",
      "  Cache-Control: public, max-age=31536000, immutable",
      "",
      "/og/*",
      "  Cache-Control: public, max-age=604800",
      "",
      "/icons/*",
      "  Cache-Control: public, max-age=604800",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(dist, "robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`,
  );

  // 8) 산출물 확인
  const assets = ["index.html", `assets/${hashed.js}`, `assets/${hashed.css}`, "sw.js", "sitemap.xml", "manifest.webmanifest",
    "api/v1/courses.json", `api/v1/courses/${idx.courses[0].id}.json`, `embed/${idx.courses[0].id}/index.html`];
  for (const a of assets) {
    if (!existsSync(path.join(dist, a))) {
      console.error(`빌드 실패: ${a} 없음`);
      process.exit(1);
    }
  }
  const strayTs = (await readdir(path.join(dist, "assets"))).filter((f) => f.endsWith(".ts"));
  if (strayTs.length) {
    console.error(`빌드 실패: dist/assets 에 TypeScript 소스가 남았습니다 — ${strayTs.join(", ")}`);
    process.exit(1);
  }
  const courseFiles = (await readdir(path.join(dist, "data/v29/courses"))).filter((f) => f.endsWith(".json"));
  const indexSize = (await stat(path.join(dist, "data/v29/index.json"))).size;
  const total = await du(dist);
  const ogCount = existsSync(path.join(dist, "og")) ? (await readdir(path.join(dist, "og"))).length : 0;

  console.log("빌드 완료 → dist/");
  console.log(`  골프장 ${idx.courses.length}곳 · 구장 JSON ${courseFiles.length}개 · 클러스터 ${idx.clusters?.length ?? 0}개`);
  console.log(`  ${hashed.js} ${(bundleBytes / 1024).toFixed(1)}KB · ${hashed.css} · index.json ${(indexSize / 1024).toFixed(1)}KB`);
  console.log(`  프리렌더 ${prerendered}장 · sitemap ${sitemapUrls} URL · QA ${qaRows.length}행 · OG ${ogCount}장 · sw ${swVersion}`);
  console.log(`  API ${api.list + api.single}파일 · 임베드 ${embeds}장`);
  console.log(`  dist 전체 ${(total / 1024 / 1024).toFixed(1)}MB · ${((Date.now() - t0) / 1000).toFixed(2)}s`);
}

async function du(dir) {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? await du(p) : (await stat(p)).size;
  }
  return total;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
