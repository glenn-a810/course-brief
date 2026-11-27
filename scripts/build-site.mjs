#!/usr/bin/env node
/**
 * 정적 사이트 빌드 — web/ 의 TypeScript 를 esbuild 로 번들해 dist/ 를 만든다.
 * 데이터는 손대지 않고 data/v29 를 그대로 복사한다.
 *
 * Cloudflare Pages: build command `npm run build`, output directory `dist`, root `/`
 * (`npm run build` 가 먼저 `npm run typecheck` 를 통과해야 한다)
 */
import { cp, mkdir, readFile, rename, rm, stat, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");

const REQUIRED = [
  "data/v29/index.json",
  "data/v29/clusters.json",
  "data/v29/sido.json",
  "data/v29/rental_providers.json",
  "data/v29/schema.md",
];

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

async function main() {
  const t0 = Date.now();
  const { idx } = await assertData();

  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  // 1) 웹 정적 자산 (index.html, assets/style.css)
  await copyWeb();
  // 2) 웹 TypeScript 번들 → 내용 해시가 붙은 파일명으로 교체
  const bundleBytes = await bundleWeb();
  const hashed = await hashAssets();
  // 3) 데이터
  await cp(path.join(root, "data/v29"), path.join(dist, "data/v29"), { recursive: true });
  // 4) 정적 호스팅 설정
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
      "/data/v29/index.json",
      "  Cache-Control: public, max-age=300",
      "",
      "/data/v29/courses/*",
      "  Cache-Control: public, max-age=86400",
      "",
      "/assets/*",
      "  Cache-Control: public, max-age=31536000, immutable",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(dist, "robots.txt"),
    "User-agent: *\nAllow: /\n",
  );

  // 5) 산출물 확인
  const assets = ["index.html", `assets/${hashed.js}`, `assets/${hashed.css}`];
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

  console.log("빌드 완료 → dist/");
  console.log(`  골프장 ${idx.courses.length}곳 · 구장 JSON ${courseFiles.length}개 · 클러스터 ${idx.clusters?.length ?? 0}개`);
  console.log(`  ${hashed.js} ${(bundleBytes / 1024).toFixed(1)}KB (TypeScript 번들) · ${hashed.css} · index.json ${(indexSize / 1024).toFixed(1)}KB · dist 전체 ${(total / 1024 / 1024).toFixed(1)}MB`);
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(2)}s`);
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
