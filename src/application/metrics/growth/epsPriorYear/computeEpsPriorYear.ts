import { resolveKnowledgeDate } from '../../knowledgeDate';
import { type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveEpsGrowthRateInputs, type EpsGrowthRateDeps } from '../epsGrowthRate/computeEpsGrowthRate';

// 去年同季每股盈餘（換算到本季股數基準）＝ epsGrowthRate 算式裡的分母、不取絕對值。跟 epsGrowthRate 共用
// resolveEpsGrowthRateInputs，兩支永遠用同一個數字；只在這裡四捨五入到分（跟 eps 一致），年增率那邊照舊用未進位的值。
// knowledge date 錨在本季（跟 epsGrowthRate 同座標），因為「換算到本季股數基準」要等本季報告日才確定。
export const resolveEpsPriorYear = async (query: QuarterlyMetricQuery, deps: EpsGrowthRateDeps) => {
  const r = await resolveEpsGrowthRateInputs(query, deps);
  if (!r) return null;
  const value = r.priorEps === null ? null : Math.round((r.priorEps / r.splitFactor) * 100) / 100;
  // 去年同季損益表整份缺 → insufficient_history；表在但淨利或股數缺 → missing_input。
  const nullReason = value !== null ? null : r.priorIncomeStatement === null ? ('insufficient_history' as const) : ('missing_input' as const);
  return { ...r, value, nullReason };
};

export const computeEpsPriorYear = async (query: QuarterlyMetricQuery, deps: EpsGrowthRateDeps): Promise<ComputationBatch<'q'>> => {
  const r = await resolveEpsPriorYear(query, deps);
  if (!r) return noQuarterBatch(query.symbol, ['q']);

  const mainAnchor = await resolveKnowledgeDate(r.symbol, [{ rocYear: r.rocYear, season: r.seasonNum, reportDate: r.reportDate }], deps.announcements);
  const coordinateBase = { symbol: r.symbol, metricCode: 'epsPriorYear', fiscalYear: r.fiscalYear, fiscalQuarter: r.seasonNum, dataType: query.dataType, subsidiaryCompanyId: query.subsidiaryCompanyId };
  const q = periodSlot(mainAnchor, coordinateBase, 'Q', r.value, r.nullReason);
  return { symbol: r.symbol, rocYear: r.year, season: r.season, slots: { q } };
};
