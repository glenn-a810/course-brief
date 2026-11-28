#!/usr/bin/env node
/**
 * 빌드 산출물 검증 (의존성 0). CI·배포 전 게이트로 사용.
 *   npm run build && npm run verify
 */
import { readFile, readdir, stat, access } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const errors = [];
const notes = [];
const ok = (cond, msg) => { if (!cond) errors.push(msg); else notes.push(msg); };
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const listFiles = async (dir) => {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p)));
    else out.push(p);
  }
  return out;
};

// 0) TypeScript 소스 구조 (웹·Functions 모두 .ts)
const tsconfig = JSON.parse(await readFile(path.join(root, "tsconfig.json"), "utf8"));
ok(tsconfig.compilerOptions?.strict === true, "tsconfig strict: true");
ok(tsconfig.compilerOptions?.noImplicitAny === true, "tsconfig noImplicitAny: true");
ok(tsconfig.compilerOptions?.skipLibCheck === true, "tsconfig skipLibCheck: true");
ok(await exists(path.join(root, "shared/types/index.ts")), "shared/types/index.ts 존재");

for (const f of ["web/assets/app.ts", "web/assets/search.ts", "web/assets/util.ts", "web/assets/theme.ts",
                 "web/assets/admin.ts",
                 "functions/api/search.ts", "functions/tsconfig.json", "package-lock.json"]) {
  ok(await exists(path.join(root, f)), `${f} 존재`);
}
ok(!(await exists(path.join(root, "functions/api/search.js"))), "functions/api/search.js 없음 (TS 전환 완료)");

const webSources = await listFiles(path.join(root, "web"));
const webJs = webSources.filter((f) => f.endsWith(".js")).map((f) => path.relative(root, f));
ok(webJs.length === 0, `web/ 에 .js 소스 없음${webJs.length ? " — " + webJs.slice(0, 5).join(", ") : ""}`);

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
ok(Boolean(pkg.devDependencies?.typescript), "devDependencies.typescript");
ok(Boolean(pkg.devDependencies?.esbuild), "devDependencies.esbuild");
ok(typeof pkg.scripts?.typecheck === "string", "scripts.typecheck");
ok(typeof pkg.scripts?.build === "string" && pkg.scripts.build.includes("typecheck"), "scripts.build = typecheck 후 빌드");

// 1) 정적 자산 — JS·CSS 는 내용 해시가 붙은 파일명이어야 한다(F-14 캐시 버스팅)
for (const f of ["index.html", "robots.txt", "_headers",
                 "data/v29/index.json", "data/v29/schema.md",
                 "data/v29/clusters.json", "data/v29/sido.json", "data/v29/rental_providers.json",
                 "data/v29/alerts.json", "data/v29/booking_rules.json"]) {
  ok(await exists(path.join(dist, f)), `dist/${f} 존재`);
}
const assetFiles = await readdir(path.join(dist, "assets"));
const hashedJs = assetFiles.filter((f) => /^app\.[0-9a-f]{10}\.js$/.test(f));
const hashedCss = assetFiles.filter((f) => /^style\.[0-9a-f]{10}\.css$/.test(f));
ok(hashedJs.length === 1, `dist/assets 해시 번들 ${hashedJs.join(", ") || "없음"}`);
ok(hashedCss.length === 1, `dist/assets 해시 스타일 ${hashedCss.join(", ") || "없음"}`);
ok(!assetFiles.includes("app.js") && !assetFiles.includes("style.css"), "해시 없는 app.js·style.css 없음");

// 1-1) 웹 번들 (TypeScript → esbuild)
const bundlePath = path.join(dist, "assets", hashedJs[0] ?? "app.js");
const bundle = (await exists(bundlePath)) ? await readFile(bundlePath, "utf8") : "";
ok(bundle.length > 20 * 1024, `dist/assets/app.js 번들 ${(bundle.length / 1024).toFixed(1)}KB`);
ok(bundle.includes("LocalSearchAdapter") && bundle.includes("EsSearchAdapter"), "app.js 에 검색 어댑터 포함");
ok(!/\/workspace\/|memory\/clones|99239e1f|ehyunmin|glenn\.nullanswer|@glenn/.test(bundle), "app.js 에 내부 경로·개인정보 없음");
const distAssets = await readdir(path.join(dist, "assets"));
ok(!distAssets.some((f) => f.endsWith(".ts")), "dist/assets 에 .ts 없음");

