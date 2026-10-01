import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { type ComputationBatch, noQuarterBatch, periodSlot, withFormulaVersion } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingCashFlowStatements, resolveTrailingIncomeStatements, type TrailingYear } from '@/application/metrics/shared/trailingYear';
import type { CashFlowFields, IncomeStatementFields } from '@/application/ports/financialStatements';

// 2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
export const ONE_DOLLAR_TEST_FORMULA_VERSION = 2;

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
  // 2026-10-01 溯源表逐期列出原始欄位用（加總規則不變）：該年度的近一年來源（上市櫃四季／興櫃上下半年）。
  income: TrailingYear<IncomeStatementFields>;
  cashFlow: TrailingYear<CashFlowFields>;
}

const getAnnualFigures = async (
  cache: Map<number, AnnualFigures>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string,
  deps: OneDollarTestDeps
): Promise<AnnualFigures> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  // 2026-10-01 全年改走共用「近一年」來源（興櫃半年頻，見 shared/trailingYear.ts）：上市櫃＝該年四季、興櫃＝該年上下半年。
  const trailingKey = { symbol, rocYear, season: '4' as const, dataType, subsidiaryCompanyId };
  const [trailingIncome, trailingCashFlow] = await Promise.all([resolveTrailingIncomeStatements(trailingKey, deps), resolveTrailingCashFlowStatements(trailingKey, deps)]);
  const quarters = trailingIncome.periods.map((p, i) => [p.record, trailingCashFlow.periods[i]?.record ?? null] as const);

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

  const result: AnnualFigures = complete
    ? { netIncome: netIncomeSum, dividendsPaid: dividendsSum, income: trailingIncome, cashFlow: trailingCashFlow }
    : { netIncome: null, dividendsPaid: null, income: trailingIncome, cashFlow: trailingCashFlow };
  cache.set(rocYear, result);
  return result;
};


export type OneDollarTestDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'market' | 'cumulativeStatements'>;

export type OneDollarTestComputationBatch = ComputationBatch<'fy'>;

// 2026-10-01 溯源表（getOneDollarTestProvenance.ts）要跟寫入路徑算出同一個數字：整段計算抽成 resolver 共用，
// computeOneDollarTest 只負責組 slot；計算本身逐字未改。查無季度回 null。
export const resolveOneDollarTestInputs = async (query: QuarterlyMetricQuery, deps: OneDollarTestDeps) => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainIncomeStatement = await deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: mainIncomeStatement?.reportDate ?? null }], deps.announcements);

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const baseFiscalYear = latestCompleteFiscalYear - YEARS_WINDOW;

  const cache = new Map<number, AnnualFigures>();
  const yearsToSum: number[] = [];
  for (let y = baseFiscalYear + 1; y <= latestCompleteFiscalYear; y++) yearsToSum.push(y);

  const annualFigures = await Promise.all(yearsToSum.map((y) => getAnnualFigures(cache, symbol, y, dataType, subsidiaryCompanyId, deps)));

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
    deps.statements.getIncomeStatement({ symbol, year: latestCompleteFiscalYear, quarter: 4, dataType, subsidiaryCompanyId }),
    deps.statements.getIncomeStatement({ symbol, year: baseFiscalYear, quarter: 4, dataType, subsidiaryCompanyId }),
  ]);
  const [currentMarketCap, baseMarketCap] = await Promise.all([
    currentQ4?.reportDate ? deps.market.getMarketCap(symbol, currentQ4.reportDate) : null,
    baseQ4?.reportDate ? deps.market.getMarketCap(symbol, baseQ4.reportDate) : null,
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

  return {
    symbol, year, season, seasonNum, fiscalYear, mainAnchor,
    latestCompleteFiscalYear, baseFiscalYear, yearsToSum, annualFigures,
    cumulativeNetIncome, dividendsAbs, cumulativeRetainedEarnings, currentMarketCap, baseMarketCap, value, nullReason,
  };
};

export const computeOneDollarTest = async (
  query: QuarterlyMetricQuery,
  deps: OneDollarTestDeps
): Promise<OneDollarTestComputationBatch> => {
  const { dataType, subsidiaryCompanyId } = query;
  const resolution = await resolveOneDollarTestInputs(query, deps);

  if (!resolution) {
    return noQuarterBatch(query.symbol, ['fy']);
  }

  const { symbol, year, season, seasonNum, fiscalYear, mainAnchor, value, nullReason } = resolution;

  const coordinateBase = { symbol, metricCode: 'oneDollarTest', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };
  const fy = periodSlot(mainAnchor, coordinateBase, 'FY', value, nullReason);

  return { symbol, rocYear: year, season, slots: withFormulaVersion({ fy }, ONE_DOLLAR_TEST_FORMULA_VERSION) };
};
