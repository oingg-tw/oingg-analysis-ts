import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/models/mops/cashFlowStatementXbrlFirst';
import { getXbrlCashFlowQuarterly } from '@/models/mops/xbrlCashFlowQuarterly';
import { getMarketCapAsOf } from '@/models/twse/marketCap';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——buybackYield(TTM) = 近四季買回庫藏股支付現金加總
// （取絕對值，單位千元，換算成元）/ 本季報告日市值（單位元）* 100。跟
// computeBuybackYieldPit.ts 一致，買回金額只查 XBRL 現金流量表長表這一個欄位（沒有舊表
// fallback）。固定回傳 TTM。
//
// 2026-09-13 稽核鏈驗證時發現原公式少做了千元換元的 x1000（分子千元直接除以分母的元，
// 量綱不一致，實際數值被低估 1000 倍），已在 computeBuybackYieldPit.ts 修正並回填全市場
// 歷史資料，這裡同步套用修正後的公式。

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

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement']);

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
  const value = complete && marketCap && marketCap.marketCap > 0 ? Math.round(((Number(buybackAbs) * 1000) / marketCap.marketCap) * 100 * 100) / 100 : null;

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
    methodologyNote: '分子買回庫藏股支付現金取絕對值後 TTM 加總（原始資料是現金流出負值），單位千元，乘 1000 換算成元後再除以市值（單位元）。',
  };
};
