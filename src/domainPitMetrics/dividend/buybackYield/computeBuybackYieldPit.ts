import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { getXbrlCashFlowQuarterly } from '@/models/mops/xbrlCashFlowQuarterly';
import { financialDataAdapter, type CashFlowStatementPort, type MarketCapPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeOrSkip } from '../../metricValueWriter';
import type { StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// 買回庫藏股金額（payments_to_acquire_treasury_shares）只存在 XBRL 現金流量表長表，舊表
// quarterly_cash_flow_statement 沒有對應欄位、沒有 fallback 可用——跟 dividendsPaid 不同：
// dividendsPaid 幾乎每季都會揭露（只是常態性是 0），這個欄位是較新的資料源，查無整列
// XBRL 資料更可能是「還沒回填到」而不是「真的沒買回」，保守回傳 null（不是 0）；但如果
// 查得到這一列、只是這個 account_code 不在裡面，代表申報方確實沒有揭露這個項目（金額是 0），
// 這種情況才回傳 0——兩種「查無資料」的語意不一樣，不能混用同一個判斷。
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

export type BuybackYieldPitOutcome = StandardBasisPitOutcome;

// 買回殖利率 = TTM（近四季）買回庫藏股支付現金加總 / 市值（收盤價 x 流通股數，以主要
// 季度報告日為準）* 100。這支獨立存在，供只需要「買回」這一半數字的情境單獨查詢。
//
// 2026-09-14 更新：原本這裡的註解說「刻意不合併成單一 Shareholder Yield，前端自己把
// dividendYield(EOD)+buybackYield(TTM) 加起來就好」——這個決定已經被使用者推翻，見
// dividend/shareholderYield/computeShareholderYieldPit.ts。那支是獨立重新計算的複合
// metricCode（不是讀這支或 dividendYield 已寫入的值相加），後端統一算好「股東總回饋率」
// 掛徽章用；這支 buybackYield 本身沒有被取代，繼續保留給只需要買回這半邊數字的情境。
export const computeAndWriteBuybackYieldPit = async (
  query: QuarterlyMetricQuery,
  statements: CashFlowStatementPort & MarketCapPort = financialDataAdapter
): Promise<BuybackYieldPitOutcome> => {
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
    ttmQuarters.map((tq) => getTreasurySharesPurchased({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let buybackTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null) ttmComplete = false;
    else buybackTtmSum += record;
  }
  const buybackAbs = buybackTtmSum < 0n ? -buybackTtmSum : buybackTtmSum;

  const marketCap = reportDate ? await statements.getMarketCap(symbol, reportDate) : null;
  // 2026-09-13 修正量綱 bug：buybackAbs 是現金流量表欄位，單位千元；marketCap.marketCap
  // 是 getMarketCapAsOf 回傳的市值，單位元。先前這裡直接相除沒有做 x1000 換算，導致算出來
  // 的殖利率被低估 1000 倍——稽核鏈驗證時發現（見 getBuybackYieldProvenance.ts 的說明）。
  const buybackYieldTtm =
    ttmComplete && marketCap && marketCap.marketCap > 0 ? Math.round(((Number(buybackAbs) * 1000) / marketCap.marketCap) * 100 * 100) / 100 : null;
  const ttmNullReason: MetricNullReason | null = buybackYieldTtm !== null ? null : !ttmComplete ? 'insufficient_history' : 'missing_input';

  const coordinateBase = { symbol, metricCode: 'buybackYield', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const ttm = await writeOrSkip(mainAnchor, coordinateBase, 'TTM', buybackYieldTtm, ttmNullReason);

  return { symbol, rocYear: year, season, ttm };
};