// 1-2) 테마 전환 (라이트/다크) — 첫 페인트 전 초기화 · 토글 · 팔레트 중복 여부
const html = await readFile(path.join(dist, "index.html"), "utf8");
ok(hashedJs.length === 1 && html.includes(`assets/${hashedJs[0]}`), "index.html 이 해시 번들을 참조");
ok(hashedCss.length === 1 && html.includes(`assets/${hashedCss[0]}`), "index.html 이 해시 스타일을 참조");
ok(html.includes('id="theme-toggle"'), "index.html 테마 전환 버튼");
ok(html.includes('localStorage.getItem("coursebrief-theme")'), "index.html 테마 초기화 스크립트");
ok(
  html.indexOf('localStorage.getItem("coursebrief-theme")') < html.indexOf('rel="stylesheet"'),
  "테마 초기화가 스타일시트보다 먼저 실행(첫 페인트 전 적용)",
);
ok(bundle.includes("coursebrief-theme"), "app.js 에 테마 전환 로직 포함");
const headers = await readFile(path.join(dist, "_headers"), "utf8");
const csp = headers.match(/Content-Security-Policy:[^\n]*/i)?.[0] ?? "";
ok(
  !csp || /'unsafe-inline'/.test(csp) || /script-src[^;]*'sha256-/.test(csp),
  csp ? `CSP 가 인라인 테마 초기화 스크립트를 허용 — ${csp.trim().slice(0, 72)}` : "_headers 에 CSP 없음 — 인라인 테마 초기화 스크립트 허용",
);

/* 1-3) 관리자 모드 — 출처는 관리자에게만. 진입은 비밀번호 입력이고 평문은 산출물에 없다 */
ok(html.includes('id="admin-password"') && html.includes('type="password"'), "index.html 관리자 비밀번호 입력 필드");
ok(html.includes('id="admin-open"') && html.includes('id="admin-badge"'), "index.html 관리자 진입 버튼·배지");
ok(bundle.includes("coursebrief-admin"), "app.js 에 관리자 상태 저장 키");
ok(/[0-9a-f]{64}/.test(bundle), "app.js 에 SHA-256 해시 상수(64hex)");
ok(/subtle\.digest\(\s*"SHA-256"/.test(bundle), "app.js 에서 Web Crypto SHA-256 비교");
ok(!bundle.includes("admin=1"), "URL 파라미터(?admin=1) 진입 제거");
const webSourceText = (await Promise.all(
  (await listFiles(path.join(root, "web")))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".html"))
    .map((f) => readFile(f, "utf8")),
)).join("\n");
ok(!/A810Labs/.test(bundle) && !/A810Labs/.test(webSourceText), "관리자 비밀번호 평문이 소스·산출물에 없음");

