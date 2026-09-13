import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getXbrlCashFlowQuarterly } from '@/shared/sourceData/xbrlCashFlowQuarterly';
import { getMarketCapAsOf } from '@/shared/sourceData/marketCap';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——buybackYield(TTM) = 近四季買回庫藏股支付現金加總
// （取絕對值）/ 本季報告日市值 * 100。跟 computeBuybackYieldPit.ts 一致，買回金額只查
// XBRL 現金流量表長表這一個欄位（沒有舊表 fallback）。固定回傳 TTM。
//
// 注意：computeBuybackYieldPit.ts 的分子（現金流量表欄位，千元）直接除以分母（
// getMarketCapAsOf 回傳的市值，單位是元，未乘 1000 換算成千元或反過來），量綱不一致，
// 這裡照樣重現既有寫入路徑的公式（不在稽核鏈裡靜默改寫），但已個別回報使用者確認是否
// 為既有計算 bug。

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

export const getBuybackYieldProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'buybackYield', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainCashFlow = await getQuarterlyCashFlowStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const reportDate = mainCashFlow?.reportDate ?? null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getTreasurySharesPurchased({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let buybackTtmSum = 0n;
  let complete = true;
  for (const record of ttmRecords) {
    if (record === null) complete = false;
    else buybackTtmSum += record;
  }
  const buybackAbs = buybackTtmSum < 0n ? -buybackTtmSum : buybackTtmSum;

  const marketCap = reportDate ? await getMarketCapAsOf(symbol, reportDate) : null;
  const value = complete && marketCap && marketCap.marketCap > 0 ? Math.round((Number(buybackAbs) / marketCap.marketCap) * 100 * 100) / 100 : null;

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `TTM 買回庫藏股支付現金（第 ${i + 1}/4 季，原始資料是現金流出負值）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: 'payments_to_acquire_treasury_shares',
        sourceDescription: null,
        value: toProvenanceEntryValue(ttmRecords[i]),
      })
    ),
    {
      role: '本季報告日市值（收盤價 × 流通股數）',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: marketCap ? `收盤價 ${marketCap.closePrice}（${marketCap.tradeDate}）× 流通股數 ${marketCap.paidInShares.toString()}` : null,
      value: toProvenanceEntryValue(marketCap?.marketCap ?? null),
    },
  ];

  return {
    symbol,
    metricCode: 'buybackYield',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote:
      '分子買回庫藏股支付現金取絕對值後 TTM 加總（原始資料是現金流出負值），單位千元；分母市值單位是元——既有寫入路徑（computeBuybackYieldPit.ts）本身未做千元/元的量綱換算就直接相除，這裡原樣重現該公式供稽核，不在稽核鏈裡靜默修正。',
  };
};
