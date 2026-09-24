import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——總槓桿度
// DTL，見 src/domainPitMetrics/resilience/leverageDegreeFamily/
// computeLeverageDegreeFamilyPit.ts 檔頭說明。YoY（本季 vs 去年同季），只有 Q 一種 basis。
export const totalLeverageDegreeDefinition: MetricDefinitionSpec = {
  metricCode: 'totalLeverageDegree',
  name: '總槓桿度',
  unit: '倍',
  formulaNote: '= EPS 年增率(%) ÷ 營收年增率(%)（本季 vs 去年同季），衡量營收變動對每股盈餘變動的放大效果（營業槓桿+財務槓桿的複合效果）。',
  formulaLatex: '\\mathrm{DTL} = \\dfrac{\\mathrm{EPSPctChange}}{\\mathrm{RevenuePctChange}}',
  referenceUrl: 'https://www.investopedia.com/terms/d/degreeoftotalleverage.asp',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'revenue', 'paidInShares'],
  currentFormulaVersion: 1,
};
