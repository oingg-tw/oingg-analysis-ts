import type { AppDeps } from '@/application/deps';
import type { PitDeps } from '@/application/metrics/deps';
import { evaluateCompanyBadges, type CompanyBadgeCategory } from '@/application/metrics/shared/badges/evaluateCompanyBadges';
import { evaluateCompanyMetricCompleteness, type CompanyMetricCompletenessCategory } from '@/application/metrics/shared/completeness/evaluateCompanyMetricCompleteness';
import { getPiotroskiFScoreBreakdown, type PiotroskiFScoreBreakdown } from '@/application/metrics/quality/piotroskiFScore/getPiotroskiFScoreBreakdown';
import type { PiotroskiFScoreDeps } from '@/application/metrics/quality/piotroskiFScore/computePiotroskiFScore';
import { createProvenanceResolvers, type ProvenanceResolvers } from '@/application/metrics/shared/provenance/provenanceResolvers';
import type { MetricProvenanceResponse } from '@/application/metrics/shared/provenance/provenanceTypes';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import type { PeriodType as BasisPeriodType } from '@/domain/metrics/metricBasis';

// 季報型的四種期別（metricBasis 的 PeriodType 還含逐日型座標用的 'N/A'，這裡用不到）。
type PeriodType = Exclude<BasisPeriodType, 'N/A'>;
import { restatePerShareProvenance } from '@/application/metrics/shared/restatePerShareHistory';
import type { Season } from '@/domain/calendar/rocQuarter';

// 2026-09-17 Phase 4：GET /companies/{badges,metric-completeness,piotroski-breakdown,:symbol/metric-provenance}
// 四支「現查現算」端點的薄 use case——原本各自一支 controller，這裡只做「組回應形狀 + 把 deps 交下去」。
// dataType/subsidiaryCompanyId 固定 '2'/''，跟 metric-history 同一個慣例，不對外曝露。

export interface CompanyBadgesResult {
  symbol: string;
  categories: CompanyBadgeCategory[];
}

// 2026-09-13 使用者要求：前端原本拿 GET /metrics 的 badge.threshold 自己跟 metric-history
// 的數值土法煉鋼比較「達成/未達成」，已證實會出錯。這支端點統一由後端算好每支 badge
// 的 passed，前端只管呈現，範圍限定在有 badge 的指標（見 evaluateCompanyBadges.ts）。
// 2026-09-21：deps 多兩個 port（industryReference/companyProfiles）——percentileRank 徽章要查
// 公司自己的證交所類股代碼、展開同類股成分股，見 evaluateCompanyBadges.ts 的 resolveCandidateSymbols。
export const getCompanyBadges = async (symbol: string, deps: Pick<AppDeps, 'metricValueQueries' | 'industryReference' | 'companyProfiles' | 'reportAvailability'>): Promise<CompanyBadgesResult> => {
  const categories = await evaluateCompanyBadges(symbol, deps);
  return { symbol, categories };
};

export interface CompanyMetricCompletenessResult {
  symbol: string;
  coveredCount: number;
  totalCount: number;
  categories: CompanyMetricCompletenessCategory[];
}

// 2026-09-13 使用者要求：掃過 GET /metrics 全部指標，各自查一筆代表性 timeframe 的最新值，回傳
// hasValue/nullReason——資料品質稽核/前端「這家公司資料涵蓋度」呈現，不是「達成/未達成」判定。
export const getCompanyMetricCompleteness = async (symbol: string, deps: Pick<AppDeps, 'metricValueQueries' | 'reportAvailability'>): Promise<CompanyMetricCompletenessResult> => {
  const categories = await evaluateCompanyMetricCompleteness(symbol, deps);
  const coveredCount = categories.reduce((sum, category) => sum + category.coveredCount, 0);
  const totalCount = categories.reduce((sum, category) => sum + category.totalCount, 0);
  return { symbol, coveredCount, totalCount, categories };
};

export interface QuarterlyLookupQuery {
  symbol: string;
  year?: string | undefined; // 民國年，跟 season 成對；不給就自動抓最新一季
  season?: Season | undefined;
}

