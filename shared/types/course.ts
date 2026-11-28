/**
 * CourseBrief — 구장 인덱스·상세(12키) 타입
 *
 * 웹(정적 사이트)과 React Native 앱이 **같은 JSON**을 읽으므로, 데이터 계약은 이 파일 하나로 고정한다.
 * 원본 스키마: `data/v29/schema.md` (인덱스 `coursebrief/v29-index-1`, 상세 `stage2c/1.0`)
 *
 * 표기 규칙 (schema.md §3)
 *  - `null` / `[]`  : 미확인. "없음"과 다르다.
 *  - `EvidenceValue`: 확인된 값 + 원문 근거.
 *  - 화면에서 금액 단위는 원(KRW), 기준은 1인·18홀·비회원.
 */
import type { ClusterInfo, SidoInfo } from "./cluster";
import type { NearbyDelivery } from "./rental";

/** 비영업 상태를 포함한 운영 상태. 목록·상세 배지와 필터가 이 값을 쓴다. */
export type CourseStatus = "operating" | "suspended" | "closed" | "under_construction" | "planned" | "cancelled";

/** 이용형태. `미확인`은 값이 비어 있는 구장에 쓰인다(데이터 원본 표기). */
export type MembershipType = "회원제" | "대중제" | "비회원제" | "미확인";

/** 그린피 근거: 공식 요금표 / 공개 예약채널의 관측 실거래 최저가 */
export type FeeBasis = "official" | "market";

/** 구장 불변 식별자 `kr-golf-NNNN` (번호는 연속이 아니다). */
export type CourseId = string;

export interface GreenFeeSummary {
  weekday: number | null;
  weekend: number | null;
  basis: FeeBasis | null;
  as_of: string | null;
}

/** `data/v29/index.json` 의 courses[] 레코드 — 목록·검색·필터용 경량 인덱스 */
export interface CourseIndexItem {
  id: CourseId;
  name: string;
  /** 이명·구 명칭. 검색 보조용(없으면 필드 자체가 없음) */
  aliases?: string[];
  sido: string;
  sido_code: string;
  sigungu: string;
  status: CourseStatus;
  /** 비영업 구장에만 존재 */
  status_label?: string;
  status_note?: string;
  holes: number | null;
  type: MembershipType | null;
  /** 같은 부지 복수 코스 클러스터 ID(`F001`~). 없으면 필드 없음 */
  cluster?: string | null;
  green_fee?: GreenFeeSummary | null;
  lat?: number | null;
  lng?: number | null;
  tel?: string | null;
  homepage?: string | null;
  /** true면 `courses/{id}.json` 에 12키 상세 존재 */
  detail: boolean;
  /** 파(18홀 기준) */
  par?: number;
  /** 전장 m(18홀 기준 정규화) */
  length?: number;
  /** 카트 사용료(원, 팀 기준) */
  cart?: number;
  /** 캐디피(원, 팀 기준) */
  caddie?: number;
  /** 카드 배지 코드 — n=노캐디 2=2인 y=야간 s=사우나 l=숙박 h=셔틀 p=연습장 f=식당 */
  tags?: string;
  /** 라운더 평가(10점 만점) */
  rating?: number;
  /** 평가 집계 건수 */
  reviews?: number;
  /** 가장 최근 운영 공지 날짜(YYYY-MM-DD) */
  notice?: string;
  /** 확인이 필요한 운영 알림(휴장·공사 등) 존재 */
  alert?: boolean;
  /** 7개 영역 평균 정보 충실도(0~100) */
  cov?: number;
  /**
   * L3 — KGA 대표 슬로프 레이팅.
   * KGA 코스레이팅의 `남자 Regular 티` 18홀 조합 값을 평균한 값(규칙: data/v29/schema.md §4).
   * Regular 티가 없는 구장은 남자 티 슬로프의 중앙값을 쓴다. 값이 없으면 필드 자체가 없다.
   */
  slope?: {
    value: number;
    /** 기준 티 이름(예: Regular) */
    tee: string;
    /** 평균에 쓴 18홀 조합 수 */
    combos: number;
  } | null;
}

export interface DatasetCounts {
  total: number;
  with_detail: number;
  master_only: number;
  operating: number;
  suspended: number;
  closed: number;
  under_construction: number;
  planned: number;
  cancelled: number;
}

/** counts에서 상태별 건수만 뽑은 형태(목록 상태 칩이 쓴다) */
export type StatusCounts = Pick<DatasetCounts, CourseStatus>;

