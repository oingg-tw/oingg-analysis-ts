import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——財務槓桿度
// DFL，見 src/domainPitMetrics/resilience/leverageDegreeFamily/
// computeLeverageDegreeFamilyPit.ts 檔頭說明。YoY（本季 vs 去年同季），只有 Q 一種 basis。
export const financialLeverageDegreeDefinition: MetricDefinitionSpec = {
  metricCode: 'financialLeverageDegree',
  name: '財務槓桿度',
  unit: '倍',
  formulaNote: '= EPS 年增率(%) ÷ EBIT 年增率(%)（本季 vs 去年同季），衡量 EBIT 變動對每股盈餘變動的放大效果，數值越高代表財務槓桿（負債利息）對盈餘波動的放大程度越大。',
  formulaLatex: '\\mathrm{DFL} = \\dfrac{\\mathrm{EPSPctChange}}{\\mathrm{EBITPctChange}}',
  referenceUrl: 'https://www.investopedia.com/terms/d/degreeoffinancialleverage.asp',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'profit_loss_from_operating_activities', 'paidInShares'],
  currentFormulaVersion: 1,
};
