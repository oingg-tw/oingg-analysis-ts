import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-22 formulaVersion 2：分母改期間平均（Q = 本季與上季期末平均、TTM = 近四季窗口 5 個季末平均），理由與定義見
// application/metrics/shared/averageBalances.ts——期末分母在台股會因 6 月股東會決議股利轉列負債，讓每年 Q2 的 TTM 值假性跳升。
export const equityMultiplierDefinition: MetricDefinitionSpec = {
  metricCode: 'equityMultiplier',
  name: '權益乘數',
  unit: '倍',
  formulaNote:
    'Q = 平均總資產/平均權益，兩者都是 (本季期末 + 上季期末)/2；TTM = 近四季窗口 5 個季末（t−4 … t）平均總資產/平均權益。' +
    '權益優先採歸屬於母公司口徑，缺漏退回整體口徑。TTM basis 是 2026-09-22 隨分母改平均新增的——讓 roe.TTM = ' +
    'netProfitMargin.TTM × assetTurnover.TTM × equityMultiplier.TTM 的杜邦恆等式用儲存欄位就對得上；Q 的恆等式用 Q。' +
    '任一季末資產負債表不齊為 null。（formulaVersion 1 只有 Q、用本季單一期末值。）',
  formulaLatex: '\\mathrm{EquityMultiplier} = \\frac{\\overline{\\mathrm{TotalAssets}}}{\\overline{\\mathrm{Equity}}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%AC%8A%E7%9B%8A%E4%B9%98%E6%95%B8',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['assets', 'equity_attributable_to_owners_of_parent', 'equity'],
  currentFormulaVersion: 2,
};
