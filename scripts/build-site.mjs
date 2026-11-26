#!/usr/bin/env node
/**
 * 정적 사이트 빌드 (의존성 0).
 * web/ + data/v29/ → dist/  (Cloudflare Pages: build command `npm run build`, output `dist`)
 */
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

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
  const courses = idx.courses?.length ?? 0;
  const dir = path.join(root, "data/v29/courses");
  if (!existsSync(dir)) {
    console.error("data/v29/courses 가 없습니다.");
    process.exit(1);
  }
  return { idx, courses };
}

async function main() {
  const t0 = Date.now();
  const { idx } = await assertData();

  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  // 1) 웹 자산
  await cp(path.join(root, "web"), dist, { recursive: true });
  // 2) 데이터
  await cp(path.join(root, "data/v29"), path.join(dist, "data/v29"), { recursive: true });
  // 3) 정적 호스팅 설정
  await writeFile(
    path.join(dist, "_headers"),
    [
      "/*",
      "  X-Content-Type-Options: nosniff",
      "  Referrer-Policy: strict-origin-when-cross-origin",
      "  X-Frame-Options: SAMEORIGIN",
      "",
      "/data/v29/index.json",
      "  Cache-Control: public, max-age=300",
      "",
      "/data/v29/courses/*",
      "  Cache-Control: public, max-age=86400",
      "",
      "/assets/*",
      "  Cache-Control: public, max-age=3600",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(dist, "robots.txt"),
    "User-agent: *\nAllow: /\n",
  );

  // 4) 검증 결과 요약
  const assets = ["index.html", "assets/app.js", "assets/search.js", "assets/util.js", "assets/style.css"];
  for (const a of assets) {
    if (!existsSync(path.join(dist, a))) {
      console.error(`빌드 실패: ${a} 없음`);
      process.exit(1);
    }
  }
  const courseFiles = (await import("node:fs")).readdirSync(path.join(dist, "data/v29/courses")).filter((f) => f.endsWith(".json"));
  const indexSize = (await stat(path.join(dist, "data/v29/index.json"))).size;
  const total = (await du(path.join(dist)));

  console.log("빌드 완료 → dist/");
  console.log(`  골프장 ${idx.courses.length}곳 · 구장 JSON ${courseFiles.length}개 · 클러스터 ${idx.clusters?.length ?? 0}개`);
  console.log(`  index.json ${(indexSize / 1024).toFixed(1)}KB · dist 전체 ${(total / 1024 / 1024).toFixed(1)}MB`);
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(2)}s`);
}

async function du(dir) {
  const { readdir } = await import("node:fs/promises");
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
