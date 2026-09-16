import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 應 web-nuxt 要求新增——pegRatio 的即時版本，見 computeLivePegRatioPit.ts
// 檔頭說明。逐日型（snapshot），不是季報型。
export const livePegRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'livePegRatio',
  name: 'PEG',
  nameSuffix: '即時',
  unit: '倍',
  formulaNote:
    '= PER(TTM，當下最新收盤價/最新已申報 EPS TTM) ÷ EPS 5 年複合成長率(%)。成長率跟 pegRatio 完全相同，' +
    'PER 的股價改用當下最新收盤價，每個交易日更新，跟 pegRatio（凍結在財報公告當天）是刻意並存、互不影響' +
    '的兩支獨立 metricCode。',
  formulaLatex: '\\mathrm{LivePEG} = \\dfrac{\\mathrm{PER}_{\\mathrm{TTM}}}{\\mathrm{EPS\\ CAGR}_{5Y}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/PEG_ratio',
  tier: 'composite',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '證交所／櫃買中心每日收盤價'],
  group: 'snapshot',
  allowedSnapshotCadences: ['EOD'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares', 'daily_price.close'],
  currentFormulaVersion: 1,
};
