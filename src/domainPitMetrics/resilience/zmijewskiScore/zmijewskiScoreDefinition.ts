import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const zmijewskiScoreDefinition: MetricDefinitionSpec = {
  metricCode: 'zmijewskiScore',
  displayName: 'Zmijewski Score 財務危機預警分數',
  unit: '分',
  formulaNote:
    'X = -4.3-4.5*(淨利TTM/總資產)+5.7*(總負債/總資產)-0.004*(流動資產/流動負債)。淨利用' +
    'TTM（原始模型用年度財報校準，TTM 是最接近的替代口徑，跟 ROE/ROA 邏輯一致），其餘皆為' +
    '本季資產負債表快照。沒有 YoY，只有 TTM 一種 basis。',
  formulaLatex:
    '\\mathrm{X} = -4.3 - 4.5\\,\\frac{\\mathrm{NetIncome}}{\\mathrm{TotalAssets}} + 5.7\\,\\frac{\\mathrm{TotalLiabilities}}{\\mathrm{TotalAssets}} - 0.004\\,\\frac{\\mathrm{CurrentAssets}}{\\mathrm{CurrentLiabilities}}',
  academicSourceUrl: 'https://doi.org/10.2307/2490859',
  // 2026-09-10 查證過：沒有可靠的中文/英文維基百科專屬條目（只有第三方教學網站），
  // referenceUrl 刻意留空，不要拿不夠權威的頁面充數。
  tier: 'composite',
  badge: {
    id: 'zmijewski-score',
    name: 'Zmijewski Score',
    nameEn: 'Zmijewski Score',
    author: 'Mark Zmijewski, 1984',
    summary: '用機率模型評估財務困境可能性，聚焦資產報酬率、槓桿與流動性三個面向。',
    detail:
      '芝加哥大學會計學教授 Mark Zmijewski 於 1984 年發表，同樣是財務危機預測模型，採用機率單位迴歸' +
      '（probit model），聚焦在資產報酬率（ROA）、財務槓桿（負債／總資產）、流動性（流動資產／流動負債）' +
      '這 3 個核心比率上，計算出企業財務困境的機率。模型設計上刻意只用少數幾個核心比率，是為了在樣本外的' +
      '預測穩定度上做取捨。跟其他財務危機模型一樣，反映的是統計關聯性。',
    token: 'TTM',
    threshold: { description: '< 0.5（機率模型的標準判別界線）', denominator: 1, comparator: 'lt', value: 0.5 },
  },
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: [
    'profit_loss_attributable_to_owners_of_parent',
    'profit_loss',
    'assets',
    'liabilities',
    'current_assets',
    'current_liabilities',
  ],
  currentFormulaVersion: 1,
};
