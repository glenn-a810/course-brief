/**
 * CourseBrief 공유 타입 진입점.
 *
 * 웹(`web/assets/*.ts`)과 React Native 앱은 이 모듈만 import 하면 된다.
 * 런타임 코드가 없는 타입 전용 모듈이므로 번들에 남지 않는다.
 *
 *   import type { CourseIndexItem, CourseDetail, SearchAdapter } from "@coursebrief/shared";
 */
export type {
  AlertPeriod,
  BriefingAlert,
  BriefingInfo,
  CancelInfo,
  CollectionInfo,
  CourseCoverage,
  CourseDetail,
  CourseFacilities,
  CourseFee,
  CourseId,
  CourseIndex,
  CourseIndexItem,
  CourseMeta,
  CourseOps,
  CourseSpec,
  CourseStatus,
  CoverageArea,
  DatasetCounts,
  DatasetInfo,
  EvidenceValue,
  ExtraCourse,
  FacilityKey,
  FacilityCluster,
  FeeBasis,
  FeeItem,
  FeeMarket,
  FeeOfficialDetail,
  FeeOfficialGreen,
  FeeSource,
  FeeTable,
  FeeTableRow,
  GrassValue,
  GreenFeeSummary,
  HolesBreakdown,
  KgaHoleCombination,
  KgaInfo,
  KgaTee,
  MasterInfo,
  MemberFee,
  MembershipType,
  NearestIc,
  NoticeItem,
  NoticeTagValue,
  Notices,
  OpsKey,
  RentalInfo,
  RentalOfficial,
  ReviewSummary,
  StatusCounts,
  TextValue,
} from "./course";

export type { ClusterFile, ClusterInfo, SidoFile, SidoInfo } from "./cluster";

export type {
  NearbyDelivery,
  NearbyDeliveryProvider,
  RentalCoverageMark,
  RentalProvider,
  RentalProvidersFile,
  RentalRegion,
} from "./rental";

export type {
  SearchAdapter,
  SearchBackendHit,
  SearchBackendResponse,
  SearchConfig,
  SearchContext,
  SearchMode,
  SearchQuery,
  SearchResult,
  SiteConfig,
} from "./search";

export type { PagesContext, PagesFunction, SearchEnv } from "./cloudflare";
