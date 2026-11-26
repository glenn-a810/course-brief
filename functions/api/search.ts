/**
 * Cloudflare Pages Function — Elasticsearch 검색 프록시 (선택 기능)
 *
 * 브라우저가 ES 자격 증명을 갖지 않도록 서버에서만 ES 를 호출한다.
 * Pages 프로젝트 설정에서 환경 변수만 넣으면 `/api/search` 로 동작한다.
 *
 *   ES_URL      예) https://abc123.ap-northeast-2.aws.elastic-cloud.com
 *   ES_API_KEY  Elasticsearch API 키 (권장: read-only, 해당 인덱스만)
 *   ES_INDEX    기본 coursebrief-v29
 *
 * 호출: POST /api/search  { "query": "익산", "limit": 20 }
 * 응답: { "hits": [ { "id": "kr-golf-0498", "score": 42.1 } ] }
 *
 * 주의: 이 파일은 Cloudflare Pages Functions 규약(onRequestPost)을 따릅니다.
 *       설정하지 않으면 사이트는 정적 검색(LocalSearchAdapter)만 사용합니다.
 */
import type { PagesFunction, SearchEnv } from "../../shared/types";

interface SearchPayload {
  query: string;
  limit: number;
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `{ query, limit }` 를 형식에 맞게 읽는다(잘못된 타입은 기본값으로) */
function readPayload(raw: unknown): SearchPayload {
  const obj = isRecord(raw) ? raw : {};
  const qRaw = obj.query;
  const query = qRaw === undefined || qRaw === null ? "" : String(qRaw).trim().slice(0, 80);
  const limit = Math.min(Math.max(Number(obj.limit) || 20, 1), 100);
  return { query, limit };
}

function readHits(data: unknown): Array<{ id: string; score: number }> {
  if (!isRecord(data) || !isRecord(data.hits)) return [];
  const list = data.hits.hits;
  if (!Array.isArray(list)) return [];
  const out: Array<{ id: string; score: number }> = [];
  for (const hit of list) {
    if (!isRecord(hit)) continue;
    const source = isRecord(hit._source) ? hit._source : null;
    const id = source && typeof source.id === "string" ? source.id : hit._id;
    if (typeof id !== "string") continue;
    out.push({ id, score: typeof hit._score === "number" ? hit._score : 1 });
  }
  return out;
}

export const onRequestOptions: PagesFunction<SearchEnv> = async (): Promise<Response> => {
  return new Response(null, { status: 204, headers: CORS });
};

export const onRequestPost: PagesFunction<SearchEnv> = async ({ request, env }): Promise<Response> => {
  let payload: SearchPayload;
  try {
    const raw: unknown = await request.json();
    payload = readPayload(raw);
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const { query: q, limit } = payload;
  if (!q) return json({ hits: [] });

  if (!env.ES_URL) {
    return json({ error: "ES_URL not configured" }, 503);
  }

  const index = env.ES_INDEX || "coursebrief-v29";
  const url = `${String(env.ES_URL).replace(/\/+$/, "")}/${index}/_search`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.ES_API_KEY) headers.authorization = `ApiKey ${env.ES_API_KEY}`;

  const isChosung = /^[\u3131-\u314e]+$/.test(q.replace(/\s/g, ""));
  const should: unknown[] = [
    { term: { "name.lower": { value: q, boost: 12 } } },
    { match_phrase: { name: { query: q, boost: 8 } } },
    {
      multi_match: {
        query: q,
        fields: ["name^4", "aliases^2", "sigungu^1.5", "sido^1.2", "address"],
        type: "best_fields",
        minimum_should_match: "70%",
      },
    },
  ];
  if (isChosung) {
    should.push({ term: { name_chosung: { value: q, boost: 6 } } });
    should.push({ prefix: { name_chosung: { value: q, boost: 4 } } });
  }

  const body = {
    size: limit,
    _source: ["id"],
    query: { bool: { should, minimum_should_match: 1 } },
  };

  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const detail = await res.text();
      return json({ error: `elasticsearch ${res.status}`, detail: detail.slice(0, 300) }, 502);
    }
    const data: unknown = await res.json();
    const took = isRecord(data) && typeof data.took === "number" ? data.took : undefined;
    return json({ hits: readHits(data), took });
  } catch (err) {
    return json({ error: "elasticsearch unreachable", detail: String(err).slice(0, 200) }, 502);
  }
};
