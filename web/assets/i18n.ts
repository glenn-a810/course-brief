/**
 * L1. 다국어(KO/EN/JA)
 *
 * 원칙
 *  - **데이터는 번역하지 않는다.** 골프장 이름·공지·취소 규정·운영 문구는 골프장이 쓴
 *    한국어 원문이며, 번역하면 잘못된 요금·규정 안내가 된다. 그래서 화면의 '틀'(내비게이션,
 *    필터, 정렬, 영역 제목, 라벨, 계산기·비교표·위치·캘린더의 UI 문구)만 번역하고,
 *    원문이 들어가는 자리에는 한국어를 그대로 둔다. 영어·일본어 화면에서는 그 사실을
 *    한 줄로 알린다(`i18n.originalNote`).
 *  - 사전은 `ko | en | ja` 세 값을 한 줄에 적는다(`scripts/check-i18n.mjs` 가 검사).
 *  - 언어 선택은 localStorage(`coursebrief-lang`)에 남고, 바꾸면 화면을 다시 그린다.
 *
 * 이 파일은 다른 모듈을 import 하지 않는다(사이클 방지). DOM 조작은 `applyStaticI18n` 만 한다.
 */

export type Lang = "ko" | "en" | "ja";

export interface LangOption {
  code: Lang;
  /** 그 언어로 쓴 이름 */
  label: string;
  /** `<html lang>` 값 */
  html: string;
}

export const LANGS: readonly LangOption[] = [
  { code: "ko", label: "한국어", html: "ko" },
  { code: "en", label: "English", html: "en" },
  { code: "ja", label: "日本語", html: "ja" },
];

const STORAGE_KEY = "coursebrief-lang";
const LANG_INDEX: Record<Lang, 0 | 1 | 2> = { ko: 0, en: 1, ja: 2 };

type Tuple = readonly [ko: string, en: string, ja: string];

/**
 * 사전 — 키: [한국어, English, 日本語]
 * 문장 안에 값이 들어가면 `{n}` `{label}` 처럼 자리표시자를 쓴다.
 */