const css = await readFile(path.join(dist, "assets", hashedCss[0] ?? "style.css"), "utf8");
ok(/:root\[data-theme="light"\]\s*\{/.test(css) && /:root\[data-theme="dark"\]\s*\{/.test(css), "style.css data-theme 변수 블록");
ok(
  !/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{/.test(css),
  '시스템 다크 블록이 수동 라이트 선택을 덮지 않음(:not([data-theme="light"]))',
);
// 시스템 다크 블록과 수동 다크 블록의 팔레트 값이 같아야 한다(한쪽만 고쳐 생기는 불일치 방지)
const darkPalettes = [...css.matchAll(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}|:root\[data-theme="dark"\]\s*\{([^}]*)\}/g)]
  .map((m) => m[1] ?? m[2] ?? "")
  .filter((body) => body.includes("--bg:"))
  .map((body) => body.split(";").map((d) => d.replace(/\s+/g, " ").trim()).filter(Boolean).sort().join(";"));
ok(
  darkPalettes.length === 2 && darkPalettes[0] === darkPalettes[1],
  `다크 팔레트 두 블록(시스템·수동) 값 일치 (${darkPalettes.length}개 블록)`,
);

// 2) 인덱스
const index = JSON.parse(await readFile(path.join(dist, "data/v29/index.json"), "utf8"));
const courses = index.courses || [];
ok(courses.length === 540, `index courses = ${courses.length} (540 기대)`);
ok(index.dataset?.counts?.total === courses.length, "dataset.counts.total == courses.length");
ok(new Set(courses.map((c) => c.id)).size === courses.length, "course id 중복 없음");

const statusCount = courses.reduce((a, c) => ((a[c.status] = (a[c.status] || 0) + 1), a), {});
for (const [k, v] of Object.entries({ operating: 512, suspended: 1, closed: 2, under_construction: 5, planned: 19, cancelled: 1 })) {
  ok(statusCount[k] === v, `status ${k} = ${statusCount[k]} (${v} 기대)`);
}

const indexSize = (await stat(path.join(dist, "data/v29/index.json"))).size;
ok(indexSize <= 300 * 1024, `index.json ${(indexSize / 1024).toFixed(1)}KB ≤ 300KB`);

// 3) 구장 파일
const dir = path.join(dist, "data/v29/courses");
const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
ok(files.length === 540, `courses/*.json = ${files.length}개`);
const KEYS = ["course_id", "meta", "master", "course", "fee", "cancel", "ops", "facilities", "rental", "briefing", "collection", "coverage"];
let keyIssues = 0;
for (const f of files) {
  const obj = JSON.parse(await readFile(path.join(dir, f), "utf8"));
  if (KEYS.some((k) => !(k in obj)) || obj.course_id + ".json" !== f) keyIssues++;
}
ok(keyIssues === 0, `12키 구조·파일명 일치 (문제 ${keyIssues}건)`);

// 4) 금지 문자열 (개인정보·내부 경로)
const banned = /[가-힣]{2,4}\s*님\s*비서|memory\/clones|99239e1f|\/workspace\/|@glenn|ehyunmin|glenn\.nullanswer/;
let leaked = [];
for (const f of files) {
  const txt = await readFile(path.join(dir, f), "utf8");
  if (banned.test(txt)) leaked.push(f);
}
for (const p of ["data/v29/index.json", "data/v29/clusters.json", "data/source/golf_courses_all_v29.json"]) {
  const fp = path.join(dist, p);
  if (await exists(fp)) {
    const txt = await readFile(fp, "utf8");
    if (banned.test(txt)) leaked.push(p);
  }
}
ok(leaked.length === 0, `개인정보·내부경로 문자열 없음${leaked.length ? " — " + leaked.slice(0, 5).join(", ") : ""}`);

// 4-1) 예약 규칙 파싱·휴장 캘린더 데이터
const alerts = JSON.parse(await readFile(path.join(dist, "data/v29/alerts.json"), "utf8"));
ok(alerts.items?.length > 0, `alerts.json ${alerts.items?.length}건`);
ok(alerts.items.every((i) => i.id && typeof i.id === "string"), "alerts 항목에 구장 id");
const rules = JSON.parse(await readFile(path.join(dist, "data/v29/booking_rules.json"), "utf8"));
const ruleCount = Object.keys(rules.rules ?? {}).length;
ok(ruleCount > 300, `booking_rules.json ${ruleCount}곳`);
const parsedCancel = Object.values(rules.rules ?? {}).filter((r) => r.cancel?.free && Object.keys(r.cancel.free).length).length;
const parsedOpen = Object.values(rules.rules ?? {}).filter((r) => r.open?.rules?.length || r.open?.monthly?.length).length;
ok(parsedCancel > 250, `취소 마감 파싱 ${parsedCancel}곳`);
ok(parsedOpen > 250, `예약 오픈 파싱 ${parsedOpen}곳`);

// 5) 클러스터 (F020)
const clusters = JSON.parse(await readFile(path.join(dist, "data/v29/clusters.json"), "utf8")).clusters;
ok(clusters.length === 28, `clusters = ${clusters.length}개`);
const f020 = clusters.find((c) => c.id === "F020");
ok(!!f020 && f020.members.length === 2, "F020 = 익산컨트리클럽 + 상떼힐CC");
const ikexan = courses.filter((c) => c.cluster === "F020");
ok(ikexan.reduce((a, c) => a + (c.holes || 0), 0) === 24, `F020 합산 홀수 = ${ikexan.reduce((a, c) => a + (c.holes || 0), 0)} (24 기대)`);

// 6) 렌탈
const rental = JSON.parse(await readFile(path.join(dist, "data/v29/rental_providers.json"), "utf8"));
ok(rental.providers?.length === 8, `rental providers = ${rental.providers?.length} (8 기대)`);

// 8) 3단계 — 프리렌더·sitemap·OG·PWA·QA 대시보드
const robotsPath = path.join(dist, "robots.txt");
const robots = (await exists(robotsPath)) ? await readFile(robotsPath, "utf8") : "";
const sitemapPath = path.join(dist, "sitemap.xml");
ok(await exists(sitemapPath), "dist/sitemap.xml 존재");
const sitemap = (await exists(sitemapPath)) ? await readFile(sitemapPath, "utf8") : "";
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
ok(/^<\?xml/.test(sitemap.trim()), "sitemap.xml XML 선언");
ok(locs.length === 541, `sitemap URL ${locs.length}개 (홈 + 540곳 = 541 기대)`);
ok(locs.filter((u) => /\/c\/kr-golf-\d{4}\/$/.test(u)).length === 540, "sitemap 에 구장 540곳 경로");
ok(new Set(locs).size === locs.length, "sitemap URL 중복 없음");
ok(locs.every((u) => u.startsWith("https://coursebrief.pages.dev")), "sitemap 은 https 절대 URL");

const cDir = path.join(dist, "c");
const cDirs = (await exists(cDir)) ? (await readdir(cDir, { withFileTypes: true })).filter((e) => e.isDirectory()) : [];
ok(cDirs.length === 540, `프리렌더 디렉터리 ${cDirs.length}개 (540 기대)`);
const prerenderMissing = [];
for (const dir of cDirs) {
  if (!(await exists(path.join(cDir, dir.name, "index.html")))) prerenderMissing.push(dir.name);
}
ok(prerenderMissing.length === 0, `프리렌더 index.html 누락 없음${prerenderMissing.length ? " — " + prerenderMissing.slice(0, 3).join(", ") : ""}`);

// 대표 3곳(첫·중간·끝)을 실제로 열어 메타·JSON-LD·정적 본문을 본다
const spot = [courses[0], courses[Math.floor(courses.length / 2)], courses[courses.length - 1]];
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const c of spot) {
  const page = await readFile(path.join(cDir, c.id, "index.html"), "utf8");
  const tag = (re) => page.match(re)?.[1] ?? "";
  const ogTitle = tag(/<meta property="og:title" content="([^"]*)">/);
  const ogImage = tag(/<meta property="og:image" content="([^"]*)">/);
  const canonical = tag(/<link rel="canonical" href="([^"]*)">/);
  ok(ogTitle.includes(c.name.replace(/&/g, "&amp;")), `${c.id} og:title 에 구장명`);
  ok(new RegExp(`<title>[^<]*${escRe(c.name)}`).test(page), `${c.id} <title> 에 구장명`);
  ok(ogImage === `https://coursebrief.pages.dev/og/${c.id}.png`, `${c.id} og:image 가 구장별 이미지`);
  ok(canonical === `https://coursebrief.pages.dev/c/${c.id}/`, `${c.id} canonical = 프리렌더 경로`);
  ok(page.includes('<base href="/">'), `${c.id} 루트 기준 <base>`);
  ok(page.includes(`history.replaceState(null,"","/#/c/${c.id}")`), `${c.id} SPA 해시 연결`);
  const ld = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? "";
  let ldOk = false;
  try {
    const parsed = JSON.parse(ld);
    ldOk = parsed["@type"] === "GolfCourse" && parsed.name === c.name && /^https:\/\//.test(parsed.url);
  } catch {
    ldOk = false;
  }
  ok(ldOk, `${c.id} JSON-LD GolfCourse`);
  ok(page.includes(c.name.replace(/&/g, "&amp;")), `${c.id} 정적 본문에 구장명`);
}
ok(!cDirs.some((d) => d.name.includes("undefined")), "프리렌더 파일명에 undefined 없음");

