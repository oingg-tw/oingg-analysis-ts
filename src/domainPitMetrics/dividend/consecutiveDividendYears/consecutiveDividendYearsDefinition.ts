import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const consecutiveDividendYearsDefinition: MetricDefinitionSpec = {
  metricCode: 'consecutiveDividendYears',
  displayName: '連續配息年數',
  unit: '年',
  formulaNote:
    '從最近一個資料完整（四季現金流量表皆有資料）的完整會計年度開始往回數，逐年檢查該年度' +
    '現金流量表「發放股利」（dividendsPaid）加總是否不為 0，遇到未發放（=0）或該年度資料不' +
    '完整（任一季缺漏）就停止計數。若最新一季不是 Q4，代表今年度尚未結束，起算年退回上一個' +
    '完整年度，不把「今年至今」這種未結束的年度算進去。只有 FY 一種 basis——這是跨會計年度' +
    '累計的概念，沒有 Q/TTM 版本。判斷依據是「這年有沒有實際付出股利現金」，不是董事會/股東會' +
    '通過的股利政策（沒有這個資料源）。資料完整度依賴 XBRL 現金流量表回填範圍，回填範圍較短的' +
    '公司連續年數可能被資料缺口低估（保守停止計數，不會誤判成中斷），value=0 代表「有資料、' +
    '確定最近一個完整年度沒配息」，null 代表「連最近一個完整年度的資料都拿不到」，兩者不同。',
  tier: 'derived',
  sources: ['公開發行公司現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['FY'],
  dependsOn: ['dividendsPaid'],
  currentFormulaVersion: 1,
};
