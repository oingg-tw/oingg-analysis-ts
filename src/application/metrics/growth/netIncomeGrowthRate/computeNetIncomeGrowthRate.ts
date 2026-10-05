import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { calculateYoyGrowthRateBigint } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingIncomeStatements, sumTrailingPeriods } from '@/application/metrics/shared/trailingYear';
import { annualReportSlot, getPriorAnnualIncomeStatement, resolveAnnualReportContext } from '@/application/metrics/shared/annualReportSlot';
import type { CalcResult } from '@/domain/metrics/shared/numericHelpers';

export type NetIncomeGrowthRateDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'cumulativeStatements' | 'annualReports' | 'shares'>;

export type NetIncomeGrowthRateComputationBatch = ComputationBatch<'q' | 'ttm' | 'fy'>;

// 淨利成長率（單季年增率）= (本季淨利 - 去年同季淨利) / |去年同季淨利| * 100。淨利優先採
// 歸屬母公司口徑，缺漏退回整體口徑（比照 pickNetIncome 既有規則）。只有 Q 一種 basis。
export const computeNetIncomeGrowthRate = async (query: QuarterlyMetricQuery, deps: NetIncomeGrowthRateDeps): Promise<NetIncomeGrowthRateComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q', 'ttm', 'fy']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await deps.statements.getIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;
  const currentNetIncome = pickNetIncome(incomeStatement).value;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorIncomeStatement = await deps.statements.getIncomeStatement({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorNetIncome = pickNetIncome(priorIncomeStatement).value;

  const { value: growthRate, nullReason } = calculateYoyGrowthRateBigint(currentNetIncome, priorNetIncome);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'netIncomeGrowthRate', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', growthRate, nullReason);

  // 2026-10-05 近四季（TTM）與年度（FY）：web-nuxt 指標頁要期別切換器（使用者：「其餘比率的期別等 web-nuxt 有頁面要用再做」）。
  // TTM＝近四季加總 vs 去年同期的近四季加總（興櫃半年段照 trailingYear 推）；FY＝年報全年 vs 上一年度年報。任一邊不齊為 insufficient_history。
  // 溯源表維持單季（definition 的 provenancePeriodType）。
  const yoy = (current: bigint | null, prior: bigint | null): CalcResult => (current === null || prior === null ? { value: null, nullReason: 'insufficient_history' } : calculateYoyGrowthRateBigint(current, prior));
  const trailing = (y: number) => resolveTrailingIncomeStatements({ symbol, rocYear: y, season: season as Season, dataType, subsidiaryCompanyId }, deps).then((t) => sumTrailingPeriods(t.periods, (r) => pickNetIncome(r).value));
  const [currentTtm, priorTtm] = await Promise.all([trailing(rocYear), trailing(rocYear - 1)]);
  const ttmCalc = yoy(currentTtm, priorTtm);
  const ttm = periodSlot(mainAnchor, coordinateBase, 'TTM', ttmCalc.value, ttmCalc.nullReason);

  const annual = await resolveAnnualReportContext({ symbol, rocYear, season: seasonNum, dataType, subsidiaryCompanyId }, deps);
  const priorAnnual = await getPriorAnnualIncomeStatement(annual, { symbol, dataType, subsidiaryCompanyId }, deps);
  const fy = annualReportSlot(annual, { symbol, metricCode: 'netIncomeGrowthRate', dataType, subsidiaryCompanyId }, yoy(annual ? pickNetIncome(annual.annual).value : null, priorAnnual ? pickNetIncome(priorAnnual).value : null));

  return { symbol, rocYear: year, season, slots: { q, ttm, fy } };
};