// 2026-09-10 web-nuxt 要求：piotroskiFScore 只寫入最終 0-9 分，9 個子訊號依 Piotroski (2000)
// 原始論文的分組現查現算回傳，不是新的 metric_code。查無資料（found: false）是正常情境，不是 404。
export const getCompanyPiotroskiBreakdown = async ({ symbol, year, season }: QuarterlyLookupQuery, deps: PiotroskiFScoreDeps & Pick<AppDeps, 'reportAvailability'>): Promise<PiotroskiFScoreBreakdown> =>
  getPiotroskiFScoreBreakdown({ symbol, year, season, dataType: year !== undefined && season !== undefined ? await deps.reportAvailability.resolveDataTypeForPeriod(symbol, Number(year), Number(season)) : await deps.reportAvailability.resolveDataType(symbol), subsidiaryCompanyId: '' }, deps);

export type ProvenanceMetricCode = keyof ProvenanceResolvers;

export interface GetCompanyMetricProvenanceQuery {
  metricCode: ProvenanceMetricCode;
  year?: string | undefined;
  season?: Season | undefined;
  asOfDate?: string | undefined; // YYYY-MM-DD，逐日／月頻指標用
  periodType?: PeriodType | undefined;
}

// 2026-10-01 溯源表描述的期別：實測（tmp/inferProvBasis.ts，56 支多期別季報型指標逐一拿溯源 value 對儲存的 Q／TTM／FY）全部是近四季，
// 所以規則是「指標有 TTM 就是 TTM，否則是它唯一允許的期別」；逐日／月頻指標回 null。之後某支溯源要提供單季，
// 這裡改成看呼叫端要求的期別，不再推斷。
// ponytail: 用規則推斷而不是每支 resolver 自己宣告，新增「溯源提供多期別」的指標時要回來改這裡。
const provenancePeriodType = (metricCode: string): PeriodType | null => {
  const def = metricDefinitionRegistry[metricCode];
  if (!def || def.group !== 'period') return null;
  if (def.provenancePeriodType) return def.provenancePeriodType;
  const allowed = def.allowedPeriodTypes ?? [];
  const periodTypes = allowed.filter((p): p is PeriodType => p !== 'N/A');
  return periodTypes.includes('TTM') ? 'TTM' : (periodTypes[0] ?? null);
};

// 2026-09-10 web-nuxt 要求：讓使用者點擊徽章上的數字時，能看到這個數字實際用了哪些原始
// 財報欄位、各自的值，跳轉到會計模式（GET /companies/financial-statement）對應的那一列。
// 現查現算，不持久化。試點範圍見 PILOT_PROVENANCE_METRIC_CODES——metricCode 在 http schema 用
// z.enum 驗證，不支援的指標直接被擋成 400。resolver 對應表見 provenanceResolvers.ts。
// 2026-10-01 每股類指標的 value 換算到今天的股數基準，跟 metric-history 顯示的一致（見 restatePerShareProvenance）。
export const getCompanyMetricProvenance = async (symbol: string, { metricCode, year, season, asOfDate, periodType }: GetCompanyMetricProvenanceQuery, deps: PitDeps & Pick<AppDeps, 'reportAvailability'>): Promise<MetricProvenanceResponse> => {
  const provided = provenancePeriodType(metricCode);
  if (periodType !== undefined && provided !== null && periodType !== provided) {
    return { symbol, metricCode, found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: `這支指標的溯源表目前只提供 ${provided}（要求的是 ${periodType}）。`, timeframe: provided };
  }
  const result = await restatePerShareProvenance(
    await createProvenanceResolvers(deps)[metricCode]({
      symbol,
      year,
      season,
      asOfDate: asOfDate === undefined ? undefined : new Date(`${asOfDate}T00:00:00Z`),
      dataType: year !== undefined && season !== undefined ? await deps.reportAvailability.resolveDataTypeForPeriod(symbol, Number(year), Number(season)) : await deps.reportAvailability.resolveDataType(symbol),
      subsidiaryCompanyId: '',
    }),
    deps
  );
  return { ...result, timeframe: provided };
};
