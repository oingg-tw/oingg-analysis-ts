import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const piotroskiFScoreDefinition: MetricDefinitionSpec = {
  metricCode: 'piotroskiFScore',
  name: 'Piotroski F-Score 財務體質評分',
  unit: '分',
  notApplicableToFinancialIndustry: true,
  formulaNote:
    '9 個二元訊號（ROA 為正、CFO 為正、ROA 較去年同季提升、CFO>淨利、長期負債比率較去年同季' +
    '下降、流動比率較去年同季提升、流通股數未增加、毛利率較去年同季提升、總資產週轉率較去年' +
    '同季提升）通過數加總（0-9）。9 訊號需全部可判斷才有分數，任一無法判斷則整體為 null。' +
    '只有 Q 一種 basis——純粹本季 vs 去年同季的單點比較，沒有 TTM/年化概念。去年同季用' +
    'getPastNQuarters({rocYear,season},5)[0] 取得，不是專門的新機制。（2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股，已發行 − 特別股 − 庫藏股。）（2026-09-27 formulaVersion 3：跨期比較的每股數字做面額還原，股票分割不算每股價值變化。）',
  formulaLatex: '\\mathrm{FScore} = \\sum_{i=1}^{9} \\mathrm{Signal}_i,\\quad \\mathrm{Signal}_i \\in \\{0,1\\}',
  academicSourceUrl: 'https://doi.org/10.2307/2672906',
  referenceUrl: 'https://en.wikipedia.org/wiki/Piotroski_F-score',
  tier: 'composite',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）', '公開發行公司現金流量表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: [
    'profit_loss_attributable_to_owners_of_parent',
    'profit_loss',
    'assets',
    'netCashFromOperatingActivities',
    'longTermBorrowings',
    'current_assets',
    'current_liabilities',
    'gross_profit',
    'revenue',
    'outstandingCommonShares',
  ],
  currentFormulaVersion: 4,
};