// OG 이미지·아이콘
const ogDir = path.join(dist, "og");
const ogFiles = (await exists(ogDir)) ? await readdir(ogDir) : [];
ok(ogFiles.length === 541, `OG 이미지 ${ogFiles.length}장 (cover + 540 기대)`);
ok(ogFiles.includes("cover.png"), "OG 기본 이미지 cover.png");
for (const f of ["cover.png", `${courses[0].id}.png`]) {
  const p = path.join(ogDir, f);
  if (await exists(p)) {
    const size = (await stat(p)).size;
    const buf = await readFile(p);
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    ok(isPng && w === 1200 && h === 630 && size < 300 * 1024, `og/${f} 1200×630 PNG ${(size / 1024).toFixed(0)}KB`);
  } else {
    errors.push(`og/${f} 없음`);
  }
}
const iconFiles = await readdir(path.join(dist, "icons"));
for (const f of ["icon-192.png", "icon-512.png", "maskable-512.png", "apple-touch-icon.png"]) {
  ok(iconFiles.includes(f), `icons/${f} 존재`);
}

// manifest
const manifestPath = path.join(dist, "manifest.webmanifest");
ok(await exists(manifestPath), "dist/manifest.webmanifest 존재");
let manifest = {};
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
  manifest = {};
}
ok(manifest.name?.includes("CourseBrief"), "manifest name");
ok(manifest.short_name === "코스브리프", "manifest short_name");
ok(manifest.theme_color === "#3182f6" && manifest.background_color === "#f2f4f6", "manifest 테마·배경색(#3182f6·#f2f4f6)");
ok(manifest.display === "standalone" && manifest.start_url === "/", "manifest standalone · start_url /");
ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3, "manifest 아이콘 3종");
ok((manifest.icons ?? []).some((i) => i.purpose === "maskable"), "manifest maskable 아이콘");