export interface DatasetInfo {
  name: string;
  version: string;
  schema: string;
  built_at: string;
  source_dataset?: string;
  source_version?: string;
  counts: DatasetCounts;
  /** 영역별 평균 충실도(0~1) — 데이터 소개 페이지 인포그래피 */
  coverage?: Partial<Record<CoverageArea, number>>;
  /** 필드 자가 문서화(키 → 설명) */
  fields?: Record<string, string>;
}

/** `data/v29/index.json` 전체 */
export interface CourseIndex {
  dataset: DatasetInfo;
  sido: SidoInfo[];
  clusters: ClusterInfo[];
  courses: CourseIndexItem[];
}

/* ------------------------------------------------------------------ */
/* 상세 12키 (stage2c/1.0)                                             */
/* ------------------------------------------------------------------ */

/** 확인된 값 + 원문 근거. `value: null` 이면 미확인 */
export interface EvidenceValue {
  value: string | null;
  evidence?: string[];
  checked_at?: string | null;
  confidence?: string;
  page_label?: string;
  reference?: string;
  source_type?: string;
  source_url?: string;
  value_from?: string;
  value_previous?: string;
  third_party?: { value?: string | null; source?: string; url?: string };
  conflicts?: Array<{ value?: string; source?: string; url?: string }>;
  sources_alt?: Array<{ value?: string | null; source?: string; url?: string }>;
}

export interface CourseMeta {
  name: string;
  schema: string;
  batch?: string | null;
  has_detail: boolean;
  generated_at: string;
  normalized_at?: string;
  coverage_metric?: string;
  structure?: string;
  schema_previous?: string;
  restructured_from_7key?: boolean;
  data_checks?: string[];
  includes?: string[];
  review?: {
    status?: string;
    checked_at?: string | null;
    checks?: Array<Record<string, unknown>>;
  };
  merged_note?: string;
}

export interface NearestIc {
  name: string;
  distance_km?: number;
  source?: string;
  straight_km_nearest?: number | null;
  straight_name?: string | null;
  ic_note?: string;
}

export interface HolesBreakdown {
  total?: number;
  member?: number;
  public?: number;
  non_member?: number;
}

export interface FacilityCluster {
  facility_id?: string;
  facility_name?: string;
  members?: string[];
  basis?: string;
  relationship?: string | null;
  note?: string | null;
}

/** 상세 `master` — 이름·주소·행정코드·좌표·전화·운영사·면적·개장·상태·클러스터·병합이력 */
export interface MasterInfo {
  course_id?: CourseId;
  name?: string;
  name_variants?: string[];
  name_note?: string | null;
  former_names?: string[] | null;
  type?: MembershipType;
  types?: string[];
  type_note?: string | null;
  holes?: HolesBreakdown;
  holes_note?: string | null;
  holes_conflict?: boolean;
  address?: string;
  address_note?: string | null;
  address_original?: string;
  addresses?: string[];
  region?: {
    sido_code?: string;
    sido_name?: string;
    sido_short?: string;
    sigungu_code?: string | null;
    sigungu_name?: string;
    legal_dong_code?: string | null;
  };
  lat?: number | null;
  lng?: number | null;
  geo_confidence?: string;
  geo_source?: string;
  nearest_ic?: NearestIc | null;
  nearest_ic_note?: string | null;
  tel?: string | null;
  tel_note?: string | null;
  homepage?: string | null;
  homepage_note?: string | null;
  operators?: string[];
  operators_note?: string | null;
  area_sqm?: number | null;
  opened?: string | null;
  opened_note?: string;
  designer?: EvidenceValue | string | null;
  course_blocks?: string[];
  status?: CourseStatus;
  status_note?: string | null;
  expected_open?: string | null;
  project_stage?: string | null;
  access?: string;
  facility_id?: string | null;
  facility_members?: string[] | null;
  facility_cluster?: FacilityCluster | null;
  merged_ids?: string[] | null;
  merged_from?: { course_id?: CourseId; name?: string };
}

/** 잔디 표기: 문자열 또는 근거 객체(값이 없으면 근거만 있는 경우도 있다) */
export type GrassValue = string | { value?: string; evidence?: string; source?: string; url?: string } | null;

export interface KgaTee {
  tee?: string;
  gender?: string;
  length_yds?: number;
  course_rating?: number;
  slope_rating?: number;
  std_par?: number;
  front9?: string;
  back9?: string;
}

export interface KgaHoleCombination {
  course_name_1?: string;
  course_name_2?: string;
  tees?: KgaTee[];
}

