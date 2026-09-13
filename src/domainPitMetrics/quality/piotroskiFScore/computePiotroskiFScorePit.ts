import { resolveQuarterOrLatest } from '@/shared/sourceData/latestQuarter';
import { pickNetIncome } from '@/domainPitMetrics/shared/pickers';
import { financialDataAdapter, type BalanceSheetPort, type IncomeStatementPort, type CashFlowStatementPort, type PaidInSharesPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// 這份檔案是 src/domainMetrics/piotroskiFScore.ts 的獨立重新實作。9 個二元訊號本季 vs
// 去年同季比較——去年同季用 getPastNQuarters({rocYear,season},5)[0]（5 季前，取最舊那一筆）
// 取得，不是專門的新機制，是既有 getPastNQuarters 的另一種用法。只有 Q 一種 basis，純粹
// 單點比較，沒有 TTM/年化概念。9 個訊號本身不拆成獨立 metric_code——2026-09-10 web-nuxt
// 要求依 Piotroski 原始論文的分組（獲利能力/財務槓桿與流動性/營運效率）顯示，改成用
// resolvePiotroskiFScoreSignals() 共用計算邏輯，寫入路徑（computeAndWritePiotroskiFScorePit）
// 跟 on-demand 讀取路徑（getPiotroskiFScoreBreakdown，見 getPiotroskiFScoreBreakdown.ts）
// 各自呼叫同一份計算，不重複寫兩次；9 個訊號本身依然不寫進 metric_values，breakdown 端點
// 現查現算。

const ratio = (numerator: bigint | null, denominator: bigint | null): number | null => {
  if (numerator === null || denominator === null || denominator === 0n) return null;
  return Number(numerator) / Number(denominator);
};

interface QuarterData {
  totalAssets: bigint | null;
  longTermBorrowings: bigint | null;
  currentAssets: bigint | null;
  currentLiabilities: bigint | null;
  netIncome: bigint | null;
  grossProfit: bigint | null;
  operatingRevenue: bigint | null;
  operatingCashFlow: bigint | null;
  paidInShares: bigint | null;
  reportDate: Date | null;
  available: boolean; // 三張表是否至少都存在（不論欄位是否為 null）
}

const fetchQuarterData = async (
  symbol: string,
  rocYear: number,
  season: number,
  dataType: string,
  subsidiaryCompanyId: string,
  statements: BalanceSheetPort & IncomeStatementPort & CashFlowStatementPort & PaidInSharesPort
): Promise<QuarterData> => {
  const key = { symbol, year: rocYear, quarter: season, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement, cashFlowStatement] = await Promise.all([
    statements.getBalanceSheet(key),
    statements.getIncomeStatement(key),
    statements.getCashFlowStatement(key),
  ]);
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;
  const shares = reportDate ? await statements.getPaidInShares(symbol, reportDate) : null;

  return {
    totalAssets: balanceSheet?.totalAssets ?? null,
    longTermBorrowings: balanceSheet?.longTermBorrowings ?? null,
    currentAssets: balanceSheet?.currentAssets ?? null,
    currentLiabilities: balanceSheet?.currentLiabilities ?? null,
    netIncome: pickNetIncome(incomeStatement).value,
    grossProfit: incomeStatement?.grossProfit ?? null,
    operatingRevenue: incomeStatement?.operatingRevenue ?? null,
    operatingCashFlow: cashFlowStatement?.netCashFromOperatingActivities ?? null,
    paidInShares: shares?.paidInShares ?? null,
    reportDate,
    available: balanceSheet !== null && incomeStatement !== null && cashFlowStatement !== null,
  };
};

export type PiotroskiFScorePitOutcome = StandardBasisPitOutcome;

// 9 個二元訊號，命名/順序跟 Piotroski (2000) 原始論文一致，見 getPiotroskiFScoreBreakdown.ts
// 依這個順序分成「獲利能力（前4）/財務槓桿與流動性（中3）/營運效率（後2）」三組。
export interface PiotroskiFScoreSignals {
  positiveRoa: boolean | null;
  positiveCfo: boolean | null;
  roaImproved: boolean | null;
  accrualQuality: boolean | null;
  leverageDecreased: boolean | null;
  liquidityImproved: boolean | null;
  noDilution: boolean | null;
  grossMarginImproved: boolean | null;
  assetTurnoverImproved: boolean | null;
}

export interface PiotroskiFScoreResolution {
  symbol: string;
  rocYear: string;
  season: string;
  fiscalYear: number;
  fiscalQuarter: number;
  signals: PiotroskiFScoreSignals;
  score: number | null;
  nullReason: MetricNullReason | null;
  knowledgeDate: Date | null;
  knowledgeDateIsFallback: boolean | null;
}

// 共用計算邏輯——寫入路徑（computeAndWritePiotroskiFScorePit）跟 on-demand 讀取路徑
// （getPiotroskiFScoreBreakdown）各自呼叫，避免兩處各自維護一份 9 訊號計算邏輯。
// resolvedQuarter 查無資料時回傳 null，呼叫端各自決定怎麼呈現「查無資料」。
export const resolvePiotroskiFScoreSignals = async (
  query: QuarterlyMetricQuery,
  statements: BalanceSheetPort & IncomeStatementPort & CashFlowStatementPort & PaidInSharesPort = financialDataAdapter
): Promise<PiotroskiFScoreResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorRocYear = Number(prior.year);
  const priorSeasonNum = Number(prior.season);

  const [curr, prev] = await Promise.all([
    fetchQuarterData(symbol, rocYear, seasonNum, dataType, subsidiaryCompanyId, statements),
    fetchQuarterData(symbol, priorRocYear, priorSeasonNum, dataType, subsidiaryCompanyId, statements),
  ]);

  const currRoa = ratio(curr.netIncome, curr.totalAssets);
  const prevRoa = ratio(prev.netIncome, prev.totalAssets);
  const currLeverage = ratio(curr.longTermBorrowings ?? 0n, curr.totalAssets);
  const prevLeverage = ratio(prev.longTermBorrowings ?? 0n, prev.totalAssets);
  const currLiquidity = ratio(curr.currentAssets, curr.currentLiabilities);
  const prevLiquidity = ratio(prev.currentAssets, prev.currentLiabilities);
  const currMargin = ratio(curr.grossProfit, curr.operatingRevenue);
  const prevMargin = ratio(prev.grossProfit, prev.operatingRevenue);
  const currTurnover = ratio(curr.operatingRevenue, curr.totalAssets);
  const prevTurnover = ratio(prev.operatingRevenue, prev.totalAssets);

  const signals: PiotroskiFScoreSignals = {
    positiveRoa: currRoa !== null ? currRoa > 0 : null,
    positiveCfo: curr.operatingCashFlow !== null ? curr.operatingCashFlow > 0n : null,
    roaImproved: currRoa !== null && prevRoa !== null ? currRoa > prevRoa : null,
    accrualQuality: curr.operatingCashFlow !== null && curr.netIncome !== null ? curr.operatingCashFlow > curr.netIncome : null,
    leverageDecreased: currLeverage !== null && prevLeverage !== null ? currLeverage < prevLeverage : null,
    liquidityImproved: currLiquidity !== null && prevLiquidity !== null ? currLiquidity > prevLiquidity : null,
    noDilution: curr.paidInShares !== null && prev.paidInShares !== null ? curr.paidInShares <= prev.paidInShares : null,
    grossMarginImproved: currMargin !== null && prevMargin !== null ? currMargin > prevMargin : null,
    assetTurnoverImproved: currTurnover !== null && prevTurnover !== null ? currTurnover > prevTurnover : null,
  };

  const signalValues = Object.values(signals);
  const allEvaluated = signalValues.every((s) => s !== null);
  const score = allEvaluated ? signalValues.reduce((sum: number, s) => sum + (s ? 1 : 0), 0) : null;

  let nullReason: MetricNullReason | null = null;
  if (score === null) {
    nullReason = !prev.available ? 'insufficient_history' : 'missing_input';
  }

  const mainAnchor = await resolveKnowledgeDate(symbol, [
    { rocYear, season: seasonNum, reportDate: curr.reportDate },
    { rocYear: priorRocYear, season: priorSeasonNum, reportDate: prev.reportDate },
  ]);

  return {
    symbol,
    rocYear: year,
    season,
    fiscalYear,
    fiscalQuarter: seasonNum,
    signals,
    score,
    nullReason,
    knowledgeDate: mainAnchor?.knowledgeDate ?? null,
    knowledgeDateIsFallback: mainAnchor?.isFallback ?? null,
  };
};

export const computeAndWritePiotroskiFScorePit = async (
  query: QuarterlyMetricQuery,
  statements: BalanceSheetPort & IncomeStatementPort & CashFlowStatementPort & PaidInSharesPort = financialDataAdapter
): Promise<PiotroskiFScorePitOutcome> => {
  const resolution = await resolvePiotroskiFScoreSignals(query, statements);

  if (!resolution) {
    return { symbol: query.symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' } };
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, score, nullReason, knowledgeDate, knowledgeDateIsFallback } = resolution;

  let q: BasisOutcome;
  if (!knowledgeDate) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      symbol,
      metricCode: 'piotroskiFScore',
      fiscalYear,
      fiscalQuarter,
      dataType: query.dataType,
      subsidiaryCompanyId: query.subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value: score,
      nullReason,
      knowledgeDate,
      knowledgeDateIsFallback: knowledgeDateIsFallback!,
    });
  }

  return { symbol, rocYear, season, q };
};
