/**
 * 검색 레이어 — `SearchAdapter` 계약으로 교체 가능.
 *
 * LocalSearchAdapter : 정적 JSON을 브라우저에서 검색(0원, Cloudflare Pages 그대로 배포)
 * EsSearchAdapter    : Elasticsearch(nori 한글 분석기) 백엔드에 위임
 *
 * 반환 계약은 `shared/types/search.ts` 참고: Promise<SearchResult[] | null> (null = 검색어 없음)
 */
import type {
  CourseStatus,
  SearchAdapter,
  SearchContext,
  SearchQuery,
  SearchResult,
  SiteConfig,
} from "../../shared/types";
import { chosung, isChosungQuery, normalize } from "./util.js";

interface SearchDoc {
  id: string;
  status: CourseStatus;
  nNames: string[];
  cNames: string[];
  nSido: string;
  nSigungu: string;
  nType: string;
  nId: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export class LocalSearchAdapter implements SearchAdapter {
  private docs: SearchDoc[] = [];

  get label(): string { return "정적 검색"; }

  async init({ courses }: SearchContext): Promise<void> {
    this.docs = courses.map((c) => {
      const names = [c.name, ...(c.aliases ?? [])].filter((n): n is string => Boolean(n));
      return {
        id: c.id,
        status: c.status,
        nNames: names.map((n) => normalize(n)),
        cNames: names.map((n) => chosung(n).toLowerCase()),
        nSido: normalize(c.sido ?? ""),
        nSigungu: normalize(c.sigungu ?? ""),
        nType: normalize(c.type ?? ""),
        nId: normalize(c.id),
      };
    });
  }

  private scoreToken(doc: SearchDoc, token: string, choOnly: boolean): number {
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

  async search({ text, limit = 0 }: SearchQuery): Promise<SearchResult[] | null> {
    const raw = String(text ?? "").trim();
    if (!raw) return null; // null = 검색어 없음(전체)
    const tokens = normalize(raw).split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;
    const choOnly = isChosungQuery(raw);

    const out: SearchResult[] = [];
    for (const doc of this.docs) {
      let total = 0;
      let ok = true;
      for (const t of tokens) {
        const s = this.scoreToken(doc, t, choOnly);
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

export interface EsSearchAdapterOptions {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
}

/**
 * ES 어댑터. Cloudflare Worker/Pages Function 프록시(`/api/search`)나
 * 직접 접근 가능한 ES 엔드포인트에 질의한다.
 * 요청: POST { query, limit }  → 응답: { hits: [{ id, score }] } (또는 ES 원본 응답)
 */
export class EsSearchAdapter implements SearchAdapter {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private fallback: LocalSearchAdapter | null = null;
  lastFallback = false;

  constructor({ endpoint, apiKey = "", timeoutMs = 2500 }: EsSearchAdapterOptions) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  get label(): string { return "Elasticsearch"; }

  async init(ctx: SearchContext): Promise<this> {
    // 정적 검색은 항상 준비해 두고, ES 실패 시 즉시 대체한다.
    this.fallback = new LocalSearchAdapter();
    await this.fallback.init(ctx);
    return this;
  }

  private async post(body: unknown): Promise<unknown> {
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
      return (await res.json()) as unknown;
    } finally {
      clearTimeout(timer);
    }
  }

  async search(query: SearchQuery): Promise<SearchResult[] | null> {
    const { text, limit = 0 } = query;
    const q = String(text ?? "").trim();
    if (!q) return null;
    try {
      const body: unknown = this.endpoint.includes("_search")
        ? this.dsl(q, limit || 20) // ES 주소 직결(테스트용)
        : { query: q, limit: limit || 100 }; // 프록시(/api/search) 규약
      const json = await this.post(body);
      const results = toResults(json);
      if (results) return results;
      throw new Error("unexpected response");
    } catch (err) {
      console.warn("[search] ES 질의 실패, 정적 검색으로 대체:", err instanceof Error ? err.message : String(err));
      const fallback = this.fallback;
      if (!fallback) return null;
      const results = await fallback.search({ text: q, limit });
      this.lastFallback = true;
      return results;
    }
  }

  /** ES 주소로 직접 보낼 때의 질의 DSL (nori + 초성 필드) */
  private dsl(q: string, size: number): unknown {
    const isChosung = /^[\u3131-\u314e]+$/.test(q.replace(/\s/g, ""));
    const should: unknown[] = [
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

/** `{hits:[{id,score}]}` 프록시 응답과 ES 원본 `{hits:{hits:[{_id,_source,_score}]}}` 를 모두 읽는다 */
function toResults(json: unknown): SearchResult[] | null {
  if (!isRecord(json)) return null;
  const hits = json.hits;
  if (Array.isArray(hits)) {
    const out: SearchResult[] = [];
    for (const h of hits) {
      if (typeof h === "string") out.push({ id: h, score: 1 });
      else if (isRecord(h) && typeof h.id === "string") {
        out.push({ id: h.id, score: typeof h.score === "number" ? h.score : 1 });
      }
    }
    return out;
  }
  if (isRecord(hits) && Array.isArray(hits.hits)) {
    const out: SearchResult[] = [];
    for (const h of hits.hits) {
      if (!isRecord(h)) continue;
      const source = isRecord(h._source) ? h._source : null;
      const id = source && typeof source.id === "string" ? source.id : h._id;
      if (typeof id !== "string") continue;
      out.push({ id, score: typeof h._score === "number" ? h._score : 1 });
    }
    return out;
  }
  return null;
}

/** 설정에 따라 어댑터 선택 */
export async function createSearchAdapter(config: SiteConfig, ctx: SearchContext): Promise<SearchAdapter> {
  const search = config.search;
  const adapter: SearchAdapter =
    search?.mode === "es" && search.endpoint
      ? new EsSearchAdapter({ endpoint: search.endpoint, apiKey: search.apiKey, timeoutMs: search.timeoutMs })
      : new LocalSearchAdapter();
  await adapter.init(ctx);
  return adapter;
}
