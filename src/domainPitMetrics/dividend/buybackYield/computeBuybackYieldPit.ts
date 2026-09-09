import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getXbrlCashFlowQuarterly } from '@/shared/sourceData/xbrlCashFlowQuarterly';
import { getMarketCapAsOf } from '@/shared/sourceData/marketCap';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
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

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface BuybackYieldPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  ttm: BasisOutcome;
}

// 買回殖利率 = TTM（近四季）買回庫藏股支付現金加總 / 市值（收盤價 x 流通股數，以主要
// 季度報告日為準）* 100。跟 dividendYield（交易所公告的股利殖利率）並列成「股東總回報率
// （Shareholder Yield = 股利殖利率 + 買回殖利率）」的另一半，但這裡刻意分開兩個獨立
// metricCode，不合併成單一總回報率——dividendYield 是交易所公告 passthrough（EOD 快照），
// 這支是自算 TTM 累計值，兩者頻率/資料源本質不同，前端要組合成「股東總回報率」可以自己
// 把兩個值加起來，不用我們預先合併掉各自的可追溯性。
export const computeAndWriteBuybackYieldPit = async (query: QuarterlyMetricQuery): Promise<BuybackYieldPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const mainCashFlow = await getQuarterlyCashFlowStatement(key);
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

  const marketCap = reportDate ? await getMarketCapAsOf(symbol, reportDate) : null;
  const buybackYieldTtm =
    ttmComplete && marketCap && marketCap.marketCap > 0 ? Math.round((Number(buybackAbs) / marketCap.marketCap) * 100 * 100) / 100 : null;
  const ttmNullReason: MetricNullReason | null = buybackYieldTtm !== null ? null : !ttmComplete ? 'insufficient_history' : 'missing_input';

  const coordinateBase = { symbol, metricCode: 'buybackYield', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let ttm: BasisOutcome;
  if (!mainAnchor) {
    ttm = { action: 'skipped_no_knowledge_date' };
  } else {
    ttm = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: buybackYieldTtm,
      nullReason: ttmNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, ttm };
};