const DICT: Record<string, Tuple> = {
  /* ---------------- 공통 ---------------- */
  "common.all": ["전체", "All", "すべて"],
  "common.weekday": ["주중", "Weekday", "平日"],
  "common.weekend": ["주말", "Weekend", "週末"],
  "common.weekendHoliday": ["주말·공휴일", "Weekend & holidays", "週末・祝日"],
  "common.perTeam": ["팀 기준", "per team", "1組あたり"],
  "common.official": ["공식 요금표", "Official rate card", "公式料金表"],
  "common.market": ["관측 최저", "Observed low", "観測最安"],
  "common.marketLong": ["관측 최저가", "Observed lowest price", "観測最安値"],
  "common.unknown": ["미확인", "Not verified", "未確認"],
  "common.yes": ["가능", "Available", "可"],
  "common.no": ["불가", "Not available", "不可"],
  "common.conditional": ["조건부", "Conditional", "条件付き"],
  "common.info": ["안내", "Info", "案内"],
  "common.copy": ["복사", "Copy", "コピー"],
  "common.share": ["공유하기", "Share", "共有"],
  "common.more": ["더 보기", "Show more", "もっと見る"],
  "common.detail": ["상세", "Details", "詳細"],
  "common.list": ["목록", "List", "一覧"],
  "common.save": ["저장", "Save", "保存"],
  "common.saved": ["저장됨", "Saved", "保存済み"],
  "common.close": ["닫기", "Close", "閉じる"],
  "common.reset": ["필터 초기화", "Reset filters", "フィルターをリセット"],
  "common.updated": ["업데이트", "Updated", "更新"],
  "common.name": ["이름", "Name", "名称"],
  "common.today": ["오늘", "Today", "今日"],
  "wd.0": ["일", "Sun", "日"],
  "wd.1": ["월", "Mon", "月"],
  "wd.2": ["화", "Tue", "火"],
  "wd.3": ["수", "Wed", "水"],
  "wd.4": ["목", "Thu", "木"],
  "wd.5": ["금", "Fri", "金"],
  "wd.6": ["토", "Sat", "土"],

  /* ---------------- 내비게이션·상단 ---------------- */
  "nav.courses": ["골프장", "Courses", "ゴルフ場"],
  "nav.saved": ["관심 골프장", "My courses", "マイコース"],
  "nav.alerts": ["휴장·정비", "Closures", "休場・整備"],
  "nav.rental": ["클럽 렌탈", "Club rental", "クラブレンタル"],
  "nav.rentalShort": ["렌탈", "Rental", "レンタル"],
  "nav.about": ["데이터", "Data", "データ"],
  "nav.mainAria": ["주요 메뉴", "Main menu", "メインメニュー"],
  "nav.homeAria": ["CourseBrief 홈", "CourseBrief home", "CourseBrief ホーム"],
  "nav.searchAria": ["골프장 검색", "Search golf courses", "ゴルフ場を検索"],
  "nav.themeAria": ["테마 선택", "Choose theme", "テーマを選択"],
  "nav.langAria": ["언어 선택", "Choose language", "言語を選択"],
  "nav.skip": ["본문으로 건너뛰기", "Skip to content", "本文へスキップ"],
  "foot.updated": ["업데이트 {date}", "Updated {date}", "更新 {date}"],
  "foot.counts": ["{n}곳 (상세 {detail} / 요약 {summary})", "{n} courses ({detail} detailed / {summary} summary)", "{n}件（詳細 {detail} / 概要 {summary}）"],
  "theme.auto": ["자동", "Auto", "自動"],
  "theme.systemHint": ["시스템 설정", "System", "システム設定"],
  "theme.light": ["라이트", "Light", "ライト"],
  "theme.dark": ["다크", "Dark", "ダーク"],

  /* ---------------- 목록·검색 ---------------- */
  "search.dialogTitle": ["골프장 검색", "Search golf courses", "ゴルフ場を検索"],
  "search.placeholder": ["골프장 이름·지역·초성 (익산, ㅇㅅ)", "Course name, region (Iksan)", "ゴルフ場名・地域 (益山)"],
  "search.hint": ["초성(ㅇㅅ)이나 이름 일부, 예전 이름, 지역으로 찾아요.", "Search by name, old name or region.", "名前・旧名称・地域で検索します。"],
  "search.submit": ["검색", "Search", "検索"],
  "search.clearAria": ["검색어 지우기", "Clear search", "検索語をクリア"],
  "list.heroTitle": ["전국 골프장 {n}곳", "{n} golf courses in Korea", "全国のゴルフ場 {n}件"],
  "list.heroDesc": [
    "코스 스펙·그린피·예약 규칙·현장 운영을 7개 영역으로 정리했어요.",
    "Course specs, green fees, booking rules and on-site conditions, organised into 7 areas.",
    "コース仕様・グリーンフィー・予約規則・現場運用を7領域に整理しました。",
  ],
  "list.resultsHeading": ["골프장 검색 결과", "Search results", "検索結果"],
  "list.shown": ["{n}곳 표시", "{n} shown", "{n}件を表示"],
  "list.courseCount": ["구장 {n}", "{n} courses", "コース {n}"],
  "list.totalCount": ["전체 {n}곳", "{n} total", "全 {n}件"],
  "list.showHidden": ["숨김 {n}곳 보기", "Show {n} hidden", "非表示 {n}件を表示"],
  "list.hiddenNote": ["상태 필터로 {n}곳이 숨겨져 있어요.", "{n} courses are hidden by the status filter.", "ステータスフィルターで {n}件が非表示です。"],
  "list.excludeNote": [
    "검색 결과 <b>{total}곳</b> 중 <b>{excluded}곳</b>이 다른 조건으로 제외됐어요.",
    "<b>{excluded}</b> of <b>{total}</b> matches were excluded by other filters.",
    "検索結果 <b>{total}件</b>のうち<b>{excluded}件</b>が他の条件で除外されました。",
  ],
  "list.keepSearchOnly": ["검색은 두고 필터만 초기화", "Keep search, reset filters", "検索は残してフィルターのみ解除"],
  "list.statusLine": ["{label} {n}곳 표시 중", "Showing {n} {label}", "{label} {n}件を表示中"],
  "list.searchTerm": ["검색어 {q}.", "Search: {q}.", "検索語 {q}。"],
  "list.emptyTitle": ["조건에 맞는 골프장이 없어요", "No courses match these filters", "条件に合うゴルフ場がありません"],
  "list.emptyDefault": ["다른 조건으로 다시 찾아보세요.", "Try different filters.", "別の条件で探してみてください。"],
  "list.emptySearch": ["‘{q}’와 맞는 골프장이 없어요. 다른 이름이나 지역으로 찾아봐 주세요.", "No course matches ‘{q}’. Try another name or region.", "「{q}」に一致するゴルフ場はありません。別の名前・地域でお試しください。"],
  "list.emptyWiden": ["{parts} 조건을 넓히면 결과가 나옵니다.", "Widen {parts} to see results.", "{parts} の条件を広げると結果が出ます。"],
  "list.emptyFilterParts": ["{label}", "{label}", "{label}"],
  "list.showAllStatus": ["숨긴 상태 모두 보기", "Show hidden statuses", "非表示のステータスも表示"],
  "list.viewList": ["목록", "List", "一覧"],
  "list.viewMap": ["지도", "Map", "地図"],
  "list.viewAria": ["보기 방식", "View mode", "表示方法"],
  "list.mapNote": [
    "확인된 좌표가 있는 구장만 보여요. 핀을 누르면 요약 카드가 열리고, 카드를 누르면 상세로 넘어가요.",
    "Only courses with verified coordinates are shown. Tap a pin for a summary card.",
    "確認済みの座標があるゴルフ場のみ表示します。ピンを押すと概要が開きます。",
  ],
  "list.mapFailTitle": ["지도를 불러오지 못했어요", "The map could not load", "地図を読み込めませんでした"],
  "list.mapFailDesc": ["네트워크에서 지도 타일을 받지 못해요. 목록 보기에서 같은 조건의 구장을 확인해 주세요.", "Map tiles are unavailable. Use the list view instead.", "地図タイルを取得できません。一覧表示でご確認ください。"],
  "list.mapToList": ["목록 보기", "List view", "一覧表示"],
  "list.filterNoteAria": ["필터 안내", "Filter note", "フィルター案内"],

  /* ---------------- 필터·정렬 ---------------- */
  "filter.title": ["필터 · 정렬", "Filters & sort", "フィルター・並び替え"],
  "filter.region": ["지역", "Region", "地域"],
  "filter.type": ["이용형태", "Type", "利用形態"],
  "filter.holes": ["홀수", "Holes", "ホール数"],
  "filter.fee": ["주말 그린피", "Weekend green fee", "週末グリーンフィー"],
  "filter.sort": ["정렬", "Sort", "並び替え"],
  "filter.status": ["영업 상태", "Status", "営業状態"],
  "filter.tags": ["플레이 조건", "Play conditions", "プレー条件"],
  "filter.aria": ["검색 필터", "Search filters", "検索フィルター"],
  "filter.statusAria": ["영업 상태 필터", "Status filter", "営業状態フィルター"],
  "filter.tagsAria": ["플레이 조건 필터", "Play condition filter", "プレー条件フィルター"],
  "filter.activeAria": ["적용된 필터", "Active filters", "適用中のフィルター"],
  "filter.tagHint": [
    "확인된 구장만 보여요 — 조건이 확인되지 않은 구장은 결과에서 빠져요.",
    "Only verified courses appear — courses without a verified condition drop out.",
    "確認済みのゴルフ場のみ表示します。条件が未確認のゴルフ場は結果から外れます。",
  ],
  "filter.clearAria": ["{label} 필터 해제", "Remove {label} filter", "{label} フィルターを解除"],
  "filter.feeUnder": ["{amount}원 이하", "≤ ₩{amount}", "{amount}ウォン以下"],
  "filter.holesOver": ["36홀 이상", "36+ holes", "36ホール以上"],
  "filter.statusCount": ["상태 {n}종", "{n} statuses", "ステータス {n}種"],
  "filter.holesValue": ["{n}홀", "{n} holes", "{n}ホール"],
  "opt.holes9": ["9홀", "9 holes", "9ホール"],
  "opt.holes18": ["18홀", "18 holes", "18ホール"],
  "opt.holes27": ["27홀", "27 holes", "27ホール"],

  /* ---------------- 정렬 이름 ---------------- */
  "sort.name": ["이름순", "Name", "名前順"],
  "sort.feeAsc": ["그린피 낮은순", "Green fee: low to high", "グリーンフィー安い順"],
  "sort.feeDesc": ["그린피 높은순", "Green fee: high to low", "グリーンフィー高い順"],
  "sort.holesDesc": ["홀수 많은순", "Most holes", "ホール数多い順"],
  "sort.totalAsc": ["4인 총액 낮은순", "4-player total: low to high", "4人合計が安い順"],
  "sort.totalDesc": ["4인 총액 높은순", "4-player total: high to low", "4人合計が高い順"],
  "sort.ratingDesc": ["평점 높은순", "Highest rated", "評価が高い順"],
  "sort.slopeHard": ["난이도 높은순(슬로프)", "Hardest first (slope)", "難易度が高い順（スロープ）"],
  "sort.slopeEasy": ["난이도 쉬운순(슬로프)", "Easiest first (slope)", "難易度が低い順（スロープ）"],

  /* ---------------- 이용형태·상태·태그 ---------------- */
  "type.public": ["대중제", "Public", "パブリック"],
  "type.member": ["회원제", "Members only", "メンバーシップ"],
  "type.nonmember": ["비회원제", "Non-member", "ビジター"],
  "status.operating": ["영업중", "Open", "営業中"],
  "status.suspended": ["휴업(영업중단)", "Suspended", "休業（営業停止）"],
  "status.closed": ["폐업", "Closed", "閉業"],
  "status.under_construction": ["건설중", "Under construction", "建設中"],
  "status.planned": ["미착공", "Planned", "未着工"],
  "status.cancelled": ["사업 취소", "Cancelled", "計画中止"],
  "tag.n": ["노캐디", "No caddie", "キャディなし"],
  "tag.2": ["2인 가능", "2 players", "2人プレー可"],
  "tag.y": ["야간", "Night play", "ナイト"],
  "tag.s": ["사우나", "Sauna", "サウナ"],
  "tag.l": ["숙박", "Lodging", "宿泊"],
  "tag.h": ["셔틀", "Shuttle", "シャトル"],
  "tag.p": ["연습장", "Range", "練習場"],
  "tag.f": ["식당", "Dining", "レストラン"],

  /* ---------------- 카드 ---------------- */
  "card.holesUnit": ["홀", " holes", "ホール"],
  "card.sameSite": ["같은 부지 {n}개 코스", "{n} courses on the same site", "同じ敷地に {n}コース"],
  "card.holesSum": ["홀 합산", " holes total", "ホール合計"],
  "card.chooseCourse": ["코스 선택", "Choose course", "コースを選択"],
  "card.compare": ["비교", "Compare", "比較"],
  "card.compared": ["담김", "Added", "追加済み"],
  "card.compareAdd": ["비교에 담기", "Add to compare", "比較に追加"],
  "card.compareRemove": ["비교에서 빼기", "Remove from compare", "比較から外す"],
  "card.favAdd": ["관심 골프장에 저장", "Save to my courses", "マイコースに保存"],
  "card.favRemove": ["관심 골프장에서 빼기", "Remove from my courses", "マイコースから外す"],
  "card.notice": ["공지", "Notice", "お知らせ"],
  "card.noticeTitle": ["최근 공지 {date}", "Latest notice {date}", "最新のお知らせ {date}"],
  "card.noticeStale": ["90일 이상 지남", "older than 90 days", "90日以上経過"],
  "card.closure": ["휴장", "Closed", "休場"],
  "card.closureTitle": ["휴장 일정: {title}", "Closure: {title}", "休場予定: {title}"],
  "card.lastChecked": ["마지막 확인", "Last checked", "最終確認"],
  "card.staleFee": ["요금을 확인한 지 90일이 넘었어요", "Fee checked more than 90 days ago", "料金の確認から90日以上経過しています"],
  "card.viewDetailAria": ["{name} 상세 보기", "{name} details", "{name} の詳細"],

  /* ---------------- 상세 공통 ---------------- */
  "detail.back": ["목록", "Back", "一覧"],
  "detail.kpiHoles": ["홀수", "Holes", "ホール数"],
  "detail.kpiPar": ["파", "Par", "パー"],
  "detail.kpiLength": ["전장", "Length", "距離"],
  "detail.kpiType": ["이용형태", "Type", "利用形態"],
  "detail.kpiRating": ["라운더 평가", "Golfer rating", "ゴルファー評価"],
  "detail.book": ["예약하기", "Book", "予約する"],
  "detail.call": ["전화 걸기", "Call", "電話する"],
  "detail.homepage": ["홈페이지", "Website", "ホームページ"],
  "detail.locTraffic": ["위치·교통", "Location", "アクセス"],
  "detail.directions": ["찾아가기", "Directions", "行き方"],
  "detail.greenFee": ["그린피", "Green fee", "グリーンフィー"],
  "detail.greenFeeSub": ["1인 · 18홀 · 비회원", "per person · 18 holes", "1人・18ホール"],
  "detail.feeLow": ["{day} 최저", "{day} lowest", "{day} 最安"],
  "detail.feePreparing": ["요금 안내 준비 중", "Fee data being verified", "料金情報を確認中"],
  "detail.feePreparingCall": ["요금 안내 준비 중 · 전화 문의", "Fee data being verified · please call", "料金情報を確認中・お電話でお問い合わせください"],
  "detail.summaryData": ["요약 데이터", "Summary only", "概要のみ"],
  "detail.notFoundTitle": ["골프장을 찾을 수 없어요", "Course not found", "ゴルフ場が見つかりません"],
  "detail.notFoundDesc": ["주소가 바뀌었거나 목록에서 빠진 골프장이에요.", "The address changed or the course was removed.", "アドレスが変わったか、一覧から外れたゴルフ場です。"],
  "detail.toList": ["목록으로", "Back to list", "一覧へ"],
  "detail.loading": ["불러오는 중…", "Loading…", "読み込み中…"],
  "detail.loadingDetail": ["상세 정보를 불러오고 있어요", "Loading course details", "詳細を読み込んでいます"],
  "detail.errorTitle": ["상세 데이터를 불러오지 못했어요", "Could not load course details", "詳細データを読み込めませんでした"],
  "detail.errorBody": ["네트워크 문제일 수 있어요. 아래에는 기본 정보만 보여 드려요.", "This may be a network problem. Only basic information is shown.", "ネットワークの問題かもしれません。基本情報のみ表示しています。"],
  "detail.retry": ["다시 시도", "Try again", "再試行"],
  "detail.basicTitle": ["기본 정보", "Basic information", "基本情報"],
  "detail.basicOnlyTitle": ["이 구장은 요약 데이터만 있어요", "This course has summary data only", "このゴルフ場は概要データのみです"],
  "detail.basicOnlyBody": ["건설중·폐업 등으로 상세를 아직 모았거나, 상세를 불러오지 못한 상태예요. 위에 보이는 기본 정보가 확인된 값의 전부예요.", "Details were not collected (construction, closure) or failed to load. The basic information above is all that is verified.", "建設中・閉業などで詳細未収集か、読み込みに失敗した状態です。上記の基本情報が確認できた全てです。"],
  "detail.unavailableNote": ["지금은 예약·이용이 어려운 상태예요.", "This course is not bookable at the moment.", "現在は予約・利用ができない状態です。"],
  "detail.sectionNavAria": ["상세 영역", "Sections", "詳細セクション"],
  "detail.noticeKorean": ["공지·규정 원문은 골프장이 쓴 한국어 그대로 보여요.", "Notices and policies are shown in the original Korean written by the course.", "お知らせ・規定の原文はゴルフ場が書いた韓国語のまま表示されます。"],
  "detail.slopeBadge": ["슬로프 {n}", "Slope {n}", "スロープ {n}"],
  "detail.slopeBadgeTitle": ["KGA 슬로프 레이팅(남자 레귤러 티 기준)", "KGA slope rating (men's regular tee)", "KGAスロープレーティング（男子レギュラーティー基準）"],

  /* ---------------- 기본 정보(facts) ---------------- */
  "facts.address": ["주소", "Address", "住所"],
  "facts.opened": ["개장", "Opened", "開場"],
  "facts.area": ["면적", "Area", "面積"],
  "facts.operators": ["운영사", "Operator", "運営会社"],
  "facts.designer": ["설계", "Designer", "設計"],
  "facts.ic": ["최단 IC", "Nearest IC", "最寄りIC"],
  "facts.tel": ["대표전화", "Phone", "代表電話"],
  "facts.homepage": ["홈페이지", "Website", "ホームページ"],
  "facts.coord": ["좌표", "Coordinates", "座標"],

  /* ---------------- 01 요금·예약 ---------------- */
  "sec.fee": ["요금 · 예약", "Fees & booking", "料金・予約"],
  "sec.course": ["코스 스펙", "Course specs", "コース仕様"],
  "sec.loc": ["위치 · 교통", "Location & access", "アクセス"],
  "sec.ops": ["현장 운영", "On-site", "現場運用"],
  "sec.facility": ["부대시설", "Facilities", "施設"],
  "sec.notice": ["공지 · 브리핑", "Notices & briefing", "お知らせ・ブリーフィング"],
  "sec.cluster": ["동일 부지 코스", "Same-site courses", "同敷地コース"],
  "sec.rental": ["클럽 렌탈", "Club rental", "クラブレンタル"],
  "sec.data": ["데이터 기준", "Data notes", "データ基準"],
  "sec.dataAdmin": ["데이터 정보", "Data information", "データ情報"],
  "fee.desc": [
    "1인 18홀 비회원 정상가. 시즌·시간대·예약 경로에 따라 달라지므로 예약 화면에서 최종 확인하세요.",
    "Published non-member rate for one player, 18 holes. Seasonal and channel prices differ — confirm at booking.",
    "1人18ホールのビジター正規料金。シーズン・時間帯・予約経路で変わるため予約画面でご確認ください。",
  ],
  "fee.weekdayNote": ["월~금 · 1인 18홀", "Mon–Fri · 18 holes per player", "月〜金・1人18ホール"],
  "fee.weekendNote": ["토·일·공휴일 · 1인 18홀", "Sat–Sun & holidays · 18 holes per player", "土日・祝日・1人18ホール"],
  "fee.cartNote": ["4인 1팀 기준", "per team of 4", "4人1組あたり"],
  "fee.caddieNote": ["4인 1팀 기준 · 캐디에게 직접 지급", "per team of 4 · paid directly to the caddie", "4人1組あたり・キャディに直接支払い"],
  "fee.cart": ["카트", "Cart", "カート"],
  "fee.caddie": ["캐디피", "Caddie fee", "キャディフィー"],
  "fee.noCaddie": ["노캐디", "No caddie", "キャディなし"],
  "fee.openTitle": ["예약 오픈", "Booking opens", "予約開始"],
  "fee.cancelTitle": ["취소 · 위약", "Cancellation", "キャンセル・違約金"],
  "fee.openFallback": ["예약 오픈 일정은 골프장에 전화로 확인하세요.", "Ask the course by phone when booking opens.", "予約開始日はゴルフ場に電話でご確認ください。"],
  "fee.cancelFallback": ["취소 규정은 예약 전 전화로 확인하세요.", "Confirm the cancellation policy by phone before booking.", "キャンセル規定は予約前に電話でご確認ください。"],
  "fee.tableCategory": ["구분", "Category", "区分"],
  "fee.tableAmount": ["요금", "Rate", "料金"],
  "fee.tableMore": ["공식 요금표 {n}개 항목 펼치기", "Show all {n} official rate rows", "公式料金表 {n}項目を開く"],
  "fee.memberTitle": ["회원제 요금", "Member rate", "メンバー料金"],
  "fee.observedLow": ["관측 최저가", "Observed lowest", "観測最安値"],
  "fee.unavailableTitle": ["지금은 이용할 수 없는 구장이에요", "This course is currently unavailable", "現在利用できないゴルフ場です"],
  "fee.unavailableBody": ["아래 요금은 마지막으로 확인된 값이고, 예약·결제는 할 수 없어요.", "The rates below are the last verified values; booking is not possible.", "下記の料金は最後に確認された値で、予約・決済はできません。"],
  "fee.staleInline": ["{n}일 전 확인 · 재확인 권장", "checked {n} days ago · recheck recommended", "{n}日前の確認・再確認を推奨"],
  "fee.asOfAdmin": ["요금 기준 {basis} · 확인 {date}", "Basis {basis} · checked {date}", "料金基準 {basis}・確認 {date}"],
  "fee.asOf": ["요금 업데이트 {date}", "Fees updated {date}", "料金更新 {date}"],
  "fee.greenDetail": ["공식 요금 상세", "Official fee detail", "公式料金の詳細"],
  "fee.cartDetail": ["카트 상세", "Cart detail", "カート詳細"],
  "fee.caddieDetail": ["캐디 상세", "Caddie detail", "キャディ詳細"],
  "fee.facilityFee": ["시설 이용료", "Facility fee", "施設利用料"],
  "fee.clubRental": ["클럽 대여", "Club rental", "クラブレンタル"],
  "fee.beforeChange": ["변동 전 값이에요. 다시 확인해 주세요", "Value from before a change; recheck recommended", "変更前の値です。再確認を推奨"],

  /* ---------------- 그린피 추이(L2) ---------------- */
  "history.title": ["그린피 추이", "Green fee trend", "グリーンフィーの推移"],
  "history.first": ["{date} 첫 스냅샷 기록 · 일일 업데이트로 추이 누적 예정", "First snapshot {date} · trend builds as daily snapshots accumulate", "{date} 最初のスナップショット・毎日の更新で推移を蓄積予定"],
  "history.points": ["스냅샷 {n}회 · {from} ~ {to}", "{n} snapshots · {from} – {to}", "スナップショット {n}回・{from} 〜 {to}"],
  "history.change": ["{label} {pct} 변동", "{label} {pct}", "{label} {pct}"],
  "history.none": ["이 구장은 그린피 스냅샷이 아직 없어요.", "No green fee snapshot for this course yet.", "このゴルフ場のスナップショットはまだありません。"],
  "history.note": [
    "값이 바뀐 날만 기록해요. 같은 값이 이어지는 기간은 직전 기록값이 유지된 걸로 봐요.",
    "Records only days when a value changed; between records the previous value stands.",
    "値が変わった日のみ記録します。記録がない期間は直前の値が続いたものとみなします。",
  ],

  /* ---------------- 02 코스 스펙 ---------------- */
  "course.desc": [
    "규모·전장·잔디와 KGA 공식 레이팅. 레이팅은 난이도 비교의 1차 기준이에요.",
    "Size, length, turf and official KGA ratings — the first reference for difficulty.",
    "規模・距離・芝とKGA公式レーティング。難易度比較の第一基準です。",
  ],
  "course.lengthLabel": ["전장 (18홀 기준)", "Length (18 holes)", "距離（18ホール基準）"],
  "course.lengthHint": ["국내 18홀 평균은 약 6.4km예요.", "The Korean 18-hole average is about 6.4 km.", "韓国の18ホール平均は約6.4kmです。"],
  "course.holesTotal": ["총 {n}홀", "{n} holes", "全 {n}ホール"],
  "course.holesMember": ["회원 {n}", "member {n}", "メンバー {n}"],
  "course.holesPublic": ["대중 {n}", "public {n}", "パブリック {n}"],
  "course.holesNonMember": ["비회원 {n}", "non-member {n}", "ビジター {n}"],
  "course.holeConfig": ["홀 구성", "Hole mix", "ホール構成"],
  "course.par": ["파", "Par", "パー"],
  "course.blocks": ["코스 구성", "Course blocks", "コース構成"],
  "course.blockNames": ["세부 코스명", "Block names", "詳細コース名"],
  "course.names": ["코스명", "Course names", "コース名"],
  "course.night": ["야간 라운드", "Night play", "ナイトプレー"],
  "course.extra": ["추가 코스", "Extra courses", "追加コース"],
  "course.kgaSummary": ["KGA 코스레이팅 · 슬로프 {n}행 펼치기", "Show {n} KGA rating rows", "KGAコースレーティング・スロープ {n}行を開く"],
  "course.kgaCombo": ["조합", "Combination", "組み合わせ"],
  "course.kgaTee": ["티", "Tee", "ティー"],
  "course.kgaGender": ["성별", "Gender", "性別"],
  "course.kgaLength": ["길이(yd)", "Length (yd)", "距離(yd)"],
  "course.kgaRating": ["코스레이팅", "Course rating", "コースレーティング"],
  "course.kgaSlope": ["슬로프", "Slope", "スロープ"],
  "course.holeByHole": ["홀별 파·거리 원본 보기", "Show hole-by-hole source", "ホール別パー・距離の原文を表示"],
  "course.turfTee": ["티잉구역", "Tee", "ティーイングエリア"],
  "course.turfFairway": ["페어웨이", "Fairway", "フェアウェイ"],
  "course.turfGreen": ["그린", "Green", "グリーン"],

  /* ---------------- 04 현장 운영 ---------------- */
  "ops.title": ["현장 운영", "On-site conditions", "現場運用"],
  "ops.desc": ["노캐디·인원·카트·체크인처럼 예약 전에 알아야 하는 실제 플레이 조건.", "Real playing conditions — caddie, group size, cart, check-in — before you book.", "キャディ・人数・カート・チェックインなど予約前に知るべき実際のプレー条件。"],
  "ops.emptyTitle": ["확인된 운영 정보가 없어요", "No verified on-site information", "確認済みの運用情報がありません"],
  "ops.emptyBody": ["공식 채널에서 확인된 운영 정보가 아직 없어요. 전화나 현장에서 확인해 주세요.", "Nothing verified from official channels yet. Confirm by phone or on site.", "公式チャネルで確認できた運用情報はまだありません。電話・現場での確認が必要です。"],
  "ops.nocaddie": ["노캐디", "No caddie", "キャディなし"],
  "ops.two_player": ["2인 플레이", "2-player play", "2人プレー"],
  "ops.three_player": ["3인 플레이", "3-player play", "3人プレー"],
  "ops.five_player": ["5인 플레이", "5-player play", "5人プレー"],
  "ops.marshal_caddie": ["마샬 캐디", "Marshal caddie", "マーシャルキャディ"],
  "ops.cart_type": ["카트 종류", "Cart type", "カート種類"],
  "ops.cart_entry": ["카트 페어웨이 진입", "Cart on fairway", "カートのフェアウェイ進入"],
  "ops.bagdrop": ["셀프 백드롭", "Self bag drop", "セルフバッグドロップ"],
  "ops.mat": ["매트 티샷", "Mat tee shot", "マットティーショット"],
  "ops.checkin": ["체크인", "Check-in", "チェックイン"],
  "ops.locker": ["락카", "Locker", "ロッカー"],
  "ops.sauna": ["사우나", "Sauna", "サウナ"],
  "ops.dress": ["복장 규정", "Dress code", "服装規定"],
  "ops.pace": ["진행 속도", "Pace of play", "進行速度"],

  /* ---------------- 05 부대시설 ---------------- */
  "fac.title": ["부대시설", "Facilities", "施設"],
  "fac.desc": ["연습·식음·락카·숙박·야간 조명처럼 라운드 환경을 좌우하는 시설.", "Practice, dining, lockers, lodging and night lighting.", "練習・食事・ロッカー・宿泊・ナイト照明などプレー環境を左右する施設。"],
  "fac.emptyTitle": ["확인된 시설 정보가 없어요", "No verified facility information", "確認済みの施設情報がありません"],
  "fac.emptyBody": ["공식 채널에서 확인된 부대시설 정보가 아직 없어요.", "No facility information verified from official channels yet.", "公式チャネルで確認できた施設情報はまだありません。"],
  "fac.practice": ["연습장", "Driving range", "練習場"],
  "fac.indoor_range": ["실내 연습장", "Indoor range", "室内練習場"],
  "fac.food": ["식당·조식", "Restaurant", "レストラン・朝食"],
  "fac.snack_bar": ["그늘집·스낵", "Snack bar", "売店・スナック"],
  "fac.locker_sauna": ["락카·사우나", "Locker & sauna", "ロッカー・サウナ"],
  "fac.lodging": ["숙박", "Lodging", "宿泊"],
  "fac.other": ["기타 시설", "Other", "その他"],
  "fac.night": ["야간 라운드", "Night play", "ナイトプレー"],
  "fac.closed_days": ["휴장일", "Closed days", "休場日"],
  "fac.shuttle": ["셔틀·교통", "Shuttle", "シャトル"],
  "fac.ev_charge": ["전기차 충전", "EV charging", "EV充電"],
  "fac.proshop": ["프로샵", "Pro shop", "プロショップ"],

  /* ---------------- 06 공지·브리핑 ---------------- */
  "notice.title": ["공지 · 브리핑", "Notices & briefing", "お知らせ・ブリーフィング"],
  "notice.desc": ["휴장·에어레이션·요금 변경 같은 최근 공지와 라운더 평가. 예약 전에 가장 먼저 볼 영역이에요.", "Recent notices (closure, aeration, price changes) and golfer ratings — check this before booking.", "休場・エアレーション・料金変更などの最近のお知らせと評価。予約前に最初に見る領域です。"],
  "notice.review": ["라운더 평가", "Golfer rating", "ゴルファー評価"],
  "notice.reviewCount": ["{n}건 집계", "{n} reviews", "{n}件を集計"],
  "notice.summary": ["공지 요약", "Notice summary", "お知らせ要約"],
  "notice.notes": ["코스 메모", "Course notes", "コースメモ"],
  "notice.recent": ["최근 공지", "Recent notices", "最近のお知らせ"],
  "notice.products": ["클럽·장비 상품 소식 {n}건 (공지 아님)", "{n} club & gear posts (not notices)", "クラブ・用品のお知らせ {n}件（お知らせではありません）"],
  "notice.empty": ["보여 드릴 최근 운영 공지가 없어요.", "No recent operational notices.", "表示できる最近のお知らせはありません。"],
  "notice.checked": ["공지 확인 {date}", "Notices checked {date}", "お知らせ確認 {date}"],
  "notice.periodPrefix": ["기간: {period}", "Period: {period}", "期間: {period}"],
  "notice.confirmedShort": ["확인된 공지", "Verified notice", "確認済みのお知らせ"],

  /* ---------------- 07 동일 부지 ---------------- */
  "cluster.descDefault": ["같은 소재지의 코스가 별도 레코드로 등록돼 있어요.", "Courses at the same site are registered separately.", "同じ所在地のコースが別レコードで登録されています。"],
  "cluster.detail": ["상세 보기", "View details", "詳細を見る"],

  /* ---------------- 08 클럽 렌탈 ---------------- */
  "rental.available": ["대여 가능", "Rental", "レンタル"],
  "rental.desc": ["골프장 자체 대여와, 이 권역에 배송·픽업이 가능한 렌탈 업체.", "In-house club rental plus delivery providers covering this area.", "ゴルフ場の自社レンタルと、このエリアに配送・受け取りが可能なレンタル業者。"],
  "rental.fullSet": ["풀세트 요금", "Full set price", "フルセット料金"],
  "rental.feeText": ["요금 안내", "Fee detail", "料金案内"],
  "rental.brand": ["브랜드", "Brands", "ブランド"],
  "rental.leftHanded": ["좌타용", "Left-handed", "左利き用"],
  "rental.shoes": ["골프화", "Shoes", "ゴルフシューズ"],
  "rental.nineHole": ["9홀", "9 holes", "9ホール"],
  "rental.rangeFinder": ["거리측정기", "Range finder", "距離計"],
  "rental.reservation": ["사전 예약", "Advance booking", "事前予約"],
  "rental.bookable": ["예약 가능", "Available", "予約可"],
  "rental.stopped": ["예약 중단", "Suspended", "受付停止"],
  "rental.regionProviders": ["{region} 권역 배송 업체 {n}곳", "{n} delivery providers in {region}", "{region} エリアの配送業者 {n}社"],
  "rental.allLink": ["전체 렌탈 업체 보기 →", "See all rental providers →", "レンタル業者をすべて見る →"],
  "rental.noSelf": ["자체 대여 정보 없음", "No in-house rental information", "自社レンタル情報なし"],
  "rental.noSelfBody": ["골프장 자체 클럽 대여 정보는 확인되지 않았어요.", "No in-house club rental information has been verified.", "ゴルフ場自社のクラブレンタル情報は確認できていません。"],
  "rental.regionTag": ["권역 {region}", "Area {region}", "エリア {region}"],

  /* ---------------- 데이터 기준 ---------------- */
  "data.basisDesc": ["{date} 기준 · 공개 자료에서 확인된 값만 보여요.", "As of {date} · only values verified from public sources are shown.", "{date} 基準・公開資料で確認できた値のみ表示します。"],
  "data.summaryPrefix": ["이 구장 데이터:", "This course's data:", "このゴルフ場のデータ:"],
  "data.summaryFee": ["요금 {date}", "fees {date}", "料金 {date}"],
  "data.summaryFeeTag": ["요금", "fees", "料金"],
  "data.summaryNoticeTag": ["공지", "notices", "お知らせ"],
  "data.summaryNotice": ["공지 {date}", "notices {date}", "お知らせ {date}"],
  "data.summaryCollected": ["수집 {date}", "collected {date}", "収集 {date}"],
  "data.staleWarn": ["{parts} · 확인 권장", "{parts} · recheck recommended", "{parts}・再確認を推奨"],
  "data.staleDays": ["{label} {n}일 경과", "{label} {n} days old", "{label} {n}日経過"],
  "data.share": ["공유 링크 복사", "Copy share link", "共有リンクをコピー"],
  "data.report": ["정보 오류·누락 제보", "Report wrong or missing data", "情報の誤り・欠落を報告"],
  "data.shareCopied": ["공유 링크를 복사했어요.", "Share link copied.", "共有リンクをコピーしました。"],
  "data.shareFailed": ["복사하지 못했어요.", "Copy failed.", "コピーできませんでした。"],

  /* ---------------- 총비용 계산기 ---------------- */
  "cost.eyebrow": ["라운드 총비용", "Round cost", "ラウンド総額"],
  "cost.title": ["그래서 총 얼마?", "So what's the total?", "で、総額は？"],
  "cost.desc": ["인원·요일을 고르면 그린피에 카트·캐디를 더해 팀 합계와 1인당 금액을 계산해요.", "Pick players and day: green fee plus cart and caddie, as a team total and per person.", "人数・曜日を選ぶとグリーンフィーにカート・キャディを足して1組合計と1人あたりを計算します。"],
  "cost.badge": ["계산기", "Calculator", "計算機"],
  "cost.players": ["인원", "Players", "人数"],
  "cost.playersAria": ["라운드 인원", "Number of players", "ラウンド人数"],
  "cost.day": ["요일", "Day", "曜日"],
  "cost.dayAria": ["요일", "Day of week", "曜日"],
  "cost.holes": ["홀수", "Holes", "ホール数"],
  "cost.holesAria": ["홀수", "Number of holes", "ホール数"],
  "cost.green": ["그린피", "Green fee", "グリーンフィー"],
  "cost.playersN": ["{n}인", "{n} players", "{n}人"],
  "cost.base": ["기본", "base", "基本"],
  "cost.teamOnce": ["팀 기준 1회", "once per team", "1組1回"],
  "cost.notIncluded": ["미포함", "not included", "含まず"],
  "cost.perPersonUnknown": ["{n}인 · 1인 요금 미확인", "{n} players · per-person fee not verified", "{n}人・1人料金未確認"],
  "cost.teamTotal": ["팀 합계", "Team total", "1組合計"],
  "cost.cart9": ["9홀 카트", "9-hole cart", "9ホールカート"],
  "cost.totalPending": ["팀 비용은 그린피를 확인한 뒤 계산해요", "the team total needs a verified green fee", "1組合計はグリーンフィー確認後に計算されます"],
  "cost.perPerson": ["1인당", "Per person", "1人あたり"],
  "cost.copySettlement": ["정산 문구 복사", "Copy settlement text", "精算文をコピー"],
  "cost.totalEmpty": ["{day} {holes}홀 1인 그린피가 확인되지 않아 합계를 계산할 수 없어요.", "No verified {day} {holes}-hole green fee, so the total cannot be calculated.", "{day} {holes}ホールの1人料金が未確認のため合計を計算できません。"],
  "cost.captionExcluded": ["{labels} 미확인 — 미확인 항목 제외 합계", "{labels} not verified — total excludes them", "{labels} 未確認・未確認項目を除いた合計"],
  "cost.captionTeam": ["카트·캐디는 팀 기준 1회 청구로 계산했어요", "Cart and caddie are charged once per team.", "カート・キャディは1組1回の請求で計算しました。"],
  "cost.note5": ["5인 카트는 팀 구성·요금이 다른 구장이 있어요 — 카트 요금은 따로 확인해 주세요.", "Some courses charge differently for 5-player carts — confirm the cart fee.", "5人カートは料金が異なるゴルフ場があります。カート料金は別途ご確認ください。"],
  "cost.note9": ["9홀 카트 요금은 확인되지 않았어요 — 합계에서 빠져 있어요.", "The 9-hole cart fee is not verified and is excluded.", "9ホールのカート料金は未確認のため合計から除いています。"],
  "cost.noteNoCart": ["카트 요금이 확인되지 않아 합계에서 빠졌어요.", "The cart fee is not verified and is excluded.", "カート料金が未確認のため合計から除きました。"],
  "cost.noteNoCaddie": ["캐디피가 확인되지 않아 합계에서 빠졌어요.", "The caddie fee is not verified and is excluded.", "キャディフィーが未確認のため合計から除きました。"],
  "cost.noteTax": ["시설이용료·세금·봉사료는 빠져 있을 수 있어요. 예약 화면의 최종 금액과 다를 수 있어요.", "Facility fees, taxes and service charges may not be included; the booking screen is final.", "施設利用料・税金・サービス料は含まれない場合があります。予約画面の最終金額と異なることがあります。"],
  "cost.srcLine": ["{src} 기준 1인 18홀 비회원 요금", "{src}, non-member, 18 holes per player", "{src} 基準・1人18ホールのビジター料金"],
  "cost.srcChecked": [" · 확인 {date}", " · checked {date}", "・確認 {date}"],
  "cost.hintNote": ["4인 · {text}", "4 players · {text}", "4人・{text}"],
  "cost.hintUnknown": ["{n}인 플레이 여부가 확인되지 않았어요. 전화로 확인해 주세요.", "Whether {n} can play is not verified — please call.", "{n}人プレーは未確認です。電話でご確認ください。"],
  "cost.hintNo": ["{n}인 플레이는 불가로 확인된 구장이에요.", "{n}-player play is not available at this course.", "このゴルフ場は{n}人プレー不可と確認されています。"],
  "cost.hintConditional": ["{n}인은 조건·추가요금이 붙을 수 있어요.", "{n} players may be conditional or cost extra.", "{n}人は条件・追加料金が付く場合があります。"],
  "cost.hintCommon": ["2·3·5인은 4인 요금(또는 조인)이 적용되는 구장이 많아요 — 계산값은 아래 원문과 함께 확인해 주세요.", "Many courses charge the 4-player rate (or require joining) — check the original text below.", "2・3・5人は4人料金（またはジョイン）が適用されるゴルフ場が多いです。下の原文と合わせてご確認ください。"],
  "cost.hintRaw": ["원문: {text}", "Source: {text}", "原文: {text}"],
  "cost.copied": ["정산 문구를 복사했어요.", "Settlement text copied.", "精算文をコピーしました。"],
  "cost.copyFailed": ["복사하지 못했어요 — 브라우저 권한을 확인해 주세요.", "Copy failed — check browser permissions.", "コピーできませんでした。ブラウザの権限をご確認ください。"],
  "cost.shared": ["공유했어요.", "Shared.", "共有しました。"],
  "cost.shareCopied": ["공유 시트가 없어 정산 문구를 복사했어요.", "No share sheet, so the text was copied.", "共有シートがないため文章をコピーしました。"],
  "cost.shareFailed": ["공유하지 못했어요 — 브라우저 권한을 확인해 주세요.", "Share failed — check browser permissions.", "共有できませんでした。ブラウザの権限をご確認ください。"],
  "cost.optCart": ["카트", "Cart", "カート"],
  "cost.optCaddie": ["캐디피", "Caddie fee", "キャディフィー"],
  "cost.perTeamValue": ["{n}/팀", "{n}/team", "{n}/組"],

  /* ---------------- 비교표 ---------------- */
  "compare.title": ["후보 비교", "Compare candidates", "候補の比較"],
  "compare.leadSimple": ["라운드 후보를 최대 4곳까지 담아 나란히 비교해요.", "Compare up to four candidates side by side.", "最大4つの候補を並べて比較します。"],
  "compare.leadCols": ["{names} — 그린피·총액·조건·취소 규정을 한 표에서 비교해요. 확인하지 못한 칸은 '미확인'이에요.", "{names} — green fees, totals, conditions and cancellation rules in one table. Unverified cells read 'Not verified'.", "{names} — グリーンフィー・合計・条件・キャンセル規定を1つの表で比較します。未確認の欄は「未確認」です。"],
  "compare.corner": ["항목", "Item", "項目"],
  "compare.go": ["비교표 보기", "View comparison", "比較表を見る"],
  "compare.full": ["비교는 최대 {n}곳까지 담을 수 있어요. 하나를 빼고 담아 주세요.", "You can compare up to {n} courses. Remove one and try again.", "比較は最大{n}件までです。1つ外してから追加してください。"],
  "compare.added": ["비교에 담았어요.", "Added to compare.", "比較に追加しました。"],
  "compare.removed": ["비교에서 뺐어요.", "Removed from compare.", "比較から外しました。"],
  "compare.cleared": ["비교를 비웠어요.", "Comparison cleared.", "比較をクリアしました。"],
  "compare.copyLink": ["비교 링크 복사", "Copy compare link", "比較リンクをコピー"],
  "compare.clear": ["비우기", "Clear", "クリア"],
  "compare.moreOpen": ["추가 정보 펼치기", "Show more rows", "追加情報を開く"],
  "compare.moreClose": ["추가 정보 접기", "Hide extra rows", "追加情報を閉じる"],
  "compare.emptyTitle": ["담은 구장이 없어요", "No courses added", "追加されたゴルフ場がありません"],
  "compare.emptyDesc": ["목록이나 상세에서 <b>비교 담기</b>를 누르면 최대 4곳까지 나란히 볼 수 있어요.", "Press <b>Add to compare</b> on a card to compare up to four.", "一覧や詳細で<b>比較に追加</b>を押すと最大4つまで並べて見られます。"],
  "compare.emptyAction": ["골프장 목록으로", "Back to the list", "ゴルフ場一覧へ"],
  "compare.caption": ["{names} {n}곳 비교", "Comparing {n}: {names}", "{names} {n}件の比較"],
  "compare.sourceNote": ["그린피는 1인 18홀 비회원 기준이에요. 4인 총액은 그린피 × 4 + 카트 + 캐디피(팀 기준)로 계산했고, 확인되지 않은 항목은 빼지 않고 '미확인'으로 두었어요. 가격·재고는 예약 채널에서 최종 확인해 주세요.", "Green fees are per person, 18 holes, non-member. The 4-player total is fee × 4 + cart + caddie (per team); unverified items stay 'Not verified'. Confirm prices and inventory at the booking channel.", "グリーンフィーは1人18ホールのビジター料金です。4人合計はグリーンフィー×4＋カート＋キャディフィー（1組あたり）で計算し、未確認の項目は除かず「未確認」としています。価格・在庫は予約チャネルで最終確認してください。"],
  "compare.linkCopied": ["비교 링크를 복사했어요.", "Compare link copied.", "比較リンクをコピーしました。"],
  "compare.copyFailed": ["복사하지 못했어요.", "Copy failed.", "コピーできませんでした。"],
  "compare.shared": ["공유했어요.", "Shared.", "共有しました。"],
  "compare.shareCopied": ["링크를 복사했어요.", "Link copied.", "リンクをコピーしました。"],
  "compare.shareFailed": ["공유하지 못했어요.", "Share failed.", "共有できませんでした。"],
  "compare.shareTitle": ["CourseBrief 후보 비교", "CourseBrief comparison", "CourseBrief 候補比較"],
  "compare.removeAria": ["{name} 비교에서 빼기", "Remove {name} from compare", "{name} を比較から外す"],
  "compare.row.weekend": ["주말 그린피", "Weekend green fee", "週末グリーンフィー"],
  "compare.row.weekday": ["주중 그린피", "Weekday green fee", "平日グリーンフィー"],
  "compare.row.total4": ["4인 총액", "4-player total", "4人合計"],
  "compare.row.cart": ["카트", "Cart", "カート"],
  "compare.row.caddie": ["캐디피", "Caddie fee", "キャディフィー"],
  "compare.row.players2": ["2인 플레이", "2 players", "2人プレー"],
  "compare.row.nocaddie": ["노캐디", "No caddie", "キャディなし"],
  "compare.row.night": ["야간 라운드", "Night play", "ナイトプレー"],
  "compare.row.lodging": ["숙박", "Lodging", "宿泊"],
  "compare.row.cancel": ["취소·위약", "Cancellation", "キャンセル・違約金"],
  "compare.row.open": ["예약 오픈", "Booking opens", "予約開始"],
  "compare.row.players3": ["3인 플레이", "3 players", "3人プレー"],
  "compare.row.players5": ["5인 플레이", "5 players", "5人プレー"],
  "compare.row.holes": ["홀·형태", "Holes & type", "ホール・形態"],
  "compare.row.rating": ["라운더 평가", "Golfer rating", "ゴルファー評価"],
  "compare.row.place": ["입지", "Location", "立地"],
  "compare.row.rental": ["클럽 렌탈", "Club rental", "クラブレンタル"],
  "compare.row.phone": ["전화", "Phone", "電話"],
  "compare.row.slope": ["슬로프 난이도", "Slope rating", "スロープ難易度"],
  "compare.excluded": ["{labels} 제외", "{labels} excluded", "{labels} 除外"],

  /* ---------------- 위치·교통 ---------------- */
  "loc.title": ["위치 · 교통", "Location & access", "アクセス"],
  "loc.desc": ["주소와 최단 IC, 지도 앱 길찾기, 주차·셔틀 안내. 확인된 값만 적고, 확인되지 않은 항목은 '미확인'으로 보여 드려요.", "Address, nearest IC, map directions, parking and shuttle. Only verified values are given; missing ones read 'Not verified'.", "住所・最寄りIC・地図アプリの経路・駐車場・シャトルの案内。確認済みの値のみ記載し、未確認は「未確認」と表示します。"],
  "loc.address": ["주소", "Address", "住所"],
  "loc.noAddress": ["확인된 주소가 없어요", "No verified address", "確認済みの住所がありません"],
  "loc.noAddressHint": ["지도 앱에서 구장 이름으로 검색하거나 골프장에 전화로 확인하세요.", "Search the course name in a map app or call the course.", "地図アプリでゴルフ場名を検索するか、電話でご確認ください。"],
  "loc.mapLabel": ["지도에서 길찾기", "Directions in map apps", "地図アプリで経路"],
  "loc.mapAria": ["지도 앱에서 길찾기", "Open directions in a map app", "地図アプリで経路を開く"],
  "loc.naver": ["네이버 지도", "Naver Map", "Naverマップ"],
  "loc.kakao": ["카카오맵", "Kakao Map", "Kakaoマップ"],
  "loc.google": ["구글 지도", "Google Maps", "Googleマップ"],
  "loc.go": ["길찾기", "Directions", "経路"],
  "loc.ic": ["최단 IC", "Nearest IC", "最寄りIC"],
  "loc.coord": ["좌표", "Coordinates", "座標"],
  "loc.parking": ["주차", "Parking", "駐車場"],
  "loc.transit": ["셔틀·교통", "Shuttle & transit", "シャトル・交通"],
  "loc.originNote": ["출발지는 지도 앱의 현재 위치를 쓰고, 이 사이트는 위치 정보를 요청하지 않아요.", "Routes start from the map app's current location. This site never asks for your location.", "出発地は地図アプリの現在地を使います。このサイトは位置情報を要求しません。"],
  "loc.missingHint": ["주차·셔틀 정보가 없는 구장이에요. 예약 전에 {target}에 전화로 확인해 주세요.", "Parking or shuttle information is missing. Call {target} before booking.", "駐車場・シャトル情報がないゴルフ場です。予約前に{target}へ電話でご確認ください。"],
  "loc.course": ["골프장", "the course", "ゴルフ場"],

  /* ---------------- 휴장 캘린더 ---------------- */
  "alerts.title": ["휴장·정비 캘린더", "Closure & maintenance calendar", "休場・整備カレンダー"],
  "alerts.lead": ["예약 전에 확인할 휴장·에어레이션·요금 변경 일정을 한곳에 모았어요. 확인된 운영 알림과 공지 제목에서 날짜를 읽은 항목만 보여요.", "Closure, aeration and price-change dates in one place. Only dates read from verified alerts and notice titles are shown.", "予約前に確認すべき休場・エアレーション・料金変更の予定をまとめました。確認済みのお知らせとタイトルから日付を読めた項目のみ表示します。"],
  "alerts.loading": ["불러오는 중…", "Loading…", "読み込み中…"],
  "alerts.failed": ["일정 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", "Could not load the schedule. Please try again shortly.", "予定データを読み込めませんでした。しばらくしてから再度お試しください。"],
  "alerts.statClosure": ["휴장", "Closure", "休場"],
  "alerts.statAeration": ["에어레이션", "Aeration", "エアレーション"],
  "alerts.statFee": ["요금 변경", "Price change", "料金変更"],
  "alerts.statUndated": ["일정 미상", "Undated", "日程不明"],
  "alerts.kindAria": ["일정 종류", "Schedule type", "予定の種類"],
  "alerts.region": ["지역", "Region", "地域"],
  "alerts.includeUndated": ["일정 미상 포함", "Include undated", "日程不明を含む"],
  "alerts.includePast": ["지난 일정 포함({n})", "Include past ({n})", "過去の予定を含む({n})"],
  "alerts.favOnly": ["관심 골프장만", "My courses only", "マイコースのみ"],
  "alerts.none": ["조건에 맞는 일정이 없어요", "No schedules match", "条件に合う予定がありません"],
  "alerts.noneWiden": ["종류·지역 필터를 넓히거나 지난 일정 포함을 켜 보세요.", "Widen the type or region filter, or include past dates.", "種類・地域のフィルターを広げるか、過去の予定を含めてみてください。"],
  "alerts.noneUndated": ["이 종류는 기간이 확인된 일정이 없어요 — '일정 미상 포함'을 켜면 제목만 확인된 항목을 볼 수 있어요.", "No dated items for this type — turn on 'Include undated' to see title-only items.", "この種類には期間が確認できた予定がありません。「日程不明を含む」をオンにすると、タイトルのみ確認できた項目が表示されます。"],
  "alerts.sourceNote": ["이 캘린더는 골프장 공지·운영 알림에서 확인된 일정만 담아요. 공지 본문이 이미지이거나 기간을 읽지 못한 항목은 '일정 미상'으로 남겨 두었어요. 예약 전에 골프장에 확인해 주세요.", "This calendar holds only dates verified from course notices and alerts. Items with image-only bodies or unreadable periods remain 'Undated'. Confirm with the course before booking.", "このカレンダーはゴルフ場のお知らせ・運用通知から確認できた予定のみを載せています。本文が画像、または期間を読めなかった項目は「日程不明」として残しています。予約前にゴルフ場へご確認ください。"],
  "alerts.meta": ["데이터 {date} · {all}건 중 기간 확인 {dated}건", "Data {date} · {dated} of {all} dated", "データ {date}・{all}件中 期間確認 {dated}件"],
  "alerts.groupOngoing": ["진행 중", "In progress", "進行中"],
  "alerts.groupUpcoming": ["예정", "Upcoming", "予定"],
  "alerts.groupUndated": ["일정 미상", "Undated", "日程不明"],
  "alerts.groupPast": ["지난 일정", "Past", "過去の予定"],
  "alerts.hintOngoing": ["오늘이 기간 안에 있는 일정", "Dates that include today", "今日が期間内の予定"],
  "alerts.hintUpcoming": ["앞으로 시작하는 일정", "Dates starting later", "これから始まる予定"],
  "alerts.hintUndated": ["공지 제목에 기간이 없어 날짜를 읽지 못한 항목", "Titles without a readable date range", "タイトルに期間がなく日付を読めなかった項目"],
  "alerts.hintPast": ["이미 지난 일정", "Dates already finished", "すでに終わった予定"],
  "alerts.ongoing": ["진행 중", "In progress", "進行中"],
  "alerts.today": ["오늘", "Today", "今日"],
  "alerts.passed": ["지남", "Passed", "経過"],
  "alerts.undatedBadge": ["일정 미상", "Undated", "日程不明"],
  "alerts.periodUnknown": ["기간 미상", "Period unknown", "期間不明"],
  "alerts.confirmed": ["확인된 알림", "Verified alert", "確認済みの通知"],
  "alerts.fromNotice": ["공지 확인", "From notice", "お知らせ確認"],
  "alerts.fromTitle": ["공지 제목", "Notice title", "お知らせタイトル"],
  "alerts.noTitle": ["제목 없음", "Untitled", "タイトルなし"],
  "alerts.posted": ["게시 {date}", "posted {date}", "掲載 {date}"],
  "alerts.kind.closure": ["휴장", "Closure", "休場"],
  "alerts.kind.aeration": ["에어레이션", "Aeration", "エアレーション"],
  "alerts.kind.fee_change": ["요금 변경", "Price change", "料金変更"],
  "alerts.kind.note": ["참고", "Note", "参考"],
  "alerts.kind.notice": ["공지", "Notice", "お知らせ"],
  "alerts.kind.event": ["행사", "Event", "イベント"],

  /* ---------------- 임베드·공개 API(L4) ---------------- */
  "embed.title": ["구장 카드 임베드", "Embed this course card", "このコースカードを埋め込む"],
  "embed.desc": ["아래 코드를 홈페이지·블로그에 붙이면 이 구장의 요약 카드가 나타나요(1줄, 높이 220px).", "Paste this one-line code into a site or blog to show this course card (220px tall).", "以下のコードをサイトやブログに貼ると、このゴルフ場の概要カードが表示されます（高さ220px）。"],
  "embed.copy": ["임베드 코드 복사", "Copy embed code", "埋め込みコードをコピー"],
  "embed.copied": ["임베드 코드를 복사했어요.", "Embed code copied.", "埋め込みコードをコピーしました。"],
  "embed.failed": ["복사하지 못했어요.", "Copy failed.", "コピーできませんでした。"],
  "embed.preview": ["미리보기", "Preview", "プレビュー"],
  "embed.apiLink": ["공개 데이터 API 안내", "Public data API", "公開データAPI"],
  "embed.viewDetail": ["전체 정보 보기", "See full details", "詳細を見る"],
  "embed.unavailable": ["요금 미확인", "Fee not verified", "料金未確認"],
  "embed.poweredBy": ["CourseBrief 제공", "by CourseBrief", "CourseBrief 提供"],

  /* ---------------- 라운드 플래너(H2·H3·M1) ---------------- */
  "plan.eyebrow": ["라운드 플래너", "Round planner", "ラウンドプランナー"],
  "plan.title": ["내 라운드 날짜로 계산", "Work it out for my date", "自分のラウンド日で計算"],
  "plan.desc": ["취소 마감·예약 오픈·날씨를 한 번에 확인해요. 공휴일은 주말 기준으로 직접 바꿔 주세요.", "Cancellation deadline, booking opening and weather in one place. Switch public holidays to weekend rates yourself.", "キャンセル期限・予約開始・天気をまとめて確認します。祝日は週末扱いにご自身で切り替えてください。"],
  "plan.prep": ["라운드 준비 카드", "Round prep card", "ラウンド準備カード"],
  "plan.date": ["라운드 예정일", "Round date", "ラウンド予定日"],
  "plan.dayAria": ["요일 구분", "Weekday or weekend", "平日・週末の区分"],
  "plan.dayTagAuto": ["{w}요일 · {d} 기준", "{w} · {d} rates", "{w}曜日・{d}基準"],
  "plan.dayOverride": ["{d} 기준(직접 선택)", "{d} rates (manual)", "{d}基準（手動選択）"],
  "plan.quickSat": ["가까운 토요일", "This Saturday", "直近の土曜"],
  "plan.quickNext": ["그다음 토요일", "Next Saturday", "次の土曜"],
  "plan.disclaimer": ["계산값은 규정 문구를 기계적으로 읽어 만든 참고값이에요. 예약·결제 전에 골프장 공식 채널에서 최종 확인해 주세요.{fee}", "These figures come from reading the policy wording automatically — treat them as a guide and confirm with the course before booking or cancelling.{fee}", "計算値は規定文を機械的に読み取った参考値です。予約・キャンセル前にゴルフ場の公式窓口でご確認ください。{fee}"],
  "plan.feeChecked": [" 요금 확인 {date}.", " Fees checked {date}.", " 料金確認 {date}。"],
  "plan.cancelTitle": ["취소 마감", "Cancellation deadline", "キャンセル期限"],
  "plan.openTitle": ["예약 오픈", "Booking opens", "予約開始"],
  "plan.weatherTitle": ["라운드 날씨", "Round weather", "ラウンドの天気"],
  "plan.cancelFail": ["취소 규정을 자동으로 읽지 못했어요. 아래 원문을 보고 골프장에 문의해 주세요.", "The cancellation policy could not be read automatically. Check the source below and ask the course.", "キャンセル規定を自動で読み取れませんでした。下の原文を確認し、ゴルフ場にお問い合わせください。"],
  "plan.openFail": ["오픈 규칙을 자동으로 계산하지 못했어요. 아래 원문을 달력에 직접 적어 두세요.", "The opening rule could not be calculated. Add the date below to your calendar yourself.", "開始ルールを自動計算できませんでした。下の原文をカレンダーに直接登録してください。"],
  "plan.cancelEmpty": ["무료 취소 마감일을 읽지 못했어요. 위약 단계만 확인됐어요.", "The free-cancellation deadline could not be read; only the penalty tiers are verified.", "無料キャンセル期限を読み取れませんでした。違約金の段階のみ確認済みです。"],
  "plan.tierUnknown": ["위약 단계는 원문에서 확인되지 않았어요. 실제 위약은 골프장에 확인해 주세요.", "Penalty tiers were not found in the source. Confirm the actual penalty with the course.", "違約金の段階は原文で確認できませんでした。実際の違約金はゴルフ場にご確認ください。"],
  "plan.memberWarn": ["회원 기준 규정이에요 — 비회원은 다를 수 있어요.", "This is the member policy — non-member terms may differ.", "メンバー基準の規定です。ビジターは異なる場合があります。"],
  "plan.deadlineLabel": ["{d} 라운드 기준 무료 취소 마감", "Free cancellation deadline for a {d} round", "{d}ラウンドの無料キャンセル期限"],
  "plan.openLabel": ["{d} 라운드 기준 예약 오픈", "Booking opens for a {d} round", "{d}ラウンドの予約開始"],
  "plan.timeUnknown": ["시간 미확인", "time not verified", "時間未確認"],
  "plan.passed": ["마감 지남", "deadline passed", "期限超過"],
  "plan.deadlineSub": ["라운드 {days} 전까지 · 이후에 취소하면 아래 위약이 적용돼요.", "Until {days} before the round · later cancellations incur the penalties below.", "ラウンドの{days}前まで・以降のキャンセルは下記の違約金が適用されます。"],
  "plan.borrowed": [" ({d} 전용 규정이 확인되지 않아 {other} 기준을 썼어요)", " (no {d}-only rule was found, so {other} rates were used)", "（{d}専用の規定が確認できず{other}基準を使用）"],
  "plan.addIcs": ["캘린더에 추가", "Add to calendar", "カレンダーに追加"],
  "plan.confirmRecommended": ["골프장 확인 권장", "confirm with the course", "ゴルフ場に確認を推奨"],
  "plan.opened": ["오픈 {n}일 지남", "opened {n} days ago", "{n}日前に開始済み"],
  "plan.todayOpen": ["오늘 오픈", "opens today", "本日開始"],
  "plan.openedNote": ["이미 오픈된 날짜예요 — 남은 티타임은 예약 채널에서 확인해 주세요.", "Booking has already opened — check remaining tee times in a booking channel.", "すでに受付開始済みです。残りのティータイムは予約チャネルでご確認ください。"],
  "plan.memberBasis": ["회원 기준", "member basis", "メンバー基準"],
  "plan.notify30": ["30분 전 알림 포함", "includes a 30-minute reminder", "30分前の通知付き"],
  "plan.m.lottery": ["추첨", "lottery", "抽選"],
  "plan.m.fcfs": ["선착순", "first come", "先着順"],
  "plan.m.online": ["온라인", "online", "オンライン"],
  "plan.m.phone": ["전화", "phone", "電話"],
  "plan.m.onsite": ["현장", "on site", "現地"],
  "plan.wxNoCoord": ["좌표가 확인되지 않아 예보를 불러올 수 없어요.", "No verified coordinates, so the forecast cannot load.", "座標が未確認のため予報を取得できません。"],
  "plan.wxLoading": ["예보를 불러오는 중…", "Loading the forecast…", "予報を読み込み中…"],
  "plan.wxFail": ["예보를 불러오지 못했어요. 네트워크가 되면 다시 확인해 주세요.", "The forecast could not load. Try again when the network is back.", "予報を取得できませんでした。通信が回復したら再度ご確認ください。"],
  "plan.wxStripAria": ["7일 예보 — 날짜를 눌러 선택", "7-day forecast — pick a date", "7日間予報・日付を選択"],
  "plan.wxForecast": ["{date} 예보", "Forecast for {date}", "{date}の予報"],
  "plan.tempUnknown": ["기온 미확인", "temperature not verified", "気温未確認"],
  "plan.pop": ["강수확률", "Precipitation", "降水確率"],
  "plan.precip": ["강수량", "Rainfall", "降水量"],
  "plan.wind": ["최대 풍속", "Max wind", "最大風速"],
  "plan.sun": ["일출·일몰", "Sunrise / sunset", "日の出・日の入り"],
  "plan.wxOut": ["선택한 날짜는 예보 범위(16일) 밖이에요. 가까워지면 다시 확인해 주세요.", "The chosen date is outside the 16-day forecast. Check again closer to the day.", "選択した日付は予報範囲（16日）外です。近づいたら再度ご確認ください。"],
  "plan.storm": ["이 구장 악천후 정산 규정", "This course's bad-weather policy", "このゴルフ場の悪天候精算規定"],
  "plan.stormNote": ["공개 규정 발췌예요. 실제 정산은 골프장에 확인해 주세요.", "Excerpt from the published policy; confirm the actual settlement with the course.", "公開規定の抜粋です。実際の精算はゴルフ場にご確認ください。"],
  "plan.forecastRef": ["참고 예보", "Reference forecast", "参考予報"],
  "plan.forecastSrc": ["Open-Meteo · 실제 날씨와 다를 수 있어요", "Open-Meteo · may differ from actual weather", "Open-Meteo・実際の天気と異なる場合があります"],
  "wx.popLine": ["강수확률 {n}%", "{n}% chance of rain", "降水確率 {n}%"],
  "wx.precipLine": ["예상 강수 {n}mm", "{n}mm expected rain", "予想降水量 {n}mm"],
  "wx.windLine": ["최대 풍속 {n}km/h", "max wind {n}km/h", "最大風速 {n}km/h"],
  "wx.windStrong": ["최대 풍속 {kmh}km/h ({ms}m/s)", "max wind {kmh}km/h ({ms}m/s)", "最大風速 {kmh}km/h（{ms}m/s）"],
  "wx.gustLine": ["돌풍 {n}km/h", "gusts {n}km/h", "突風 {n}km/h"],
  "wx.tmaxLine": ["최고 {n}℃", "high {n}℃", "最高 {n}℃"],
  "wx.tminLine": ["최저 {n}℃", "low {n}℃", "最低 {n}℃"],
  "wx.coldLine": ["최저 {n}℃ 한파", "low {n}℃ — cold snap", "最低 {n}℃ 寒波"],
  "wx.popShort": ["강수 {n}%", "rain {n}%", "降水 {n}%"],
  "wx.windShort": ["바람 {n}km/h", "wind {n}km/h", "風 {n}km/h"],
  "wx.valuesOk": ["예보 값 확인됨", "forecast values verified", "予報値を確認済み"],
  "wx.good": ["라운드하기 좋음", "Good for a round", "ラウンドに良い"],
  "wx.caution": ["주의", "Caution", "注意"],
  "wx.hard": ["어려움", "Difficult", "難しい"],
  "plan.icsDone": ["캘린더 파일을 내려받았어요.", "Calendar file downloaded.", "カレンダーファイルを保存しました。"],
  "plan.icsCancelTitle": ["[코스브리프] {name} 취소 마감", "[CourseBrief] {name} cancellation deadline", "[CourseBrief] {name} キャンセル期限"],
  "plan.icsOpenTitle": ["[코스브리프] {name} 예약 오픈", "[CourseBrief] {name} booking opens", "[CourseBrief] {name} 予約開始"],
  "plan.icsRound": ["라운드: {date}", "Round: {date}", "ラウンド: {date}"],
  "plan.icsRule": ["규정 원문: {text}", "Policy source: {text}", "規定原文: {text}"],
  "plan.icsBasis": ["기준: {text}", "Basis: {text}", "基準: {text}"],
  "plan.icsOpenRule": ["오픈 규정: {text}", "Opening rule: {text}", "開始規定: {text}"],

  "plan.conf.high": ["규정에서 자동 계산", "calculated from the policy", "規定から自動計算"],
  "plan.conf.medium": ["규정에서 자동 계산 · 확인 권장", "calculated from the policy · recheck advised", "規定から自動計算・再確認を推奨"],
  "plan.conf.low": ["원문 확인 필요", "check the source", "原文確認が必要"],
  "plan.rawCancel": ["규정 원문", "Policy source", "規定原文"],
  "plan.rawCancelOpen": ["규정 원문 보기", "Show policy source", "規定原文を見る"],
  "plan.rawOpen": ["오픈 규정 원문", "Opening rule source", "開始規定の原文"],
  "plan.rawOpenOpen": ["오픈 규정 원문 보기", "Show opening rule source", "開始規定の原文を見る"],

  /* ---------------- 예약 채널(H6) ---------------- */
  "ch.title": ["예약 채널", "Booking channels", "予約チャネル"],
  "ch.choose": ["채널 고르기", "Choose a channel", "チャネルを選ぶ"],
  "ch.official": ["공식 홈페이지", "Official website", "公式サイト"],
  "ch.officialNote": ["요금표·예약 안내", "rate card & booking info", "料金表・予約案内"],
  "ch.searchOn": ["채널에서 구장명 검색", "search the course name in the channel", "チャネル内でゴルフ場名を検索"],
  "ch.kakao": ["카카오골프예약", "Kakao Golf", "Kakaoゴルフ"],
  "ch.teescanner": ["골프존 티스캐너", "Golfzon Teescanner", "Golfzonティースキャナー"],
  "ch.smartscore": ["스마트스코어", "SmartScore", "SmartScore"],
  "ch.teepick": ["티픽 골프장", "Teepick", "Teepick"],
  "ch.teepickNote": ["관측 실거래·예약", "observed deals & booking", "観測実取引・予約"],
  "ch.naver": ["네이버 검색", "Naver search", "Naver検索"],
  "ch.naverNote": ["예약·후기 검색", "booking & reviews", "予約・レビュー"],
  "ch.tel": ["전화 예약", "Call to book", "電話予約"],
  "ch.note": ["{name} — 가격·재고는 채널에서 확인해 주세요. 코스브리프는 예약을 대행하지 않아요.", "{name} — check prices and availability in the channel. CourseBrief does not take bookings.", "{name} — 価格・在庫はチャネルでご確認ください。CourseBriefは予約を代行しません。"],
  "ch.sheetNote": ["플랫폼 채널은 구장별 주소를 공개하지 않아, 채널 안에서 구장명으로 검색해요. 가격·재고는 채널에서 확인해 주세요. 코스브리프는 예약을 대행하지 않아요.", "Platform channels do not publish per-course URLs, so search for the course name inside them. Prices and availability are confirmed in the channel. CourseBrief does not take bookings.", "プラットフォームはゴルフ場別URLを公開していないため、チャネル内でゴルフ場名を検索します。価格・在庫はチャネルでご確認ください。CourseBriefは予約を代行しません。"],
  "ch.copyName": ["구장명 복사", "Copy course name", "ゴルフ場名をコピー"],
  "ch.nameCopied": ["구장명을 복사했어요.", "Course name copied.", "ゴルフ場名をコピーしました。"],
  "ch.copyFailed": ["복사하지 못했어요.", "Copy failed.", "コピーできませんでした。"],
  "ch.feeFrom": [" · 그린피 {fee}~", " · green fee from {fee}", "・グリーンフィー {fee}〜"],

  /* ---------------- 언어 ---------------- */
  "lang.label": ["언어", "Language", "言語"],
  "lang.note": [
    "화면 문구만 번역해요. 골프장 이름·공지·규정은 한국어 원문 그대로예요.",
    "Only interface text is translated. Course names, notices and policies stay in the original Korean.",
    "画面の文言のみ翻訳します。ゴルフ場名・お知らせ・規定は韓国語の原文のままです。",
  ],
  "lang.changed": ["언어를 {label}(으)로 바꿨어요.", "Language set to {label}.", "言語を{label}に変更しました。"],
};

