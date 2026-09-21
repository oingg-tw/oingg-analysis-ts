import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——單季即可，見
// computeNonOperatingIncomeRatioPit.ts 檔頭說明。只有 Q 一種 basis。
export const nonOperatingIncomeRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'nonOperatingIncomeRatio',
  name: '業外損益占稅前淨利比',
  unit: '%',
  formulaNote: '= (稅前淨利 - 營業利益) ÷ 稅前淨利，數值越高代表獲利越依賴業外（非本業）活動。',
  formulaLatex: '\\mathrm{NonOpIncomeRatio} = \\dfrac{\\mathrm{PretaxIncome} - \\mathrm{OperatingIncome}}{\\mathrm{PretaxIncome}}',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_before_tax', 'profit_loss_from_operating_activities'],
  currentFormulaVersion: 1,
};
