import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

  // 第二批遷移（ROA + Dupont 拆解家族）：roa 跟 roe 同形狀，dupont 家族的 4 個 metric_code
  // 是第一次遇到「一個概念天生由多個數字組成」的複合指標，拆成多個獨立 metric_code（各自
  // 單一數字），不是改 metric_values schema 塞多欄位——這是之後 ROIC/ROCE/多因子指標要
  // 複用的先例。5 個都是獨立於 src/domainMetrics/roa.ts|margins.ts|turnoverRatio.ts|dupont.ts
  // 的重新實作（src/domainPitMetrics/profitability/roa/computeRoaPit.ts、src/domainPitMetrics/shared/dupont/computeDupontFamilyPit.ts），
  // 不呼叫任何 calculateXxx()、也不互相讀取彼此已寫入的 metric_value 列。
// 2026-09-22 formulaVersion 2：分母改期間平均（Q = 本季與上季期末平均、TTM = 近四季窗口 5 個季末平均），理由與定義見
// application/metrics/shared/averageBalances.ts——期末分母在台股會因 6 月股東會決議股利轉列負債，讓每年 Q2 的 TTM 值假性跳升。
export const roaDefinition: MetricDefinitionSpec = {
  metricCode: 'roa',
  name: 'ROA',
  unit: '%',
  formulaNote:
    'Q(單季) = 本季淨利/平均總資產*100，平均總資產 = (本季期末 + 上季期末)/2，淨利優先採歸屬於母公司口徑，缺漏退回整體口徑；' +
    'TTM = 近四季（含本季）淨利加總/平均總資產*100，平均總資產 = 近四季窗口 5 個季末（t−4 … t）的平均。四季損益表或任一季末資產負債表不齊為 null。' +
    '（formulaVersion 1 分母是本季單一期末總資產。）',
  formulaLatex: '\\mathrm{ROA} = \\frac{\\mathrm{NetIncome}}{\\overline{\\mathrm{TotalAssets}}} \\times 100',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%B3%87%E7%94%A2%E5%A0%B1%E9%85%AC%E7%8E%87',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'assets'],
  currentFormulaVersion: 2,
};