// service worker
const swPath = path.join(dist, "sw.js");
ok(await exists(swPath), "dist/sw.js 존재");
const sw = (await exists(swPath)) ? await readFile(swPath, "utf8") : "";
ok(/const VERSION = "\d{8}-[0-9a-f]+"/.test(sw), "sw.js 캐시 버전(날짜+해시)");
ok(sw.includes(`/assets/${hashedJs[0]}`) && sw.includes(`/assets/${hashedCss[0]}`), "sw.js 가 해시 번들·스타일 프리캐시");
ok(sw.includes('"/data/v29/index.json"'), "sw.js 가 index.json 프리캐시");
ok(sw.includes("SKIP_WAITING") && sw.includes("caches.delete"), "sw.js 업데이트·옛 캐시 정리 경로");
ok(sw.includes("dataResponse"), "sw.js 데이터 캐시 전략(백그라운드 갱신)");

// HTML·번들 연결
ok(html.includes('rel="manifest" href="manifest.webmanifest"'), "index.html manifest 링크");
ok(html.includes('id="net-banner"') && html.includes('id="update-banner"'), "index.html 오프라인·업데이트 배너");
ok(html.includes("apple-touch-icon"), "index.html apple-touch-icon");
ok(html.includes('href="#/report"'), "index.html 제보 링크");
ok(html.includes('href="#/admin-qa"'), "index.html 관리자 QA 링크");
ok(robots.includes("Sitemap:"), "robots.txt 에 sitemap");
ok(/\/sw\.js[\s\S]*?Cache-Control: no-cache/.test(headers), "_headers: sw.js no-cache");
ok(headers.includes("/c/*"), "_headers: 프리렌더 /c/* 캐시 규칙");
ok(headers.includes("application/manifest+json"), "_headers: manifest Content-Type");
ok(bundle.includes("serviceWorker") && bundle.includes("SKIP_WAITING"), "app.js 에 SW 등록·업데이트 처리");
ok(bundle.includes("위치 · 교통") || bundle.includes("위치·교통"), "app.js 에 위치·교통 영역");
ok(bundle.includes("admin-qa") && bundle.includes("qa.json"), "app.js 에 QA 대시보드 경로");
ok(bundle.includes("issues/new?title="), "app.js 에 GitHub 이슈 제보 연결");

// QA 인덱스
const qaPath = path.join(dist, "data/v29/qa.json");
ok(await exists(qaPath), "dist/data/v29/qa.json 존재");
if (await exists(qaPath)) {
  const qa = JSON.parse(await readFile(qaPath, "utf8"));
  ok(qa.rows?.length === 540, `qa.json ${qa.rows?.length}행 (540 기대)`);
  const ids = new Set(qa.rows.map((r) => r.id));
  ok(ids.size === 540 && courses.every((c) => ids.has(c.id)), "qa.json 구장 id = index id");
  ok(qa.rows.every((r) => r.cov && Object.keys(r.cov).length === 7), "qa.json 모든 행에 7개 영역 채움률");
  ok(qa.rows.every((r) => typeof r.avg === "number" && r.avg >= 0 && r.avg <= 1), "qa.json 평균 충실도 0~1");
  ok(qa.rows.filter((r) => !r.detail).length === 25, `qa.json 요약-만 구장 ${qa.rows.filter((r) => !r.detail).length}곳 (25 기대)`);
  const qaSize = (await stat(qaPath)).size;
  ok(qaSize < 300 * 1024, `qa.json ${(qaSize / 1024).toFixed(1)}KB < 300KB`);
}

// 9) ES 산출물
const bulk = path.join(root, "elasticsearch", "bulk.ndjson");
if (await exists(bulk)) {
  const lines = (await readFile(bulk, "utf8")).trim().split("\n");
  ok(lines.length === 540 * 2, `bulk.ndjson = ${lines.length} lines (1080 기대)`);
  JSON.parse(await readFile(path.join(root, "elasticsearch", "mapping.json"), "utf8"));
  ok(true, "mapping.json 파싱");
} else {
  errors.push("elasticsearch/bulk.ndjson 없음 (npm run es:bulk)");
}

// 8) 결과
console.log(notes.map((n) => `  ✓ ${n}`).join("\n"));
if (errors.length) {
  console.error("\n검증 실패:\n" + errors.map((e) => `  ✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log(`\n검증 통과 — ${notes.length}개 항목`);