export interface KgaInfo {
  kga_name?: string;
  name?: string;
  kga_course_code?: string;
  region_short?: string;
  address?: string;
  nine_hole_courses?: string[];
  hole_combinations?: Array<KgaHoleCombination | string>;
  match_method?: string;
  match_confidence?: string;
  match_score?: number;
}

export interface ExtraCourse {
  name?: string;
  holes?: number;
  type?: string;
  fee?: string;
  tel?: string;
  open_hours?: string;
  closed?: string;
  note?: string;
  confidence?: string;
  source?: string;
}

/** 상세 `course` — 홀·파·길이·잔디·KGA 레이팅 */
export interface CourseSpec {
  holes?: number | null;
  holes_received?: number | null;
  holes_note?: string;
  course_names?: string | null;
  membership_type?: MembershipType | null;
  night_light?: string | null;
  blocks?: string[];
  grass?: { tee?: GrassValue; fairway?: GrassValue; green?: GrassValue };
  kga?: KgaInfo | null;
  kga_hole_est?: number | string | null;
  extra_courses?: ExtraCourse[] | null;
  hole_by_hole?: unknown;
  length_m?: number | null;
  par?: number | null;
}

/** 금액 항목(카트·캐디 등) — 단위는 원 */
export interface FeeItem {
  value: number | null;
  text?: string | null;
  label?: string;
  none?: boolean;
  note?: string | null;
  unit?: string;
  raw?: string;
  source?: string;
  url?: string;
  evidence?: string;
}

export interface FeeMarket {
  weekday_min?: number | null;
  weekend_min?: number | null;
  note?: string | null;
  source?: string | null;
  url?: string | null;
  url_former?: string;
  part1?: number | null;
  part2?: number | null;
}

export interface FeeTableRow {
  section?: string;
  label?: string;
  value?: string;
  amounts?: number[];
  url?: string;
}

export interface FeeTable {
  rows?: FeeTableRow[];
  url?: string;
}

export interface FeeOfficialDetail {
  green_detail?: string;
  cart_detail?: string;
  caddie_detail?: string;
  facility_fee?: number | string;
  rental?: string;
  source?: string;
  url?: string;
  checked_at?: string;
}

export interface FeeOfficialGreen {
  value?: number;
  raw?: string;
  label?: string;
  url?: string;
  source?: string;
}

export interface FeeSource {
  source?: string;
  url?: string | null;
  checked_at?: string | null;
  note?: string;
}

export interface MemberFee {
  weekday?: number | null;
  weekend?: number | null;
  weekday_text?: string;
  weekend_text?: string;
  note?: string;
  as_of?: string;
  cart?: FeeItem;
  caddie?: FeeItem;
}

/** 상세 `fee` — 1인 18홀 비회원 기준 요금 */
export interface CourseFee {
  weekday?: number | null;
  weekend?: number | null;
  weekday_text?: string | null;
  weekend_text?: string | null;
  basis?: FeeBasis | null;
  tax_included?: string | null;
  cart?: FeeItem | null;
  caddie?: FeeItem | null;
  as_of?: string | null;
  checked_at?: string | null;
  source_url?: string | null;
  note?: string | null;
  sources?: FeeSource[];
  market?: FeeMarket | null;
  official_green?: FeeOfficialGreen | null;
  weekday_official?: FeeItem | null;
  weekend_official?: FeeItem | null;
  official_table?: FeeTable | null;
  official_detail?: FeeOfficialDetail | null;
  member?: MemberFee | null;
}

/** 문자열 또는 값+출처 객체. `null` 은 미확인 */
export type TextValue =
  | string
  | { value: string; source?: string; url?: string | null; evidence?: string[] }
  | null;

/** 무료 취소 마감 하나 — 라운드 N일 전, 시각은 확인된 경우만 */
export interface ParsedDeadline {
  days_before: number;
  time?: string;
}

/** 위약 단계 — N일 전 구간에 % 또는 예약정지 */
export interface ParsedPenalty {
  day?: "weekday" | "weekend" | null;
  from_days: number;
  to_days: number;
  pct?: number | null;
  suspend_months?: number | null;
  suspend_days?: number | null;
  text?: string;
}

/** `scripts/parse_booking_rules.py` 가 만든 취소 규칙 요약 (원문은 cancel_policy 에 그대로) */
export interface ParsedCancel {
  free: { weekday?: ParsedDeadline; weekend?: ParsedDeadline };
  penalty: ParsedPenalty[];
  basis?: "team" | "person" | "unknown";
  scope?: "member" | "non_member" | "unknown";
  confidence?: "high" | "medium" | "low";
  basis_text?: string[];
  penalty_text?: string[];
}

