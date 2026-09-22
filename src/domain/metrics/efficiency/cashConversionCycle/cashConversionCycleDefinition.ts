import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const cashConversionCycleDefinition: MetricDefinitionSpec = {
  metricCode: 'cashConversionCycle',
  name: '現金轉換循環',
  unit: '天',
  formulaNote:
    'CCC = DIO + DSO − DPO。只有 TTM 一種 basis（跟三個組成天數一致）。三個組成任一為' +
    'null，不管原因為何，一律回報 missing_input——除非是因為 TTM 四季不齊，這種情況回報' +
    'insufficient_history（跟 Dupont 家族的複合值傳染判斷一致）。（2026-09-22 formulaVersion 2：上游週轉率的分母改成期間平均，這支跟著換版；公式本身不變。）',
  formulaLatex: '\\mathrm{CCC} = \\mathrm{DIO} + \\mathrm{DSO} - \\mathrm{DPO}',
  academicSourceUrl: 'http://www.jstor.org/stable/3665310',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E7%8E%B0%E9%87%91%E5%BE%AA%E7%8E%AF%E5%91%A8%E6%9C%9F',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['operating_costs', 'inventories', 'revenue', 'accountsReceivable', 'accountsPayable'],
  currentFormulaVersion: 2,
};
