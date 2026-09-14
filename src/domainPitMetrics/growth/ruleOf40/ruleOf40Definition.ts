import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const ruleOf40Definition: MetricDefinitionSpec = {
  metricCode: 'ruleOf40',
  name: 'Rule of 40',
  nameEn: 'Rule of 40',
  unit: '%',
  formulaNote:
    '= 營收成長率(TTM vs 去年同期TTM) + 自由現金流利潤率(TTM)。營收成長率跟 fcfMargin 的' +
    'TTM 定義一致，但獨立重新計算（不依賴 revenueGrowthRate/fcfMargin 已寫入的值），自由' +
    '現金流 = 營業活動現金流 + 資本支出（來源資料是負值/流出，用加法）。只套用軟體/SaaS' +
    '商業模式（twse-ts/tpex-ts industry=\'30\'資訊服務業或\'36\'數位雲端），非這兩個類股一律' +
    'skipped_no_quarter，不寫入任何列。只有 TTM 一種 basis。',
  formulaLatex: '\\mathrm{RuleOf40} = \\mathrm{RevenueGrowth}_{\\mathrm{TTM}} + \\mathrm{FcfMargin}_{\\mathrm{TTM}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Rule_of_40',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['revenue', 'netCashFromOperatingActivities', 'capitalExpenditures'],
  currentFormulaVersion: 1,
};