/** 예약 오픈 규칙 하나 — 이용일 기준 N주·N일·N개월 전, 요일·시각 */
export interface ParsedOpenRule {
  scope?: "weekday" | "weekend" | "both";
  unit?: "week" | "day" | "month";
  before?: number;
  weekday?: string | null;
  time?: string | null;
  member?: string | null;
  text?: string;
}

export interface ParsedOpenMonthly {
  day?: number | null;
  weekday?: string | null;
  time?: string | null;
  scope?: "weekday" | "weekend" | "both";
  ordinal?: string;
}

/** `open_cycle` 문장을 구조화한 값 */
export interface ParsedOpen {
  rules: ParsedOpenRule[];
  monthly?: ParsedOpenMonthly[];
  weekly?: { weekday?: string | null; time?: string | null } | null;
  method?: "lottery" | "fcfs" | "online" | "phone" | "onsite" | null;
  recurring?: boolean;
  member_only?: boolean;
  scope?: string;
  ambiguous?: boolean;
  confidence?: "high" | "medium" | "low";
  text?: string;
}

/** 상세 `cancel` — 취소 규정·예약 오픈 주기·악천후 정산 */
export interface CancelInfo {
  cancel_policy?: TextValue;
  cancel?: { value?: string; evidence?: string[] };
  open_cycle?: string | null;
  notes?: string | null;
  evidence?: string[];
  weather_evidence?: string[];
  /** 파싱 보조값(원문 유지). 없으면 화면은 원문만 보여 준다 */
  parsed_cancel?: ParsedCancel | null;
  parsed_open?: ParsedOpen | null;
  /** 악천후 정산 규정에서 뽑은 짧은 문장 */
  weather_summary?: string[] | null;
  browser_official?: Record<string, unknown> | null;
}

/** `data/v29/alerts.json` — 휴장·에어레이션·요금 변경 통합 캘린더 항목 */
export interface AlertItem {
  id: string;
  name: string;
  sido?: string;
  sigungu?: string;
  status?: string;
  kind: "closure" | "aeration" | "fee_change" | "note" | "notice" | "event";
  source: "alert" | "notice";
  title: string;
  from?: string | null;
  to?: string | null;
  reopen?: string | null;
  confirmed?: boolean;
  level?: string;
  detail?: string;
  url?: string | null;
  updated?: string;
}

export interface AlertFile {
  dataset: { built_at?: string; count?: number; with_period?: number; note?: string };
  items: AlertItem[];
}

/** `data/v29/booking_rules.json` — 목록·내 구장 화면이 쓰는 경량 규칙 */
export interface BookingRulesFile {
  dataset: {
    built_at?: string;
    parsed_cancel?: number;
    parsed_open?: number;
    with_cancel_policy?: number;
    with_open_cycle?: number;
    note?: string;
  };
  rules: Record<string, { cancel?: ParsedCancel; open?: ParsedOpen }>;
}

/** 현장 운영 14항목 (schema.md §3) */
export type OpsKey =
  | "nocaddie"
  | "two_player"
  | "three_player"
  | "five_player"
  | "marshal_caddie"
  | "cart_type"
  | "cart_entry"
  | "bagdrop"
  | "mat"
  | "checkin"
  | "locker"
  | "sauna"
  | "dress"
  | "pace";

/** 상세 `ops` — 항목별 `{ value, evidence }` + 수집 원문(browser_official) */
export interface CourseOps {
  nocaddie?: EvidenceValue;
  two_player?: EvidenceValue;
  three_player?: EvidenceValue;
  five_player?: EvidenceValue;
  marshal_caddie?: EvidenceValue;
  cart_type?: EvidenceValue;
  cart_entry?: EvidenceValue;
  bagdrop?: EvidenceValue;
  mat?: EvidenceValue;
  checkin?: EvidenceValue;
  locker?: EvidenceValue;
  sauna?: EvidenceValue;
  dress?: EvidenceValue;
  pace?: EvidenceValue;
  /** 공식 채널에서 긁어온 운영 원문(항목명이 구장마다 달라 자유 구조) */
  browser_official?: Record<string, unknown>;
  cart_limousine?: EvidenceValue;
  join?: EvidenceValue;
  reservation?: EvidenceValue;
  weather?: EvidenceValue;
  grass?: string | null;
}