/* ------------------------------------------------------------------ */
/* 상태                                                                */
/* ------------------------------------------------------------------ */

function detect(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "ko" || saved === "en" || saved === "ja") return saved;
  } catch {
    // 저장소 차단 환경 — 브라우저 언어로 시작한다
  }
  const nav = (navigator.language || "ko").toLowerCase();
  if (nav.startsWith("ja")) return "ja";
  if (nav.startsWith("en")) return "en";
  return "ko";
}

let current: Lang = detect();
const listeners: Array<(lang: Lang) => void> = [];

export function getLang(): Lang {
  return current;
}

export function langOption(code: Lang = current): LangOption {
  return LANGS.find((l) => l.code === code) ?? LANGS[0];
}

/** 언어를 바꾸고 화면을 다시 그리게 한다. 같은 값이면 아무 일도 하지 않는다. */
export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // 저장 실패는 이번 방문에만 적용된다
  }
  applyStaticI18n(document);
  for (const fn of listeners) fn(lang);
}

export function onLangChange(fn: (lang: Lang) => void): void {
  listeners.push(fn);
}

/* ------------------------------------------------------------------ */
/* 번역                                                                */
/* ------------------------------------------------------------------ */

function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m: string, key: string) => (key in vars ? String(vars[key]) : m));
}

