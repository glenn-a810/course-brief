/**
 * 검색 레이어 — SearchAdapter 인터페이스로 교체 가능.
 *
 * LocalSearchAdapter : 정적 JSON을 브라우저에서 검색(0원, Cloudflare Pages 그대로 배포)
 * EsSearchAdapter    : Elasticsearch(nori 한글 분석기) 백엔드에 위임
 *
 * 반환 계약: Promise<Array<{ id: string, score: number }>>
 *  - score 내림차순 정렬, id는 data/v29/index.json 의 course id
 *  - 어댑터는 필터를 모른다(필터는 app 쪽에서 적용). ES 어댑터는 필터를 함께 보낼 수 있으나
 *    동일 결과가 나오도록 id 집합만 돌려준다.
 */
import { chosung, isChosungQuery, normalize } from "./util.js";

export class SearchAdapter {
  /** @param {{courses: Array, clusters?: Array}} _ctx */
  async init(_ctx) {}
  /** @param {string} _query @param {{limit?: number}} _opts */
  async search(_query, _opts = {}) { return []; }
  get label() { return "base"; }
}

export class LocalSearchAdapter extends SearchAdapter {
  constructor() {
    super();
    this.docs = [];
    this.ready = false;
  }

  get label() { return "정적 검색"; }

  async init({ courses }) {
    this.docs = courses.map((c) => {
      const names = [c.name, ...(c.aliases || [])].filter(Boolean);
      return {
        id: c.id,
        status: c.status,
        nNames: names.map(normalize),
        cNames: names.map((n) => chosung(n).toLowerCase()),
        nSido: normalize(c.sido || ""),
        nSigungu: normalize(c.sigungu || ""),
        nType: normalize(c.type || ""),
        nId: normalize(c.id),
      };
    });
    this.ready = true;
  }

  _scoreToken(doc, token, choOnly) {
    let best = 0;
    for (const n of doc.nNames) {
      if (n === token) best = Math.max(best, 1000);
      else if (n.startsWith(token)) best = Math.max(best, 700);
      else if (n.includes(token)) best = Math.max(best, 500);
    }
    if (best >= 500) return best;
    if (choOnly || token.length >= 1) {
      for (const c of doc.cNames) {
        if (c === token) best = Math.max(best, 420);
        else if (c.startsWith(token)) best = Math.max(best, 320);
        else if (c.includes(token)) best = Math.max(best, 240);
      }
    }
    if (best) return best;
    if (doc.nSigungu && doc.nSigungu.includes(token)) best = Math.max(best, 200);
    if (doc.nSido && doc.nSido.includes(token)) best = Math.max(best, 120);
    if (doc.nType && doc.nType.includes(token)) best = Math.max(best, 80);
    if (doc.nId.includes(token)) best = Math.max(best, 60);
    return best;
  }

  async search(query, { limit = 0 } = {}) {
    const raw = String(query || "").trim();
    if (!raw) return null; // null = 검색어 없음(전체)
    const tokens = normalize(raw).split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;
    const choOnly = isChosungQuery(raw);

    const out = [];
    for (const doc of this.docs) {
      let total = 0;
      let ok = true;
      for (const t of tokens) {
        const s = this._scoreToken(doc, t, choOnly);
        if (!s) { ok = false; break; }
        total += s;
      }
      if (!ok) continue;
      if (doc.status === "operating") total += 10; // 동일 점수에서 영업중 우선
      out.push({ id: doc.id, score: total });
    }
    out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return limit ? out.slice(0, limit) : out;
  }
}

/**
 * ES 어댑터. Cloudflare Worker/Pages Function 프록시(`/api/search`)나
 * 직접 접근 가능한 ES 엔드포인트에 질의한다.
 * 요청: POST { query, limit }  → 응답: { hits: [{ id, score }] } (또는 ES 원본 응답)
 */
export class EsSearchAdapter extends SearchAdapter {
  constructor({ endpoint, apiKey = "", timeoutMs = 2500 } = {}) {
    super();
    this.endpoint = endpoint || "";
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.fallback = null;
  }

  get label() { return "Elasticsearch"; }

  async init(ctx) {
    // 정적 검색은 항상 준비해 두고, ES 실패 시 즉시 대체한다.
    this.fallback = new LocalSearchAdapter();
    await this.fallback.init(ctx);
    return this;
  }

  async _post(body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.apiKey ? { authorization: `ApiKey ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`ES ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async search(query, { limit = 0 } = {}) {
    const q = String(query || "").trim();
    if (!q) return null;
    try {
      const body = this.endpoint.includes("_search")
        ? this._dsl(q, limit || 20)   // ES 주소 직결(테스트용)
        : { query: q, limit: limit || 100 }; // 프록시(/api/search) 규약
      const json = await this._post(body);
      if (Array.isArray(json?.hits)) {
        return json.hits.map((h) => (typeof h === "string" ? { id: h, score: 1 } : { id: h.id, score: h.score ?? 1 }));
      }
      if (json?.hits?.hits) {
        return json.hits.hits.map((h) => ({ id: h._source?.id || h._id, score: h._score ?? 1 }));
      }
      throw new Error("unexpected response");
    } catch (err) {
      console.warn("[search] ES 질의 실패, 정적 검색으로 대체:", err.message);
      const fallback = await this.fallback.search(q, { limit });
      this.lastFallback = true;
      return fallback;
    }
  }

  /** ES 주소로 직접 보낼 때의 질의 DSL (nori + 초성 필드) */
  _dsl(q, size) {
    const isChosung = /^[\u3131-\u314e]+$/.test(q.replace(/\s/g, ""));
    const should = [
      { term: { "name.lower": { value: q, boost: 12 } } },
      { match_phrase: { name: { query: q, boost: 8 } } },
      { multi_match: { query: q, fields: ["name^4", "aliases^2", "sigungu^1.5", "sido^1.2", "address"], type: "best_fields" } },
    ];
    if (isChosung) {
      should.push({ term: { name_chosung: { value: q, boost: 6 } } });
      should.push({ prefix: { name_chosung: { value: q, boost: 4 } } });
    }
    return { size, _source: ["id"], query: { bool: { should, minimum_should_match: 1 } } };
  }
}

/** 설정에 따라 어댑터 선택 */
export async function createSearchAdapter(config, ctx) {
  let adapter;
  if (config?.search?.mode === "es" && config.search.endpoint) {
    adapter = new EsSearchAdapter({ endpoint: config.search.endpoint, apiKey: config.search.apiKey });
  } else {
    adapter = new LocalSearchAdapter();
  }
  await adapter.init(ctx);
  return adapter;
}
