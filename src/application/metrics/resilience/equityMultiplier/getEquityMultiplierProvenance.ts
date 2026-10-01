import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { pickEquityWithFieldKey } from '@/domain/metrics/shared/pickers';
import { resolveDupontFamilyData, type DupontFamilyDeps } from '../../shared/dupont/computeDupontFamily';
import { averageBalanceEntries, averagedDenominatorEntry } from '../../shared/provenance/averageBalanceEntries';
import type { MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';

// 2026-09-21 web-nuxt 要求（杜邦頁「計算依據表」）：equityMultiplier 的稽核鏈。
// 2026-10-01 改走 compute 同一份 resolveDupontFamilyData：原本自己算「本季期末總資產 / 本季期末權益」，2026-09-22 分母改期間
// 平均（Q 兩點、TTM 五點，興櫃三點）後跟儲存值對不上（上市 30/30 全錯）。改回傳 TTM（跟其他溯源表一致；端點目前沒有期別參數），
// 值直接取 compute 的 equityMultiplierTtmResult，entries 列出每個平均點的總資產與權益。
export const getEquityMultiplierProvenance = async (query: QuarterlyMetricQuery, deps: DupontFamilyDeps): Promise<MetricProvenanceResult> => {
  const data = await resolveDupontFamilyData(query, deps);
  if (!data) {
    return { symbol: query.symbol, metricCode: 'equityMultiplier', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }
  const { balances } = data;
  return {
    symbol: query.symbol,
    metricCode: 'equityMultiplier',
    found: true,
    fiscalYear: data.fiscalYear,
    fiscalQuarter: data.seasonNum,
    // compute 只在近一年營收與淨利都齊（ttmComplete，杜邦三因子共用的門檻）時才寫 TTM——讓 TTM 恆等式對得上；金融業沒有營業收入科目 → 不寫。
    value: data.ttmComplete ? data.equityMultiplierTtmResult.value : null,
    entries: [
      ...averageBalanceEntries(balances, [
        { label: '總資產', fieldKey: 'assets', pick: (bs) => bs.totalAssets },
        { label: '權益（歸屬母公司優先）', fieldKey: (bs) => pickEquityWithFieldKey(bs).fieldKey, pick: (bs) => pickEquityWithFieldKey(bs).value },
      ]),
      averagedDenominatorEntry('平均總資產', balances, balances.assetsAvgTtm),
      averagedDenominatorEntry('平均權益', balances, balances.equityAvgTtm),
    ],
    methodologyNote: '近四季：平均總資產 / 平均權益，平均取近四季窗口各季末（上市櫃 5 點、興櫃只有 Q2／Q4 為 3 點），四捨五入到小數 4 位。跟杜邦三因子共用門檻：近一年營收與淨利任一期缺（例如金融業沒有營業收入科目）就不計算。',
  };
};
