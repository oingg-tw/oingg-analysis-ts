import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const beneishMScoreDefinition: MetricDefinitionSpec = {
  metricCode: 'beneishMScore',
  displayName: 'Beneish M-Score 財報操縱偵測分數',
  unit: '分',
  formulaNote:
    '8 變量迴歸式：M=-4.84+0.92*DSRI+0.528*GMI+0.404*AQI+0.892*SGI+0.115*DEPI-0.172*SGAI' +
    '+4.037*TATA+0.0327*LVGI，除 TATA（單期指標）外，其餘 7 個變量都是本季 vs 去年同季的' +
    '比較。只有 Q 一種 basis，去年同季取法同 piotroskiFScore。',
  formulaLatex:
    '\\mathrm{M} = -4.84 + 0.92\\,\\mathrm{DSRI} + 0.528\\,\\mathrm{GMI} + 0.404\\,\\mathrm{AQI} + 0.892\\,\\mathrm{SGI} + 0.115\\,\\mathrm{DEPI} - 0.172\\,\\mathrm{SGAI} + 4.037\\,\\mathrm{TATA} + 0.0327\\,\\mathrm{LVGI}',
  academicSourceUrl: 'https://doi.org/10.2469/faj.v55.n5.2296',
  referenceUrl: 'https://en.wikipedia.org/wiki/Beneish_M-score',
  tier: 'composite',
  badge: {
    id: 'beneish-m-score',
    name: 'Beneish M-Score',
    nameEn: 'Beneish M-Score',
    author: 'Messod Beneish, 1999',
    summary: '結合 8 個會計比率的模型，用來偵測財報是否存在盈餘操縱的跡象。',
    detail:
      '印第安納大學會計學教授 Messod Beneish 於 1999 年發表，設計初衷是偵測財報上常見的盈餘操縱手法' +
      '（例如提前認列營收、虛增應收帳款）。模型結合應收帳款成長率、毛利率變化、資產品質變化、營收成長率、' +
      '折舊政策變化、銷管費用變化、財務槓桿變化、應計項目等 8 個會計比率，加權計算出一個綜合分數。分數本身' +
      '是統計模型對「財報數字是否出現操縱跡象常見的異常模式」的量化呈現，不等於已認定財報造假。',
    token: 'Q',
    threshold: { description: '< -1.78（Beneish 原始論文劃定的疑似操縱門檻）', denominator: 1, comparator: 'lt', value: -1.78 },
  },
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: [
    'accountsReceivable',
    'revenue',
    'gross_profit',
    'current_assets',
    'property_plant_and_equipment',
    'assets',
    'depreciation',
    'sellingExpenses',
    'adminExpenses',
    'profit_loss_attributable_to_owners_of_parent',
    'profit_loss',
    'netCashFromOperatingActivities',
    'liabilities',
  ],
  currentFormulaVersion: 1,
};
