import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const accrualsRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'accrualsRatio',
  name: '應計項目比率',
  unit: '%',
  formulaNote:
    'Q(單季) = (本季淨利 − 本季營業活動現金流 − 本季投資活動現金流) / 平均總資產 * 100；' +
    'TTM 分子改用近四季（含本季）加總，分母同樣改用平均總資產。' +
    '（2026-09-22 formulaVersion 2：分母改期間平均——Q 取本季與上季期末兩點、TTM 取近四季窗口 5 個季末的平均，理由見 application/metrics/shared/averageBalances.ts；v1 用本季單一期末值。）Sloan (1996) 原文就是 average total assets。',
  formulaLatex:
    '\\mathrm{AccrualsRatio} = \\frac{\\mathrm{NetIncome} - \\mathrm{CFO} - \\mathrm{CFI}}{\\mathrm{TotalAssets}} \\times 100',
  // 2026-09-10 補：雖然算式本身是單一比率（tier 維持 derived，不因為出處升級成 composite，
  // 見 metricDefinitionSpec.ts 的判斷標準），但確實有單一可指名論文出處（Sloan 1996），
  // 是 web-nuxt 轉來的 badge 資料附帶查到的引用，一併補上。
  academicSourceUrl: 'https://doi.org/10.2308/TAR-9608042309',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）', '公開發行公司現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: [
    'profit_loss_attributable_to_owners_of_parent',
    'profit_loss',
    'netCashFromOperatingActivities',
    'netCashFromInvestingActivities',
    'assets',
  ],
  currentFormulaVersion: 2,
};
