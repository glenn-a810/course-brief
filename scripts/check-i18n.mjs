#!/usr/bin/env node
/**
 * L1 사전 검사 — `web/assets/i18n.ts`
 *
 *  1) 모든 키가 `ko | en | ja` 세 값을 갖고 비어 있지 않은가
 *  2) 키가 중복되지 않는가
 *  3) 코드에서 `t("…")` 로 쓰는 키가 사전에 있는가 (오타로 한국어 키가 화면에 나오는 것을 막는다)
 *  4) 자리표시자(`{n}` 등)가 세 언어에서 같은가 (한 언어만 값이 빠지는 것을 막는다)
 *
 * 의존성 0. `npm run build` 앞에서 `npm run check:i18n` 으로 돈다.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const file = path.join(root, "web/assets/i18n.ts");
const src = await readFile(file, "utf8");

/* 1) DICT 블록만 잘라낸다 */
const start = src.indexOf("const DICT: Record<string, Tuple> = {");
const end = src.indexOf("\n};", start);
if (start < 0 || end < 0) {
  console.error("i18n.ts 에서 DICT 블록을 찾지 못했습니다.");
  process.exit(1);
}
const block = src.slice(start, end);

const entries = [];
const keyRe = /"([a-zA-Z0-9_.]+)":\s*\[/g;
let m;
while ((m = keyRe.exec(block)) !== null) {
  const key = m[1];
  // 배열 끝까지 읽는다(여러 줄 허용). 문자열 안의 ] 는 없으므로 첫 ] 가 끝이다.
  const open = block.indexOf("[", m.index);
  const close = block.indexOf("]", open);
  const body = block.slice(open + 1, close);
  const values = [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
  entries.push({ key, values });
}

const errors = [];
const seen = new Map();
for (const { key, values } of entries) {
  if (seen.has(key)) errors.push(`중복 키: ${key}`);
  seen.set(key, true);
  if (values.length !== 3) {
    errors.push(`${key}: 값 ${values.length}개 (ko·en·ja 3개 필요)`);
    continue;
  }
  if (values.some((v) => !v.trim())) errors.push(`${key}: 빈 번역이 있습니다`);
  const holders = values.map((v) => [...v.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(","));
  if (new Set(holders).size > 1) errors.push(`${key}: 자리표시자가 언어마다 다릅니다 (${holders.join(" | ")})`);
}

/* 3) 코드에서 쓰는 키 */
async function listSources(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listSources(p)));
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

const sources = await listSources(path.join(root, "web"));
const used = new Map();
for (const f of sources) {
  if (f.endsWith("i18n.ts")) continue;
  const text = await readFile(f, "utf8");
  for (const hit of text.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) {
    const rel = path.relative(root, f);
    const list = used.get(hit[1]) ?? [];
    list.push(rel);
    used.set(hit[1], list);
  }
}
for (const [key, files] of used) {
  if (!seen.has(key)) errors.push(`사전에 없는 키를 씁니다: ${key} (${[...new Set(files)].join(", ")})`);
}

/* 4) 쓰이지 않는 키 — 오류는 아니고 안내만 */
const unused = entries.map((e) => e.key).filter((k) => !used.has(k));

console.log(`i18n: 키 ${entries.length}개 · 코드에서 사용 ${used.size}개 · 미사용 ${unused.length}개`);
if (unused.length) console.log(`  미사용(안내): ${unused.join(", ")}`);
if (errors.length) {
  console.error(`\n사전 검사 실패 ${errors.length}건:\n` + errors.map((e) => `  ✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log("사전 검사 통과");