/** 부대시설 정규 10항목 */
export type FacilityKey =
  | "practice"
  | "indoor_range"
  | "food"
  | "snack_bar"
  | "locker_sauna"
  | "lodging"
  | "other"
  | "night"
  | "closed_days"
  | "shuttle"
  | "proshop"
  | "ev_charge";

/** 상세 `facilities` */
export interface CourseFacilities {
  practice?: EvidenceValue;
  indoor_range?: EvidenceValue;
  food?: EvidenceValue;
  snack_bar?: EvidenceValue;
  locker_sauna?: EvidenceValue;
  lodging?: EvidenceValue;
  other?: EvidenceValue;
  night?: EvidenceValue;
  closed_days?: EvidenceValue;
  shuttle?: EvidenceValue;
  proshop?: EvidenceValue;
  ev_charge?: EvidenceValue;
  parking?: EvidenceValue;
  practice_fee?: EvidenceValue;
  /** 골프장이 공개한 시설 목록 원문 */
  gf_facilities?: string[] | null;
}

export interface RentalOfficial {
  label?: string;
  value?: number;
  full_set?: number;
  nine?: number;
  putter?: number;
  putter_single?: number;
  shoes?: number;
  single_club?: number;
  brand?: string;
  note?: string;
  raw?: string;
  source?: string;
  url?: string;
}

/** 상세 `rental` — 골프장 자체 대여 + 권역 배송 업체 */
export interface RentalInfo {
  available?: string | null;
  full_set?: number | null;
  fee_text?: string | null;
  brand?: string | null;
  left_handed?: string | null;
  shoes?: string | number | null;
  nine_hole?: number | null;
  range_finder?: string | null;
  reservation?: string | null;
  source_url?: string | null;
  evidence?: string[];
  note?: string;
  official?: RentalOfficial | null;
  nearby_delivery?: NearbyDelivery | null;
}

export interface NoticeItem {
  title?: string;
  date?: string | null;
  url?: string | null;
  type?: string;
  text?: string;
  as_of?: string;
}

/** 태그별 묶음은 배열이 원칙이나, 일부 구장은 문자열 하나로 저장돼 있다 */
export type NoticeTagValue = NoticeItem[] | string;

export interface Notices {
  url?: string | null;
  items?: NoticeItem[];
  tags?: Record<string, NoticeTagValue>;
}

export interface ReviewSummary {
  score_10?: number | null;
  count?: number | null;
  note?: string;
  source?: string;
  url?: string | null;
  url_former?: string;
}

export interface AlertPeriod {
  from?: string | null;
  to?: string | null;
  reopen?: string | null;
}

export interface BriefingAlert {
  type?: string;
  level?: string;
  summary?: string;
  detail?: string;
  period?: AlertPeriod | string | null;
  confirmed?: boolean;
  confirmed_basis?: string;
  currently_closed?: boolean;
  planned_closure?: string;
  checked_at?: string;
  source_url?: string | null;
  source_file?: string;
  raw?: string;
}

/** 상세 `briefing` — 최근 공지·라운더 평가·확인 필요 알림 */
export interface BriefingInfo {
  notices?: Notices;
  review?: ReviewSummary | null;
  fee_change?: unknown;
  recent_notice_text?: string | null;
  course_notes?: string | null;
  alert?: BriefingAlert | null;
  unconfirmed?: string[];
  unconfirmed_labels_added?: string[];
  sources?: string[];
  collected_at?: string;
  browser_verified_at?: string;
}

/** 상세 `collection` — 수집 절차 메타(화면에 거의 쓰지 않음) */
export interface CollectionInfo {
  official_site?: string | null;
  official_reason?: string | null;
  pages_collected?: number;
  third_party?: { teepick?: boolean; greenfeeguide?: boolean; received_report?: boolean };
  render_hint?: string | null;
  plan_strategy?: string | null;
  browser_pages?: number;
  browser_pdf?: string[];
  browser_batch?: boolean;
}

export type CoverageArea = "basic" | "course" | "fee" | "ops" | "facility" | "briefing" | "rental";

/** 영역별 채움률 0~1 */
export type CourseCoverage = Partial<Record<CoverageArea, number>>;

/** `data/v29/courses/{id}.json` — 12키 상세 */
export interface CourseDetail {
  course_id: CourseId;
  meta: CourseMeta;
  master: MasterInfo;
  course: CourseSpec;
  fee: CourseFee;
  cancel: CancelInfo;
  ops: CourseOps;
  facilities: CourseFacilities;
  rental: RentalInfo;
  briefing: BriefingInfo;
  collection: CollectionInfo;
  coverage: CourseCoverage;
}
