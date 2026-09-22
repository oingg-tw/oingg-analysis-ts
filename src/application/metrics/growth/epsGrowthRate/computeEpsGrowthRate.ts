import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { calculateYoyGrowthRate, toPerShareExact } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { isComputationSkip, type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 三張季度財報表金額單位是「千元」，流通股數是實際股數，分子要先 x1000 換算成元（跟 eps.ts 一致）。
// 2026-09-22 formulaVersion 2：EPS 中繼值不再四捨五入到分——web-nuxt 實測台泥 2026Q1 用進位值算 28.57%、真值 36.2%
// （0.07 → 0.09 兩個都是進位後的數字），小 EPS 公司的年增率整個失真；只在最後的百分比四捨五入一次。
export const EPS_GROWTH_RATE_FORMULA_VERSION = 2;
const toEps = (netIncomeInThousands: bigint | null, shares: bigint | null): number | null => {
  if (netIncomeInThousands === null || shares === null || shares === 0n) return null;
  return toPerShareExact(netIncomeInThousands, shares);
};


export type EpsGrowthRateDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

export type EpsGrowthRateComputationBatch = ComputationBatch<'q'>;

// EPS 成長率（單季年增率）= (本季 EPS - 去年同季 EPS) / |去年同季 EPS| * 100——獨立重新計算
// 本季/去年同季各自的 EPS（不依賴 eps 這個 metric_code 已寫入的值，跟 sgr 對 roe/
// dividendPayoutRatio 的既有做法一致），流通股數各自用當下報告日對應的股本（不是固定用
// 本季股本回推去年，避免股本異動時失真）。只有 Q 一種 basis。
export const computeEpsGrowthRate = async (query: QuarterlyMetricQuery, deps: EpsGrowthRateDeps): Promise<EpsGrowthRateComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await deps.statements.getIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;
  const currentShares = reportDate ? (await deps.shares.getPaidInShares(symbol, reportDate))?.paidInShares ?? null : null;
  const currentEps = toEps(pickNetIncome(incomeStatement).value, currentShares);

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorIncomeStatement = await deps.statements.getIncomeStatement({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorReportDate = priorIncomeStatement?.reportDate ?? null;
  const priorShares = priorReportDate ? (await deps.shares.getPaidInShares(symbol, priorReportDate))?.paidInShares ?? null : null;
  const priorEps = toEps(pickNetIncome(priorIncomeStatement).value, priorShares);

  const { value: growthRate, nullReason } = calculateYoyGrowthRate(currentEps, priorEps);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'epsGrowthRate', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', growthRate, nullReason);

  return { symbol, rocYear: year, season, slots: { q: isComputationSkip(q) ? q : { ...q, formulaVersion: EPS_GROWTH_RATE_FORMULA_VERSION } } };
};
