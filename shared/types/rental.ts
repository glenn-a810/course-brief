/** 클럽 렌탈·딜리버리 업체 (`data/v29/rental_providers.json`) */

export type RentalRegion = "수도권" | "강원" | "충청" | "호남" | "영남" | "제주";

/** 권역별 서비스 표기. `조건부`는 조건이 붙어 가능 */
export type RentalCoverageMark = "O" | "조건부" | "X" | "미확인";

/** `rental_providers.json` 의 providers[] */
export interface RentalProvider {
  id: string;
  name: string;
  /** 업체가 공개한 사업자 번호 */
  phone?: string | null;
  url?: string | null;
  regions?: RentalRegion[];
  coverage?: Partial<Record<RentalRegion, RentalCoverageMark>>;
  /** 대표 요금(업체 공개 기준) */
  price?: string | null;
  brands?: string | null;
  delivery?: string | null;
  languages?: string | null;
  /** 영업 상태(예: 2026-11 기준 예약 중단) */
  status?: string | null;
  /** 이 업체가 권역 매핑된 구장 수 */
  course_count?: number | null;
  note?: string | null;
}

export interface RentalProvidersFile {
  dataset?: { name?: string; version?: string; verified_at?: string; count?: number; source?: string };
  /** 렌탈 시장 구조 요약 */
  summary?: string;
  providers: RentalProvider[];
}

/** 구장 상세 `rental.nearby_delivery.providers[]` — 권역 배송 가능 업체 */
export interface NearbyDeliveryProvider {
  id: string;
  name: string;
  coverage?: RentalCoverageMark | string | null;
  basis?: string;
  phone?: string | null;
  operating_status?: string | null;
  delivery?: string | null;
  /** 대표 요금 한 줄 */
  price_headline?: string | null;
  bookable?: boolean;
  bookable_reason?: string | null;
  caution?: string | null;
}

/** 구장 상세 `rental.nearby_delivery` */
export interface NearbyDelivery {
  region?: string;
  sido?: string;
  providers?: NearbyDeliveryProvider[];
  provider_count?: number;
  /** 표기 범례(O·X·조건부·미확인) */
  legend?: Record<string, string>;
  note_code?: string | null;
  not_verified?: string | null;
  verified_at?: string | null;
  checked_at?: string | null;
  source_file?: string;
}
