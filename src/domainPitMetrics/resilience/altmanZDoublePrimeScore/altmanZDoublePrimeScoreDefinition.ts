import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const altmanZDoublePrimeScoreDefinition: MetricDefinitionSpec = {
  metricCode: 'altmanZDoublePrimeScore',
  displayName: "Altman Z″-Score 財務危機預警分數（非製造業/新興市場版）",
  unit: '分',
  formulaNote:
    "Z″ = 6.56*X1+3.26*X2+6.72*X3+1.05*X4，X1=(流動資產-流動負債)/總資產、X2=保留盈餘/" +
    '總資產、X3=EBIT(TTM)/總資產、X4=帳面權益(歸屬母公司優先，缺漏退回整體口徑)/總負債。' +
    '刻意沒有 X5（資產週轉率）——原始論文（Altman 1983/1995）認為週轉率在非製造業/新興市場' +
    '產業間差異太大會扭曲跨產業比較，四變數版本因此拿掉這項，跟 altmanZScore（1968，五變數，' +
    'X4 用市值）/altmanZPrimeScore（1983，五變數，X4 用帳面權益）是三個各自發表、獨立登錄' +
    '的模型，不是同一指標的變體。獨立重新計算，不依賴另外兩支已寫入的值。只有 TTM 一種' +
    ' basis。',
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
  ],
  currentFormulaVersion: 1,
};
