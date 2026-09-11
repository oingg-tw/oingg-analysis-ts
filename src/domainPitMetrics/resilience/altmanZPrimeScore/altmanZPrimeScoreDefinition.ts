import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';
import { altmanZPrimeScoreBadge } from './altmanZPrimeScoreBadge';

export const altmanZPrimeScoreDefinition: MetricDefinitionSpec = {
  metricCode: 'altmanZPrimeScore',
  displayName: "非上市版 Altman Z′-Score 危機預警分數",
  unit: '分',
  formulaNote:
    "Z′ = 0.717*X1+0.847*X2+3.107*X3+0.42*X4+0.998*X5，X1=(流動資產-流動負債)/總資產、" +
    'X2=保留盈餘/總資產、X3=EBIT(TTM)/總資產、X4=帳面權益(歸屬母公司優先，缺漏退回整體' +
    '口徑)/總負債、X5=營收(TTM)/總資產。跟既有 altmanZScore（1968 原版，X4 用市值）是兩個' +
    '各自發表的模型（Altman 1983），不是同一指標的變體——X4 換成帳面權益、係數整套換新，' +
    '不是原版係數乘比例。獨立重新計算，不依賴 altmanZScore 已寫入的值。只有 TTM 一種' +
    ' basis，理由跟 altmanZScore 一致。',
  formulaLatex: "\\mathrm{Z}' = 0.717X_1 + 0.847X_2 + 3.107X_3 + 0.42X_4 + 0.998X_5",
  // Altman 1983 原始出處是專書《Corporate Financial Distress》，Altman 自己 2000 年的
  // 回顧論文重新列出 Z'/Z'' 完整係數且免費公開，比書籍更容易查證，用這篇當 academicSourceUrl；
  // NYU Stern 官網當下連線不穩（500），改用 Wayback Machine 存檔版本確保連結長期可用。
  academicSourceUrl: 'https://web.archive.org/web/20180418070236/http://pages.stern.nyu.edu/~ealtman/PredFnclDistr.pdf',
  referenceUrl: 'https://en.wikipedia.org/wiki/Altman_Z-score',
  tier: 'composite',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  badge: altmanZPrimeScoreBadge,
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: [
    'current_assets',
    'current_liabilities',
    'assets',
    'retained_earnings',
    'liabilities',
    'equity_attributable_to_owners_of_parent',
    'equity',
    'profit_loss_before_tax',
    'finance_costs',
    'revenue',
  ],
  currentFormulaVersion: 1,
};
