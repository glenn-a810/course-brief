/**
 * Cloudflare Pages Functions 최소 타입 정의.
 *
 * `@cloudflare/workers-types` 를 devDependency 로 끌어오지 않고, 이 리포지토리가 실제로 쓰는
 * 표면(요청·환경 변수·Response 반환)만 정확히 적는다. Pages Functions 의 파일 규약
 * (`onRequestGet` / `onRequestPost` / `onRequestOptions` 등)은 함수 이름으로 정해진다.
 */

/** `functions/api/search.ts` 가 참조하는 Pages 프로젝트 환경 변수 */
export interface SearchEnv {
  /** 예) https://abc123.ap-northeast-2.aws.elastic-cloud.com */
  ES_URL?: string;
  /** 읽기 전용 API 키 권장 */
  ES_API_KEY?: string;
  /** 기본 coursebrief-v29 */
  ES_INDEX?: string;
}

export interface PagesContext<Env = unknown, Params = Record<string, string | string[]>, Data = unknown> {
  request: Request;
  env: Env;
  params: Params;
  data: Data;
  functionPath?: string;
  waitUntil(promise: Promise<unknown>): void;
  next(input?: Request | string, init?: RequestInit): Promise<Response>;
}

export type PagesFunction<Env = unknown, Params = Record<string, string | string[]>, Data = unknown> = (
  context: PagesContext<Env, Params, Data>,
) => Response | Promise<Response>;
