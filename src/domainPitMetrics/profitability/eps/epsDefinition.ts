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
  tier: 'derived',
  badge: {
    id: 'sp500-earnings-eligibility',
    name: 'S&P 500 獲利資格門檻',
    nameEn: 'S&P 500 Earnings Eligibility Screen',
    author: 'S&P Dow Jones Indices',
    summary: '近四季獲利合計為正、且最近一季也為正，S&P 500 官方採用的獲利穩定性資格審查。',
    detail:
      'S&P Dow Jones Indices 在其公開發布的《S&P U.S. Indices Methodology》裡，明訂公司要被納入 S&P 500' +
      '指數，除了市值、流動性、公眾流通量等條件外，還必須同時符合兩個獲利門檻：最近一季 GAAP 稅後淨利為正，' +
      '且最近連續四季 GAAP 稅後淨利加總也為正。這不是用來衡量「獲利能力多強」的評分方法論，而是指數編製機構' +
      '自己用來篩掉獲利不穩定、可能虧損公司的資格審查——用意是排除帳面上靠一次性收益撐場面、但本業實際上' +
      '正在虧損或獲利極不穩定的公司。',
    threshold: {
      description: '近四季 EPS 合計為正，且最近一季 EPS 也為正（S&P 500 官方納入門檻）',
      denominator: 1,
      allPositiveFieldIds: ['eps.TTM', 'eps.Q'],
    },
  },
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares'],
  currentFormulaVersion: 1,
};
