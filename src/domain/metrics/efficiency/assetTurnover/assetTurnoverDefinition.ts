import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-22 formulaVersion 2：分母改期間平均（Q = 本季與上季期末平均、TTM = 近四季窗口 5 個季末平均），理由與定義見
// application/metrics/shared/averageBalances.ts——期末分母在台股會因 6 月股東會決議股利轉列負債，讓每年 Q2 的 TTM 值假性跳升。
export const assetTurnoverDefinition: MetricDefinitionSpec = {
  metricCode: 'assetTurnover',
  name: '總資產週轉率',
  unit: '次',
  formulaNote:
    'Q(單季) = 本季營收/平均總資產（次），平均總資產 = (本季期末 + 上季期末)/2；' +
    'TTM = 近四季（含本季）營收加總/平均總資產，平均總資產 = 近四季窗口 5 個季末（t−4 … t）的平均。四季損益表或任一季末資產負債表不齊為 null。' +
    '（formulaVersion 1 分母是本季單一期末總資產。）',
  formulaLatex: '\\mathrm{AssetTurnover} = \\frac{\\mathrm{Revenue}}{\\overline{\\mathrm{TotalAssets}}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Asset_turnover',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['revenue', 'assets'],
  currentFormulaVersion: 2,
};
