import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';
import { pegRatioBadge } from './pegRatioBadge';

export const pegRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'pegRatio',
  displayName: '本益成長比 (PEG)',
  unit: '倍',
  formulaNote:
    '= PER(TTM) / EPS 5年複合成長率(%)。PER 跟成長率各自獨立重新計算，不依賴 peRatio/' +
    'epsCagr5y 已寫入的值。成長率 ≤ 0（獲利衰退或虧損）時 PEG 沒有意義，回傳 null' +
    '（zero_or_negative_denominator）。只有 TTM 一種 basis——沿用 peRatio 的基準。',
  formulaLatex: '\\mathrm{PEG} = \\frac{\\mathrm{PER}_{\\mathrm{TTM}}}{\\mathrm{EpsCagr}_{5y}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/PEG_ratio',
  tier: 'composite',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '證交所／櫃買中心每日收盤價'],
  badge: pegRatioBadge,
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares'],
  currentFormulaVersion: 1,
};
