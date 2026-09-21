import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const threeMarginsRisingDefinition: MetricDefinitionSpec = {
  metricCode: 'threeMarginsRising',
  name: '三率三升',
  nameEn: 'Three Margins Rising',
  unit: '分',
  formulaNote:
    '毛利率、營業利益率、稅後淨利率三個比率，各自「本季 > 上一季」且「本季 > 去年同季」（雙重驗證，' +
    '任一邊只打平或下滑都不算）通過數加總（0-3）。三項判定需全部可算才有分數，任一算不出來整體為 ' +
    'null。獨立重新呼叫三個率各自的既有計算（毛利率/營業利益率沿用 computeMarginsFamily、稅後淨利率' +
    '沿用 computeDupontFamily），不重寫任何一條公式；上一季/去年同季分別是三率各自 Q 值在該座標的既有' +
    '計算結果，不是讀 metric_values 已寫入的值。只有 Q 一種 basis——這是逐季對照，沒有 TTM 概念。',
  formulaLatex:
    '\\mathrm{ThreeMarginsRising} = \\sum_{i=1}^{3} [\\mathrm{Margin}_{i,t} > \\mathrm{Margin}_{i,t-1}] \\cdot [\\mathrm{Margin}_{i,t} > \\mathrm{Margin}_{i,t-4}]',
  referenceUrl:
    'https://tw.stock.yahoo.com/news/%E8%B2%A1%E5%A0%B1-%E4%B8%89%E7%8E%87%E4%B8%89%E5%8D%87-%E6%AF%9B%E5%88%A9%E7%8E%87-%E7%87%9F%E7%9B%8A%E7%8E%87-%E6%B7%A8%E5%88%A9%E7%8E%87-071217654.html',
  tier: 'composite',
  sources: ['公開發行公司損益表（XBRL）', '保險業損益明細表（XBRL，保險業適用）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['revenue', 'gross_profit', 'operatingIncome', 'profit_loss_attributable_to_owners_of_parent', 'profit_loss'],
  currentFormulaVersion: 1,
};
