import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const famaFrenchOperatingProfitabilityDefinition: MetricDefinitionSpec = {
  metricCode: 'famaFrenchOperatingProfitability',
  name: 'Fama-French 營業獲利力',
  unit: '%',
  formulaNote:
    '(營收-銷貨成本-推銷費用-管理費用-利息費用)/帳面權益*100，即 Fama & French (2015) ' +
    '五因子模型 RMW 因子背後、單一公司版的營業獲利力比率（operating profitability = ' +
    'Revenue-COGS-SG&A-Interest / Book Equity）。這是 variant_of 完整五因子模型——完整模型' +
    '還需要全市場橫斷面的規模/淨值市值比/獲利力/投資四組排序建構因子報酬序列，再對個股歷史' +
    '報酬跑時間序列迴歸估出五個因子的 beta，這需要全市場批次回填+迴歸引擎，是本服務目前' +
    '完全沒有的基礎設施（見 TECH_DEBT.md「沒有全市場批次回填基礎設施」），這裡只做分子' +
    '容易單獨計算的獲利力比率本身，不做因子建構跟迴歸。Q(單季) = 本季(毛利-推銷費用-' +
    '管理費用-利息費用)/本季期末帳面權益*100；TTM = 近四季(含本季)分子各自加總/本季期末' +
    '帳面權益*100，四季不齊為 null(insufficient_history)。帳面權益優先採歸屬於母公司口徑，' +
    '缺漏退回整體口徑，跟既有 roe/altmanZPrimeScore 同一個 pickEquity 慣例。',
  formulaLatex:
    '\\mathrm{RMW} = \\frac{\\mathrm{Revenue} - \\mathrm{COGS} - \\mathrm{SGA} - \\mathrm{Interest}}{\\mathrm{BookEquity}} \\times 100',
  academicSourceUrl: 'https://doi.org/10.1016/j.jfineco.2014.10.010',
  // 中文維基百科的「Fama-French三因子模型」條目只涵蓋三因子版本，沒有五因子/RMW 內容，
  // 改用英文維基百科（該頁有獨立的 Fama-French five-factor model 段落，涵蓋 RMW/CMA）。
  referenceUrl: 'https://en.wikipedia.org/wiki/Fama%E2%80%93French_three-factor_model',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['gross_profit', 'selling_expense', 'administrative_expense', 'finance_costs', 'equity_attributable_to_owners_of_parent', 'equity'],
  currentFormulaVersion: 1,
};
