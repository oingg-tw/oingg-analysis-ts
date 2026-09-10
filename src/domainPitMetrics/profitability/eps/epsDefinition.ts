import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

  // 第三批遷移（profitability/cashFlow 簡單型 9 支舊架構檔案，共 10 個 metric_code）：
  // eps/bvps/revenuePerShare/dividendPayoutRatio/ocfPerShare/fcfPerShare/ocfToNetIncome/
  // accrualsRatio 都是獨立重新實作（跟 roa 同形狀），不呼叫任何 calculateXxx()。
  // ocfPerShare/fcfPerShare 由 src/domainPitMetrics/quality/cashFlowPerShare/computeCashFlowPerSharePit.ts
  // 一次查詢寫兩個 metric_code（跟 Dupont 家族同一種處理）。sgr/fcfYield 是複合指標，
  // 分別獨立重新計算 ROE TTM+配息率 TTM、每股 FCF+股價，不依賴 roe/dividendPayoutRatio/
  // ocfPerShare/fcfPerShare 這些已寫入的 metric_value，維持每條 pipeline 獨立的原則。
export const epsDefinition: MetricDefinitionSpec = {
  metricCode: 'eps',
  displayName: '每股盈餘 (EPS)',
  unit: '元',
  formulaNote:
    'Q(單季) = 本季淨利*1000/流通股數（股本歷史生效日<=本季報告日的最新一筆），淨利優先採歸屬' +
    '母公司口徑，缺漏退回整體口徑；Q_ANN = Q*4；TTM = 近四季（含本季）淨利加總*1000/流通股數，' +
    '四季不齊為 null。流通股數固定用「本季報告日」當下有效的股本，Q/TTM 共用同一個股數。',
  formulaLatex: '\\mathrm{EPS} = \\frac{\\mathrm{NetIncome}}{\\mathrm{Shares}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%AF%8F%E8%82%A1%E7%9B%88%E9%A4%98',
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares'],
  currentFormulaVersion: 1,
};
