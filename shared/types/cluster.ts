/** 시설 클러스터(같은 부지 복수 코스)와 시도 목록 */

/**
 * 같은 부지에 있으나 등록·요금·예약 창구가 분리된 코스를 묶는 식별자.
 * `data/v29/clusters.json` 28개(60개 코스). **구장 ID는 합치지 않는다.**
 */
export interface ClusterInfo {
  id: string;
  name: string;
  /** 구성원 코스 이름(구장 `name`과 일치) */
  members: string[];
  /** 묶는 근거(소재지·사업자 등) */
  basis?: string;
  /** 관계 설명(위탁 운영·분리 판매 등) */
  relationship?: string | null;
}

export interface ClusterFile {
  dataset?: { version?: string; count?: number };
  clusters: ClusterInfo[];
}

/** 시도 코드·건수 — 목록의 지역 필터 */
export interface SidoInfo {
  code: string;
  name: string;
  /** 짧은 표기(경기·강원 등) */
  short?: string;
  count: number;
}

export interface SidoFile {
  dataset?: { version?: string; count?: number };
  sido: SidoInfo[];
}
