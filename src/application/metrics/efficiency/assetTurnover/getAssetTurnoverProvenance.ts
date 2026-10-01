import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { averageBalanceEntries, averagedDenominatorEntry } from '../../shared/provenance/averageBalanceEntries';
import { resolveDupontFamilyData, type DupontFamilyDeps } from '../../shared/dupont/computeDupontFamily';

// 2026-09-21 web-nuxt 要求（杜邦頁「計算依據表」）：assetTurnover 的稽核鏈。固定回傳 TTM（跟 roe/dupontTaxBurden 同一個
// 試點慣例，也是杜邦恆等式 netProfitMargin.TTM × assetTurnover.TTM × equityMultiplier.TTM = roe.TTM 用的那個 basis）。
// 2026-10-01 改用 computeDupontFamily 的 resolveDupontFamilyData()（同一份資料與計算）：分母 2026-09-22 起是近四季窗口
// 5 個季末總資產的平均（興櫃半年頻 3 點），這裡原本自己算「本季期末總資產、分母不平均」，溯源值跟儲存值對不上；
// 近一年齊不齊也改成跟 compute 一樣看營收＋淨利（原本只看營收）。
export const getAssetTurnoverProvenance = async (query: QuarterlyMetricQuery, deps: DupontFamilyDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveDupontFamilyData(query, deps);
  if (!r) {
    return { symbol: query.symbol, metricCode: 'assetTurnover', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const entries: ProvenanceEntry[] = [
    ...r.ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `近一年 營業收入（${trailingPeriodLabel(tq, r.basis)}）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(r.ttmRecords[i]?.operatingRevenue ?? null),
      })
    ),
    ...averageBalanceEntries(r.balances, [{ label: '總資產', fieldKey: 'assets', pick: (bs) => bs.totalAssets }]),
    averagedDenominatorEntry('平均總資產', r.balances, r.balances.assetsAvgTtm),
  ];

  return {
    symbol: r.symbol,
    metricCode: 'assetTurnover',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.assetTurnoverTtmCalc.value,
    entries,
    methodologyNote: 'TTM 口徑：近一年營業收入加總 ÷ 近四季窗口 5 個季末總資產的平均（興櫃半年頻 3 點，見上方逐點列出），四捨五入到小數 4 位。近一年任一期營收或淨利缺漏即算不出來（跟淨利率共用同一個完整度判斷）。',
  };
};
