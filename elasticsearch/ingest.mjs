#!/usr/bin/env node
/**
 * data/v29/index.json → Elasticsearch bulk NDJSON 생성·적재.
 *
 *   node elasticsearch/ingest.mjs                # bulk.ndjson 생성만
 *   ES_URL=http://localhost:9200 node elasticsearch/ingest.mjs --push
 *   ES_URL=https://xxx.es.cloud:443 ES_API_KEY=... node elasticsearch/ingest.mjs --push
 *   ... --push --index coursebrief-v29 --recreate
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const INDEX = arg("--index") || process.env.ES_INDEX || "coursebrief-v29";
const URL_BASE = (process.env.ES_URL || "http://localhost:9200").replace(/\/+$/, "");
const API_KEY = process.env.ES_API_KEY || "";
const RECREATE = process.argv.includes("--recreate");
const PUSH = process.argv.includes("--push");

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const chosung = (s = "") =>
  [...String(s)].map((ch) => {
    const c = ch.codePointAt(0);
    return c >= 0xac00 && c <= 0xd7a3 ? CHO[Math.floor((c - 0xac00) / 588)] : ch;
  }).join("");

const index = JSON.parse(await readFile(path.join(root, "data/v29/index.json"), "utf8"));
const now = new Date().toISOString();

const docs = index.courses.map((c) => ({
  id: c.id,
  name: c.name,
  aliases: c.aliases || [],
  name_chosung: chosung(c.name),
  sido: c.sido || null,
  sido_code: c.sido_code || null,
  sigungu: c.sigungu || null,
  address: c.address || null,
  status: c.status,
  type: c.type || null,
  holes: c.holes ?? null,
  cluster: c.cluster || null,
  green_fee_weekday: c.green_fee?.weekday ?? null,
  green_fee_weekend: c.green_fee?.weekend ?? null,
  fee_basis: c.green_fee?.basis ?? null,
  location: c.lat != null && c.lng != null ? { lat: c.lat, lon: c.lng } : null,
  tel: c.tel || null,
  homepage: c.homepage || null,
  detail: !!c.detail,
  updated_at: index.dataset?.built_at || now,
}));

// strict 매핑이라 null 필드는 제거한다.
for (const d of docs) for (const k of Object.keys(d)) if (d[k] === null) delete d[k];

const lines = [];
for (const d of docs) {
  lines.push(JSON.stringify({ index: { _index: INDEX, _id: d.id } }));
  lines.push(JSON.stringify(d));
}
const ndjson = lines.join("\n") + "\n";
const out = path.join(root, "elasticsearch", "bulk.ndjson");
await writeFile(out, ndjson);
console.log(`bulk.ndjson 생성: ${docs.length} docs · ${(Buffer.byteLength(ndjson) / 1024).toFixed(1)}KB`);

if (!PUSH) {
  console.log("적재하려면 --push 와 ES_URL 을 지정하세요. (예: ES_URL=http://localhost:9200 node elasticsearch/ingest.mjs --push)");
  process.exit(0);
}

const headers = { "content-type": "application/json", ...(API_KEY ? { authorization: `ApiKey ${API_KEY}` } : {}) };
const req = async (method, url, body, contentType) => {
  const res = await fetch(url, {
    method,
    headers: contentType === "ndjson" ? { ...headers, "content-type": "application/x-ndjson" } : headers,
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}\n${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : {};
};

if (RECREATE) {
  await fetch(`${URL_BASE}/${INDEX}`, { method: "DELETE", headers }).catch(() => {});
  console.log(`기존 인덱스 삭제 시도: ${INDEX}`);
}

const exists = await fetch(`${URL_BASE}/${INDEX}`, { method: "HEAD", headers });
if (!exists.ok) {
  const mapping = JSON.parse(await readFile(path.join(root, "elasticsearch", "mapping.json"), "utf8"));
  await req("PUT", `${URL_BASE}/${INDEX}`, JSON.stringify(mapping));
  console.log(`인덱스 생성: ${INDEX} (nori 분석기)`);
}

const result = await req("POST", `${URL_BASE}/${INDEX}/_bulk?refresh=true`, ndjson, "ndjson");
if (result.errors) {
  const failed = (result.items || []).filter((i) => i.index?.error).slice(0, 3);
  console.error("일부 문서 적재 실패:", JSON.stringify(failed, null, 2));
  process.exit(1);
}
console.log(`적재 완료: ${result.items?.length ?? 0} docs → ${URL_BASE}/${INDEX}`);

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}
