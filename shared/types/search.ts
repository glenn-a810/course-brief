/**
 * 검색 어댑터 계약 — 웹(정적 검색 / Elasticsearch 프록시)과 RN 앱이 같은 인터페이스를 쓴다.
 *
 * 반환 계약: `SearchResult[] | null`
 *  - `null` 은 "검색어 없음(전체)" 을 뜻한다.
 *  - 결과는 score 내림차순, id는 `data/v29/index.json` 의 course id.
 *  - 어댑터는 필터를 모른다(필터는 호출측에서 적용).
 */
import type { CourseIndexItem } from "./course";
import type { ClusterInfo } from "./cluster";

export interface SearchQuery {
  text: string;
  /** 0 또는 미지정 = 전체 */
  limit?: number;
}

export interface SearchResult {
  id: string;
  score: number;
}

export interface SearchContext {
  courses: readonly CourseIndexItem[];
  clusters?: readonly ClusterInfo[];
}

export interface SearchAdapter {
  /** 화면에 노출하는 검색 방식 이름 */
  readonly label: string;
  init(ctx: SearchContext): Promise<unknown>;
  search(query: SearchQuery): Promise<SearchResult[] | null>;
}

export type SearchMode = "local" | "es";

export interface SearchConfig {
  mode?: SearchMode;
  /** ES 프록시(`/api/search`) 또는 ES 주소 직결 */
  endpoint?: string;
  apiKey?: string;
  timeoutMs?: number;
}

/** `index.html` 앞에서 `window.COURSEBRIEF_CONFIG` 로 덮어쓸 수 있는 사이트 설정 */
export interface SiteConfig {
  dataBase?: string;
  pageSize?: number;
  repoUrl?: string;
  search?: SearchConfig;
}

/** ES 프록시(`/api/search`) 응답 */
export interface SearchBackendHit {
  id: string;
  score?: number;
}

export interface SearchBackendResponse {
  hits?: SearchBackendHit[];
  took?: number;
  error?: string;
  detail?: string;
}
