import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { pickNetIncome } from '@/domainPitMetrics/shared/pickers';
import { financialDataAdapter, type IncomeStatementPort, type CashFlowStatementPort, type MarketCapPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeOrSkip } from '../../metricValueWriter';
import type { StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// Warren Buffett「一美元原則」（One Dollar Premise，1983 年 Berkshire Hathaway 致股東信）：
// 公司每保留一美元盈餘不發放，長期應該至少為股東創造一美元市值，否則這些保留下來的錢還不如
// 直接發還給股東。這裡用 5 個完整會計年度當窗口：分子是這 5 年市值的淨變化（期末市值 - 期初
// 市值），分母是這 5 年累計保留盈餘（= 5 年淨利加總 - 5 年股利發放現金加總，兩者皆取絕對值
// 處理的口徑跟 dividendCoverageRatio/shareholderYield 一致）。只有 FY 一種 basis——這是
// 長期資本配置能力的檢驗，季度數字沒有意義。

const YEARS_WINDOW = 5;

interface AnnualFigures {
  netIncome: bigint | null;
  dividendsPaid: bigint | null;
}

const getAnnualFigures = async (
  cache: Map<number, AnnualFigures>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string,
  statements: IncomeStatementPort & CashFlowStatementPort
): Promise<AnnualFigures> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  const quarters = await Promise.all(
    [1, 2, 3, 4].map((quarter) =>
      Promise.all([
        statements.getIncomeStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }),
        statements.getCashFlowStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }),
      ])
    )
  );

  let netIncomeSum = 0n;
  let dividendsSum = 0n;
  let complete = true;
  for (const [incomeRecord, cashFlowRecord] of quarters) {
    const picked = pickNetIncome(incomeRecord);
    if (picked.value === null || cashFlowRecord === null) {
      complete = false;
    } else {
      netIncomeSum += picked.value;
      dividendsSum += cashFlowRecord.dividendsPaid ?? 0n; // 缺漏視為 0（大多數季度本來就沒發放）
    }
  }

  const result: AnnualFigures = complete ? { netIncome: netIncomeSum, dividendsPaid: dividendsSum } : { netIncome: null, dividendsPaid: null };
  cache.set(rocYear, result);
  return result;
};

export type OneDollarTestPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteOneDollarTestPit = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & CashFlowStatementPort & MarketCapPort = financialDataAdapter
): Promise<OneDollarTestPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, fy: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainIncomeStatement = await statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: mainIncomeStatement?.reportDate ?? null }]);

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const baseFiscalYear = latestCompleteFiscalYear - YEARS_WINDOW;

  const cache = new Map<number, AnnualFigures>();
  const yearsToSum: number[] = [];
  for (let y = baseFiscalYear + 1; y <= latestCompleteFiscalYear; y++) yearsToSum.push(y);

  const annualFigures = await Promise.all(yearsToSum.map((y) => getAnnualFigures(cache, symbol, y, dataType, subsidiaryCompanyId, statements)));

  let cumulativeNetIncome = 0n;
  let cumulativeDividends = 0n;
  let windowComplete = true;
  for (const figures of annualFigures) {
    if (figures.netIncome === null || figures.dividendsPaid === null) {
      windowComplete = false;
    } else {
      cumulativeNetIncome += figures.netIncome;
      cumulativeDividends += figures.dividendsPaid;
    }
  }
  const dividendsAbs = cumulativeDividends < 0n ? -cumulativeDividends : cumulativeDividends;
  const cumulativeRetainedEarnings = windowComplete ? cumulativeNetIncome - dividendsAbs : null;

  // 期末/期初市值：分別取「最近一個完整會計年度」跟「5 年前那個完整會計年度」Q4 的報告日
  // 當下市值——跟 CAGR 家族用完整會計年度當基準點是同一種簡化，不逐季追蹤市值曲線。
  const [currentQ4, baseQ4] = await Promise.all([
    statements.getIncomeStatement({ symbol, year: latestCompleteFiscalYear, quarter: 4, dataType, subsidiaryCompanyId }),
    statements.getIncomeStatement({ symbol, year: baseFiscalYear, quarter: 4, dataType, subsidiaryCompanyId }),
  ]);
  const [currentMarketCap, baseMarketCap] = await Promise.all([
    currentQ4?.reportDate ? statements.getMarketCap(symbol, currentQ4.reportDate) : null,
    baseQ4?.reportDate ? statements.getMarketCap(symbol, baseQ4.reportDate) : null,
  ]);

  let value: number | null = null;
  let nullReason: MetricNullReason | null = null;
  if (!windowComplete) {
    nullReason = 'insufficient_history';
  } else if (cumulativeRetainedEarnings === null || cumulativeRetainedEarnings <= 0n) {
    // 累計保留盈餘為 0 或負值（例如長期虧損或股利發得比淨利還多），一美元原則的除法本身沒有意義。
    nullReason = 'zero_or_negative_denominator';
  } else if (!currentMarketCap || !baseMarketCap) {
    nullReason = 'missing_input';
  } else {
    const marketValueCreated = currentMarketCap.marketCap - baseMarketCap.marketCap;
    // 累計保留盈餘單位是千元，市值單位是元，x1000 換算成同一單位（跟 buybackYield.ts 2026-09-13
    // 修正過的量綱換算同一套做法）。
    value = Math.round((marketValueCreated / (Number(cumulativeRetainedEarnings) * 1000)) * 100) / 100;
  }

  const coordinateBase = { symbol, metricCode: 'oneDollarTest', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };
  const fy = await writeOrSkip(mainAnchor, coordinateBase, 'FY', value, nullReason);

  return { symbol, rocYear: year, season, fy };
};
