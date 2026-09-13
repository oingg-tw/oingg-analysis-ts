import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { financialDataAdapter, type IncomeStatementPort, type BalanceSheetPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';

import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';
import { isFinancialIndustryCompany } from '@/shared/sourceData/securitiesIndustry';
import { getCompanySectionCode } from '@/shared/sourceData/industryClassification';

// Altman Z″-Score（1983/1995，非製造業/新興市場版）——四變數，刻意拿掉 X5（資產週轉率），
// 理由是原始論文認為週轉率在非製造業/新興市場產業間差異太大，會扭曲跨產業比較，跟
// altmanZScore（1968 原版五變數）/altmanZPrimeScore（1983 非上市版五變數）是三個各自
// 發表、獨立登錄的模型。X4 跟 Z′ 一樣用帳面權益（沒有市值可用時的版本，Z″ 論文延續 Z′
// 的這個設計，不是又換一次）。獨立重新計算，不依賴另外兩支已寫入的值。
// 2026-09-13：這個版本是「非製造業」設計的，製造業公司（財政部稅籍分類 section='C'，
// 見 industryClassification.ts）套用這個版本本身就不符合設計前提，標記
// not_applicable_industry；金融保險業（twse-ts industry='17'）雖然也是非製造業，但
// 銀行的資產負債表結構（存款/放款）本來就不適用一般會計比率型危機模型，理由跟
// altmanZScore/beneishMScore/ohlsonOScore/zmijewskiScore 排除金融業一致，兩個條件
// 任一成立就標記 not_applicable_industry。

const pickEquity = (record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.equityAttributableToParent !== null) return { value: record.equityAttributableToParent };
  if (record.totalEquity !== null) return { value: record.totalEquity };
  return { value: null };
};

const toRatio4 = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 10000) / 10000;
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface AltmanZDoublePrimeScorePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  ttm: BasisOutcome;
}

export const computeAndWriteAltmanZDoublePrimeScorePit = async (query: QuarterlyMetricQuery, statements: IncomeStatementPort & BalanceSheetPort = financialDataAdapter): Promise<AltmanZDoublePrimeScorePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await statements.getBalanceSheet(key);
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const retainedEarnings = balanceSheet?.retainedEarnings ?? null;
  const bookEquity = pickEquity(balanceSheet).value;
  const reportDate = balanceSheet?.reportDate ?? null;

  const x1 = currentAssets !== null && currentLiabilities !== null && totalAssets !== null ? toRatio4(currentAssets - currentLiabilities, totalAssets) : null;
  const x2 = retainedEarnings !== null && totalAssets !== null ? toRatio4(retainedEarnings, totalAssets) : null;
  const x4 = bookEquity !== null && totalLiabilities !== null && totalLiabilities !== 0n ? toRatio4(bookEquity, totalLiabilities) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  // X3：近四季（含本季）EBIT 加總，分母固定用本季期末總資產——跟 Z/Z′ 一樣需要 TTM，
  // 但 Z″ 沒有 X5，不用查營收。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let ebitTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.profitBeforeTax === null || record.financeCosts === null) {
      ttmComplete = false;
    } else {
      ebitTtmSum += record.profitBeforeTax + record.financeCosts;
    }
  }

  const x3 = ttmComplete && totalAssets !== null ? toRatio4(ebitTtmSum, totalAssets) : null;

  let zDoublePrimeScore =
    x1 !== null && x2 !== null && x3 !== null && x4 !== null ? Math.round((6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4) * 100) / 100 : null;

  let nullReason: MetricNullReason | null = null;
  if (zDoublePrimeScore === null) {
    nullReason = !ttmComplete ? 'insufficient_history' : 'missing_input';
  }

  const [isManufacturing, isFinancial] = await Promise.all([
    getCompanySectionCode(symbol).then((section) => section === 'C'),
    isFinancialIndustryCompany(symbol),
  ]);
  if (isManufacturing || isFinancial) {
    zDoublePrimeScore = null;
    nullReason = 'not_applicable_industry';
  }

  const coordinateBase = { symbol, metricCode: 'altmanZDoublePrimeScore', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let ttm: BasisOutcome;
  if (!mainAnchor) {
    ttm = { action: 'skipped_no_knowledge_date' };
  } else if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: zDoublePrimeScore,
        nullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else {
    ttm = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      // 沿用上面算好的 nullReason（製造業/金融業會是 not_applicable_industry），
      // 不要重新硬寫死 insufficient_history。
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, ttm };
};
