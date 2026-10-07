import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-10-07 使用者要求「五年加權 ROE」，拍板以各年平均權益加權：五年全年稅後淨利合計 ÷ 五年平均權益合計。
// 這等於把五個年度 ROE 各用當年平均權益當權重做加權平均——權益規模大的年度影響大，不會被某一年權益很小、ROE 暴衝的年度拉高；
// 簡單平均（不加權）與「近年權重較高（5,4,3,2,1）」兩種算法使用者沒選。每年的淨利、平均權益跟 roe 的 FY 同一套（合併總額口徑、
// (去年底＋今年底)/2，對齊公開資訊觀測站財務分析的年度 ROE），所以五年各年度值可以直接跟 roe FY 對照。
export const roeWeighted5yDefinition: MetricDefinitionSpec = {
  metricCode: 'roeWeighted5y',
  name: '五年加權平均股東權益報酬率',
  nameEn: '5-Year Equity-Weighted ROE',
  unit: '%',
  formulaNote:
    '= 最近五個完整年度的全年稅後淨利合計 / 五個年度平均權益合計 * 100。每個年度的平均權益 = (去年底權益 + 今年底權益)/2，' +
    '淨利與權益都用合併總額（含非控制權益），跟股東權益報酬率（roe）的年度值同一套算法。等同把五個年度 ROE 用各年平均權益加權平均：' +
    '權益規模大的年度影響較大，某一年權益很小造成的 ROE 偏高不會被放大。五份年報或六個年底資產負債表任一缺漏為 null' +
    '（insufficient_history）；平均權益合計 ≤ 0 為 null（zero_or_negative_denominator）。只有 FY 一種 basis，一年一列、座標是窗口最後一年的第四季。',
  formulaLatex:
    '\\mathrm{ROE}_{5y} = \\frac{\\sum_{i=0}^{4} \\mathrm{NetIncome}_{t-i}}{\\sum_{i=0}^{4} \\frac{\\mathrm{Equity}_{t-i-1} + \\mathrm{Equity}_{t-i}}{2}} \\times 100',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%82%A1%E6%9D%B1%E6%AC%8A%E7%9B%8A%E5%A0%B1%E9%85%AC%E7%8E%87',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司年報損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['FY'],
  dependsOn: ['profit_loss', 'profit_loss_attributable_to_owners_of_parent', 'equity', 'equity_attributable_to_owners_of_parent'],
  currentFormulaVersion: 1,
};
