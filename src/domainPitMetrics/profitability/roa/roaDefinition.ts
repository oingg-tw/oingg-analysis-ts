import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

  // 第二批遷移（ROA + Dupont 拆解家族）：roa 跟 roe 同形狀，dupont 家族的 4 個 metric_code
  // 是第一次遇到「一個概念天生由多個數字組成」的複合指標，拆成多個獨立 metric_code（各自
  // 單一數字），不是改 metric_values schema 塞多欄位——這是之後 ROIC/ROCE/多因子指標要
  // 複用的先例。5 個都是獨立於 src/domainMetrics/roa.ts|margins.ts|turnoverRatio.ts|dupont.ts
  // 的重新實作（src/domainPitMetrics/profitability/roa/computeRoaPit.ts、src/domainPitMetrics/shared/dupont/computeDupontFamilyPit.ts），
  // 不呼叫任何 calculateXxx()、也不互相讀取彼此已寫入的 metric_value 列。
export const roaDefinition: MetricDefinitionSpec = {
  metricCode: 'roa',
  name: 'ROA',
  unit: '%',
  formulaNote:
    'Q(單季) = 本季淨利/本季期末總資產*100，淨利優先採歸屬於母公司口徑，缺漏退回整體口徑；' +
    'TTM = 近四季（含本季）淨利加總/本季期末總資產*100，四季不齊為 null。',
  formulaLatex: '\\mathrm{ROA} = \\frac{\\mathrm{NetIncome}}{\\mathrm{TotalAssets}} \\times 100',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%B3%87%E7%94%A2%E5%A0%B1%E9%85%AC%E7%8E%87',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'assets'],
  currentFormulaVersion: 1,
};
