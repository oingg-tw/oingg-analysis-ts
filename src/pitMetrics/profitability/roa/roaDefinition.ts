import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

  // 第二批遷移（ROA + Dupont 拆解家族）：roa 跟 roe 同形狀，dupont 家族的 4 個 metric_code
  // 是第一次遇到「一個概念天生由多個數字組成」的複合指標，拆成多個獨立 metric_code（各自
  // 單一數字），不是改 metric_values schema 塞多欄位——這是之後 ROIC/ROCE/多因子指標要
  // 複用的先例。5 個都是獨立於 src/domainMetrics/roa.ts|margins.ts|turnoverRatio.ts|dupont.ts
  // 的重新實作（src/pitMetrics/profitability/roa/computeRoaPit.ts、src/pitMetrics/shared/dupont/computeDupontFamilyPit.ts），
  // 不呼叫任何 calculateXxx()、也不互相讀取彼此已寫入的 metric_value 列。
export const roaDefinition: MetricDefinitionSpec = {
  metricCode: 'roa',
  displayName: '資產報酬率 (ROA)',
  unit: '%',
  formulaNote:
    'Q(單季) = 本季淨利/本季期末總資產*100，淨利優先採歸屬於母公司口徑，缺漏退回整體口徑；' +
    'Q_ANN = Q*4（簡易年化）；TTM = 近四季（含本季）淨利加總/本季期末總資產*100，四季不齊為 null。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'assets'],
  currentFormulaVersion: 1,
};