/** 키 → 현재 언어 문구. 사전에 없으면 키를 그대로 돌려준다(화면이 비지 않게). */
export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = DICT[key];
  if (!entry) return key;
  return fill(entry[LANG_INDEX[current]], vars);
}

/** 사전에 키가 있는지 — 검사 스크립트·개발용 */
export function hasKey(key: string): boolean {
  return key in DICT;
}

/** 사전 키 목록(검사 스크립트가 빌드 산출물에서 읽는다) */
export function dictKeys(): string[] {
  return Object.keys(DICT);
}

/* ------------------------------------------------------------------ */
/* 값 표기 도우미                                                      */
/* ------------------------------------------------------------------ */

/** 금액 — 한국어는 `185,000원`, 영어·일본어는 `₩185,000` */
export function money(n: number): string {
  const text = Math.round(n).toLocaleString("en-US");
  return current === "ko" ? `${text}원` : `₩${text}`;
}

/** 만원 단위 축약 — 지도 핀처럼 좁은 자리 */
export function manwonLabel(n: number): string {
  const man = n / 10000;
  const text = Number.isInteger(man) ? man.toLocaleString("en-US") : man.toFixed(1);
  return current === "ko" ? `${text}만` : `₩${text}만`;
}

/** 이용형태(데이터는 한국어) → 화면 언어 */
export function membership(value: string | null | undefined): string {
  if (!value) return "";
  if (value === "대중제") return t("type.public");
  if (value === "회원제") return t("type.member");
  if (value === "비회원제") return t("type.nonmember");
  return value;
}

/** 골프장이 쓴 한국어 원문을 그대로 보여 준다는 사실을 알리는 한 줄(한국어 화면에서는 빈 문자열) */
export function originalNote(): string {
  return current === "ko" ? "" : t("detail.noticeKorean");
}

/* ------------------------------------------------------------------ */
/* 정적 HTML(data-i18n)                                                */
/* ------------------------------------------------------------------ */

/**
 * index.html 의 고정 마크업을 현재 언어로 채운다.
 *  - `data-i18n="key"`        : 텍스트
 *  - `data-i18n-aria="key"`   : aria-label
 *  - `data-i18n-title="key"`  : title
 *  - `data-i18n-placeholder="key"` : placeholder
 */
export function applyStaticI18n(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  }
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-aria]")) {
    const key = el.dataset.i18nAria;
    if (key) el.setAttribute("aria-label", t(key));
  }
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-title]")) {
    const key = el.dataset.i18nTitle;
    if (key) el.setAttribute("title", t(key));
  }
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-placeholder]")) {
    const key = el.dataset.i18nPlaceholder;
    if (key) el.setAttribute("placeholder", t(key));
  }
  document.documentElement.setAttribute("lang", langOption().html);
}
