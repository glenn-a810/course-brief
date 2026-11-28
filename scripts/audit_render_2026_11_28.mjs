/**
 * CourseBrief — 540곳 상세 화면 전수 렌더 검사 (2026-11-28 잔여 정리 검증용).
 *
 * 확인 항목
 *   1) 타일 라벨 == 값 (`연습장 → 연습장`)
 *   2) 값이 라벨로 시작하는 근접 중복
 *   3) 플레이스홀더(`문구 확인`, `official`) 노출
 *   4) 출처·확인일 메타(YYYY-MM-DD 기준, 채널 브랜드명) 노출
 *
 * 실행: Playwright(Chromium) 가 있는 환경에서
 *   node scripts/audit_render_2026_11_28.mjs
 * (`npm run build` 로 dist/ 를 먼저 만든 뒤)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("../dist", import.meta.url).pathname;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = path.join(ROOT, url === "/" ? "index.html" : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4199, r));

const ids = fs.readdirSync(path.join(ROOT, "data/v29/courses")).map((f) => f.replace(/\.json$/, ""));
const browser = await chromium.launch({ args: ["--no-sandbox"] });

const PLACEHOLDER = /문구 확인|원문 근거|플레이스홀더|official|undefined|null/;
const META = /\d{4}-\d{2}-\d{2}\s*(?:확인|기준)|티픽|카카오골프예약|스마트스코어|그린피가이드/;
const DIFF = /출처|수집|확인일|비서|검수/;

const dupTiles = [];      // 라벨 == 값
const nearDupTiles = [];  // 값이 라벨로 시작(예: 프로샵 / 프로샵 운영)
const placeholders = [];
const metas = [];
let empty = 0;

for (let i = 0; i < ids.length; i += 40) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR" });
  const p = await ctx.newPage();
  for (const id of ids.slice(i, i + 40)) {
    await p.goto(`http://127.0.0.1:4199/#/c/${id}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await p.waitForFunction(() => (document.querySelector("#s1")?.innerText || "").length > 0, null, { timeout: 8000 }).catch(() => {});
    const r = await p.evaluate(() => {
      const norm = (s) => (s || "").replace(/[\s·]/g, "");
      const tiles = Array.from(document.querySelectorAll(".tile")).map((t) => [
        t.querySelector(".tile-label")?.textContent ?? "",
        t.querySelector(".tile-value")?.textContent ?? "",
      ]);
      const text = document.body.innerText;
      const sec4 = document.querySelector("#s4")?.innerText ?? "";
      const sec3 = document.querySelector("#s3")?.innerText ?? "";
      return { tiles, text, sec3, sec4 };
    });
    for (const [label, value] of r.tiles) {
      if (!label || !value) continue;
      const n = (s) => s.replace(/[\s·]/g, "");
      if (n(String(label)) === n(String(value))) dupTiles.push([id, label, value]);
      else if (n(String(value)).startsWith(n(String(label)))) nearDupTiles.push([id, label, value]);
    }
    if (PLACEHOLDER.test(r.text)) placeholders.push([id, (r.text.match(PLACEHOLDER) || [""])[0]]);
    if (META.test(r.text) || DIFF.test(r.sec3 + r.sec4)) metas.push([id, (r.text.match(META) || [""])[0]]);
    if ((r.sec3 + r.sec4).length < 40) empty += 1;
  }
  await ctx.close();
}

console.log(JSON.stringify({
  courses: ids.length,
  dupTiles: dupTiles.length, dupSample: dupTiles.slice(0, 10),
  nearDupTiles: nearDupTiles.length, nearDupSample: nearDupTiles.slice(0, 15),
  placeholders: placeholders.length, placeholderSample: placeholders.slice(0, 10),
  metas: metas.length, metaSample: metas.slice(0, 10),
  thinSections: empty,
}, null, 1));
await browser.close();
server.close();
