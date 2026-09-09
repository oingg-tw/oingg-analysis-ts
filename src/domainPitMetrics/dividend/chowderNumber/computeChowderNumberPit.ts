import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/shared/sourceData/capitalStock';
import { getDailyValuationAsOf } from '@/shared/sourceData/twseMarketData';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

// Chowder Number（Seeking Alpha 社群規則）= 現金殖利率 + 股利五年成長率，門檻 ≥12%（公用
// 事業 8%）——門檻本身只記在這裡的說明供對照，不做「通過/不通過」判定（平台不自產「便宜/
// 安全/通過」這類判讀，只回傳原始數字，見指標矩陣文件的平台原則）。
//
// 兩個成分都獨立重新計算，不依賴 dividendYield/dividendGrowthRate5y 兩個 metric_code
// 已寫入的值：
// - 殖利率沿用 dividendYield 的資料源（TWSE/TPEx 官方每日公布，export.daily_valuation.
//   dividend_yield passthrough），取 knowledge_date 當天或之前最近一筆。
// - 股利五年成長率沿用 dividendGrowthRate/computeDividendGrowthRateFamilyPit.ts 同一套
//   現金流量近似邏輯（variant_of，不是精確宣告股利，見那個檔案的說明），這裡重新算一次
//   5 年版本，不是讀已寫入的 dividendGrowthRate5y。
//
// 任一成分缺漏（殖利率查無資料，或五年成長率資料不足）整體視為缺漏，不用「補 0」讓
// Chowder Number 看起來算得出來——那會低估真實情況（漏掉的那一半可能是負值也可能是正值，
// 不該假設是 0）。

const DIVIDEND_GROWTH_LOOKBACK_YEARS = 5;

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface ChowderNumberPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  fy: BasisOutcome;
}

const getAnnualDividendPerShareProxy = async (
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string
): Promise<number | null> => {
  const quarters = await Promise.all(
    [1, 2, 3, 4].map((quarter) => getQuarterlyCashFlowStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  if (quarters.some((q) => q === null || q.dividendsPaid === null)) return null;

  const yearSum = quarters.reduce((sum, q) => sum + q!.dividendsPaid!, 0n);
  const dividendsPaidAbs = yearSum < 0n ? -yearSum : yearSum;
  const q4ReportDate = quarters[3]!.reportDate;
  const shares = await getPaidInSharesAsOf(symbol, q4ReportDate);
  if (!shares) return null;

  return (Number(dividendsPaidAbs) * 1000) / Number(shares.paidInShares);
};

export const computeAndWriteChowderNumberPit = async (query: QuarterlyMetricQuery): Promise<ChowderNumberPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, fy: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainCashFlow = await getQuarterlyCashFlowStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: mainCashFlow?.reportDate ?? null }]);

  const dailyValuation = mainAnchor ? await getDailyValuationAsOf(symbol, mainAnchor.knowledgeDate) : null;
  const dividendYieldPct = dailyValuation?.dividendYield ?? null;

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const [currentDps, priorDps] = await Promise.all([
    getAnnualDividendPerShareProxy(symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId),
    getAnnualDividendPerShareProxy(symbol, latestCompleteFiscalYear - DIVIDEND_GROWTH_LOOKBACK_YEARS, dataType, subsidiaryCompanyId),
  ]);

  const dividendGrowthRatePct =
    currentDps !== null && priorDps !== null && priorDps > 0
      ? Math.round((Math.pow(currentDps / priorDps, 1 / DIVIDEND_GROWTH_LOOKBACK_YEARS) - 1) * 100 * 100) / 100
      : null;

  const chowderNumber = dividendYieldPct !== null && dividendGrowthRatePct !== null ? Math.round((dividendYieldPct + dividendGrowthRatePct) * 100) / 100 : null;

  let nullReason: MetricNullReason | null = null;
  if (chowderNumber === null) {
    nullReason = dividendYieldPct === null || currentDps === null || priorDps === null ? 'insufficient_history' : 'missing_input';
  }

  const coordinateBase = { symbol, metricCode: 'chowderNumber', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let fy: BasisOutcome;
  if (!mainAnchor) {
    fy = { action: 'skipped_no_knowledge_date' };
  } else {
    fy = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('FY'),
      value: chowderNumber,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, fy };
};
