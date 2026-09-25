import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toMultipleFromThousands } from '@/domain/metrics/shared/numericHelpers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { type ComputationBatch, noQuarterBatch, periodSlot, withFormulaVersion } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
export const PRICE_TO_RESEARCH_RATIO_FORMULA_VERSION = 2;

// 量化選股盤點使用者要求新增。研發費用查法同 rdIntensity（只有 XBRL 寬表有這個欄位，
// 舊表沒有 fallback）；市值查詢邏輯同 evEbitda/psr。只有 TTM 一種 basis。

const getResearchAndDevelopmentExpense = async (key: { symbol: string; year: number; quarter: number; dataType: string; subsidiaryCompanyId: string }, deps: PriceToResearchRatioDeps): Promise<bigint | null> => {
  return deps.xbrlAccounts.getResearchAndDevelopmentExpense(key);
};


export type PriceToResearchRatioDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'market' | 'xbrlAccounts'>;

export type PriceToResearchRatioComputationBatch = ComputationBatch<'ttm'>;

export const computePriceToResearchRatio = async (
  query: QuarterlyMetricQuery,
  deps: PriceToResearchRatioDeps
): Promise<PriceToResearchRatioComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const currentIncome = await deps.statements.getIncomeStatement(key);
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: currentIncome?.reportDate ?? null }], deps.announcements);
  const marketCap = mainAnchor ? await deps.market.getMarketCap(symbol, mainAnchor.knowledgeDate) : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const rdRecords = await Promise.all(
    ttmQuarters.map((tq) => getResearchAndDevelopmentExpense({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }, deps))
  );

  let rdTtmSum = 0n;
  let ttmComplete = true;
  for (const rd of rdRecords) {
    if (rd === null) {
      ttmComplete = false;
    } else {
      rdTtmSum += rd;
    }
  }

  const ttmValue = ttmComplete && marketCap !== null ? toMultipleFromThousands(marketCap.marketCap, rdTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? (marketCap === null ? 'missing_input' : 'zero_or_negative_denominator') : 'insufficient_history';

  const coordinateBase = { symbol, metricCode: 'priceToResearchRatio', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const ttm = periodSlot(mainAnchor, coordinateBase, 'TTM', ttmValue, ttmNullReason);

  return { symbol, rocYear: year, season, slots: withFormulaVersion({ ttm }, PRICE_TO_RESEARCH_RATIO_FORMULA_VERSION) };
};
