import { resolveQuarterOrLatest } from '@/shared/sourceData/latestQuarter';
import { toPerShare } from '@/domainPitMetrics/shared/numericHelpers';
import { pickEquity, pickNetIncome } from '@/domainPitMetrics/shared/pickers';
import { financialDataAdapter, type BalanceSheetPort, type IncomeStatementPort, type PaidInSharesPort, type StockPricePort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// 這份檔案是 src/domainMetrics/grahamNumber.ts 的獨立重新實作——舊架構呼叫
// calculateEps()+calculateBvps()，這裡不依賴 eps/bvps 這兩個 metric_code 已寫入的值，
// 自己重新查資產負債表/損益表算 EPS(TTM)/BVPS。只有 TTM 一種 basis。
//
// 2026-09-10 使用者要求：公式改成 PER(TTM) × PBR，不要讓股價變成單獨要比較的變量——
// 原本 sqrt(22.5 × EPS × BVPS) vs 股價 的寫法，股價是拿來跟這支指標的結果比較用的
// 額外變量；改成 PER × PBR 之後，股價已經內含在 PER/PBR 各自的比率裡，門檻直接是
// 「grahamNumber < 22.5」的常數比較，不需要再引用另一支指標的股價欄位。數學上完全
// 等價：Price < sqrt(22.5×EPS×BVPS) ⟺ Price² < 22.5×EPS×BVPS ⟺ (Price/EPS)×
// (Price/BVPS) < 22.5 ⟺ PER×PBR < 22.5（EPS/BVPS/Price 皆為正時）。PER/PBR 獨立
// 重新計算，不依賴 peRatio/pbRatio 已寫入的值，算法直接複製自那兩支各自的 TTM/Q 邏輯，
// 保持每支 PIT 檔案獨立、不互相依賴的既有原則。

const toRatioFromNumbers = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
};

export type GrahamNumberPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteGrahamNumberPit = async (
  query: QuarterlyMetricQuery,
  statements: BalanceSheetPort & IncomeStatementPort & PaidInSharesPort & StockPricePort = financialDataAdapter
): Promise<GrahamNumberPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement] = await Promise.all([statements.getBalanceSheet(key), statements.getIncomeStatement(key)]);
  const equity = pickEquity(balanceSheet);
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  const shares = reportDate ? await statements.getPaidInShares(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const bvps = equity.value !== null && sharesValue !== null ? toPerShare(equity.value, sharesValue) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const stockPrice = mainAnchor ? await statements.getStockPrice(symbol, mainAnchor.knowledgeDate) : null;
  const pbRatio = bvps !== null && stockPrice !== null ? toRatioFromNumbers(stockPrice.closePrice, bvps) : null;

  // EPS(TTM)：近四季（含本季）淨利加總，算法跟 peRatio/eps 的 TTM 完全相同。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let netIncomeTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    const picked = pickNetIncome(record);
    if (picked.value === null) {
      ttmComplete = false;
    } else {
      netIncomeTtmSum += picked.value;
    }
  }

  const epsTtm = ttmComplete && sharesValue !== null ? toPerShare(netIncomeTtmSum, sharesValue) : null;
  const peRatioTtm = epsTtm !== null && stockPrice !== null ? toRatioFromNumbers(stockPrice.closePrice, epsTtm) : null;

  // grahamNumber = PER × PBR，跟 peRatio/pbRatio 自己的 null_reason 判斷同一套哲學：
  // 分母（EPS/BVPS）剛好等於 0 才是 zero_or_negative_denominator，為負仍然算出一個
  // 真實但可能為負的比率，不隱藏成 null——虧損或資不抵債公司的 PER/PBR 為負是真實
  // 資訊，相乘後的 grahamNumber 也應該如實反映，不用額外判斷正負。
  const grahamNumber = peRatioTtm !== null && pbRatio !== null ? Math.round(peRatioTtm * pbRatio * 100) / 100 : null;

  let nullReason: MetricNullReason | null = null;
  if (grahamNumber === null) {
    if (!ttmComplete) nullReason = 'insufficient_history';
    else if (epsTtm === null || bvps === null || stockPrice === null) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
  }

  let ttm: BasisOutcome;
  if (!mainAnchor) {
    ttm = { action: 'skipped_no_knowledge_date' };
  } else {
    ttm = await writeMetricValue({
      symbol,
      metricCode: 'grahamNumber',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('TTM'),
      value: grahamNumber,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, ttm };
};
