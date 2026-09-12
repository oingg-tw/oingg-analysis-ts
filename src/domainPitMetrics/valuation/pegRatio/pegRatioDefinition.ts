import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

// 2026-09-11 使用者要求：徽章（門檻/篩選指標）保留每日更新的版本就好——計算應以「今天」的
// 即時市場價格搭配「最新公布財報」的基本面數據，不要用凍結在財報公告當天的季報快照。
// 徽章移到 livePegRatio（見該資料夾），這支季報型 pegRatio 保留純數字查詢用途，不再掛
// badge。
export const pegRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'pegRatio',
  name: 'PEG',
  unit: '倍',
  formulaNote:
    '= PER(TTM) / EPS 5年複合成長率(%)。PER 跟成長率各自獨立重新計算，不依賴 peRatio/' +
    'epsCagr5y 已寫入的值。成長率 ≤ 0（獲利衰退或虧損）時 PEG 沒有意義，回傳 null' +
    '（zero_or_negative_denominator）。只有 TTM 一種 basis——沿用 peRatio 的基準。',
  formulaLatex: '\\mathrm{PEG} = \\frac{\\mathrm{PER}_{\\mathrm{TTM}}}{\\mathrm{EpsCagr}_{5y}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/PEG_ratio',
  tier: 'composite',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares'],
  currentFormulaVersion: 1,
};
