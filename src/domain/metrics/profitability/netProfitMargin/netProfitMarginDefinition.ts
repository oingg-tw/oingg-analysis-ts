import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const netProfitMarginDefinition: MetricDefinitionSpec = {
  metricCode: 'netProfitMargin',
  name: '稅後淨利率',
  unit: '%',
  // 2026-10-08 補上：純銀行照銀行口徑算得出值（見 application/metrics/shared/bankAwareIncome.ts），金控、保險等算不出來的
  // 原本標 missing_input／insufficient_history，讀者會以為「以後會有」，改標不適用（9/28 使用者「金融業不適用的就標示不適用」）。
  notApplicableToFinancialIndustry: 'exceptBanks',
  formulaNote:
    'Q(單季) = 本季淨利/本季營收*100，淨利優先採總額（本期淨利，含非控制權益），缺漏退回歸屬於母公司口徑；' +
    'TTM = 近四季（含本季）淨利加總/近四季營收加總*100，四季不齊為 null。' +
    '沒有 Q_ANN——flow/flow 比率年化沒有意義（跟 src/domainMetrics/margins.ts 現有規則一致）。' +
    '（2026-10-04 新增）FY(年度) = 年報全年本期淨利（總額，含非控制權益）/全年營業收入*100，跟證交所營益分析的稅後純益率同一個算法（官方用總額，不是歸屬母公司）；座標是該年度第四季。',
  formulaLatex: '\\mathrm{NetProfitMargin} = \\frac{\\mathrm{NetIncome}}{\\mathrm{Revenue}} \\times 100',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%B7%A8%E5%88%A9%E7%8E%87',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）', '銀行業損益表明細（XBRL，銀行適用）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM', 'FY'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'revenue'],
  // 2026-10-09 formulaVersion 2：Q／TTM 的淨利改成總額優先（原本歸屬母公司優先），使用者要求對齊券商軟體（2838 115Q2 券商 20.72%），
  // 也跟 FY 同口徑。有非控制權益的公司值會變；杜邦拆解 ROE 的淨利率因子不受影響（仍歸屬母公司，見 computeDupontFamily.ts）。
  currentFormulaVersion: 2,
};
