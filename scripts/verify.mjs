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

// 1) 정적 자산
for (const f of ["index.html", "robots.txt", "_headers", "assets/app.js", "assets/search.js",
                 "assets/util.js", "assets/style.css", "data/v29/index.json", "data/v29/schema.md",
                 "data/v29/clusters.json", "data/v29/sido.json", "data/v29/rental_providers.json"]) {
  ok(await exists(path.join(dist, f)), `dist/${f} 존재`);
}

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
const banned = /심이슬|memory\/clones|99239e1f|\/workspace\/|@glenn|ehyunmin|glenn\.nullanswer/;
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
