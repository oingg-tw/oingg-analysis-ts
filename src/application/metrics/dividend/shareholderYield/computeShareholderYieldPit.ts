import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getXbrlCashFlowQuarterly } from '@/infrastructure/repositories/mops/xbrlCashFlowQuarterly';
import { financialDataAdapter, type CashFlowStatementPort, type MarketCapPort } from '@/application/metrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeOrSkip } from '../../metricValueWriter';
import type { StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';

// Shareholder Yield（Mebane Faber, 2013《Shareholder Yield: A Better Approach to
// Dividend Investing》）= 股利殖利率 + 買回殖利率（Faber 完整版還有第三項「淨還債殖利率」，
// 這裡只做前兩項，跟 AAII 的簡化篩選器做法一致，見 badge 的 detail 說明）。
//
// 2026-09-14 應使用者要求：這支是獨立重新計算的複合指標，刻意不直接讀取/相加
// dividendYield（交易所每日公告 passthrough，EOD 快照）跟 buybackYield（自算 TTM 累計值）
// 已經寫入的值——這推翻了 buybackYield 檔頭原本「兩者頻率/資料源本質不同，故意不合併，
// 前端自己加總」的決定，改成後端統一算好、寫進獨立的 metric_code，跟 ruleOf40（同樣是
// 「兩個既有概念的和」但獨立重算）採同一套模式。股利發放現金（dividendsPaid）跟買回庫藏股
// 支付現金（payments_to_acquire_treasury_shares，只存在 XBRL 現金流量表長表）都用 TTM
// 累加，除以市值（收盤價 x 流通股數，以主要季度報告日為準）。

// 買回庫藏股金額只存在 XBRL 長表，查無整列資料保守回傳 null（可能是還沒回填，不是沒買回）；
// 查得到這一列但沒有這個 account_code，代表申報方確實沒有揭露這個項目，回傳 0——跟
// buybackYield.ts 的 getTreasurySharesPurchased 完全同一套判斷邏輯，這裡獨立複製一份
// （不 import 那支檔案的私有函式，保持「唯讀不互相依賴」的既有慣例）。
const getTreasurySharesPurchased = async (key: {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
}): Promise<bigint | null> => {
  const xbrl = await getXbrlCashFlowQuarterly(key);
  if (!xbrl) return null;
  return xbrl.accounts.payments_to_acquire_treasury_shares ?? 0n;
};

export type ShareholderYieldPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteShareholderYieldPit = async (
  query: QuarterlyMetricQuery,
  statements: CashFlowStatementPort & MarketCapPort = financialDataAdapter
): Promise<ShareholderYieldPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const mainCashFlow = await statements.getCashFlowStatement(key);
  const reportDate = mainCashFlow?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map(async (tq) => {
      const q = { symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId };
      const [cashFlow, treasuryShares] = await Promise.all([statements.getCashFlowStatement(q), getTreasurySharesPurchased(q)]);
      return { cashFlow, treasuryShares };
    })
  );

  let dividendsSum = 0n;
  let buybackSum = 0n;
  let ttmComplete = true;
  for (const { cashFlow, treasuryShares } of ttmRecords) {
    if (cashFlow === null || treasuryShares === null) {
      ttmComplete = false;
    } else {
      // 股利發放缺漏視為 0——大多數季度本來就沒發放，不是資料缺漏（比照 dividendCoverageRatio 的既有規則）。
      dividendsSum += cashFlow.dividendsPaid ?? 0n;
      buybackSum += treasuryShares;
    }
  }

  const shareholderCashOutflow = (dividendsSum < 0n ? -dividendsSum : dividendsSum) + (buybackSum < 0n ? -buybackSum : buybackSum);

  const marketCap = reportDate ? await statements.getMarketCap(symbol, reportDate) : null;
  // 現金流量表欄位單位是千元，marketCap.marketCap 單位是元，跟 buybackYield.ts 同一種
  // x1000 換算（那邊之前發生過量綱 bug，見該檔案 2026-09-13 的修正說明，這裡從一開始就對）。
  const shareholderYieldTtm =
    ttmComplete && marketCap && marketCap.marketCap > 0 ? Math.round(((Number(shareholderCashOutflow) * 1000) / marketCap.marketCap) * 100 * 100) / 100 : null;
  const ttmNullReason: MetricNullReason | null = shareholderYieldTtm !== null ? null : !ttmComplete ? 'insufficient_history' : 'missing_input';

  const coordinateBase = { symbol, metricCode: 'shareholderYield', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const ttm = await writeOrSkip(mainAnchor, coordinateBase, 'TTM', shareholderYieldTtm, ttmNullReason);

  return { symbol, rocYear: year, season, ttm };
};
