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

// 1) 정적 자산
for (const f of ["index.html", "robots.txt", "_headers", "assets/app.js", "assets/style.css",
                 "data/v29/index.json", "data/v29/schema.md",
                 "data/v29/clusters.json", "data/v29/sido.json", "data/v29/rental_providers.json"]) {
  ok(await exists(path.join(dist, f)), `dist/${f} 존재`);
}

// 1-1) 웹 번들 (TypeScript → esbuild)
const bundlePath = path.join(dist, "assets/app.js");
const bundle = (await exists(bundlePath)) ? await readFile(bundlePath, "utf8") : "";
ok(bundle.length > 20 * 1024, `dist/assets/app.js 번들 ${(bundle.length / 1024).toFixed(1)}KB`);
ok(bundle.includes("LocalSearchAdapter") && bundle.includes("EsSearchAdapter"), "app.js 에 검색 어댑터 포함");
ok(!/\/workspace\/|memory\/clones|99239e1f|ehyunmin|glenn\.nullanswer|@glenn/.test(bundle), "app.js 에 내부 경로·개인정보 없음");
const distAssets = await readdir(path.join(dist, "assets"));
ok(!distAssets.some((f) => f.endsWith(".ts")), "dist/assets 에 .ts 없음");

// 1-2) 테마 전환 (라이트/다크) — 첫 페인트 전 초기화 · 토글 · 팔레트 중복 여부
const html = await readFile(path.join(dist, "index.html"), "utf8");
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

const css = await readFile(path.join(dist, "assets/style.css"), "utf8");
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
for (const [k, v] of Object.entries({ operating: 512, suspended: 1, closed: 2, under_construction: 5, planned: 20 })) {
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

// 7) ES 산출물
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
