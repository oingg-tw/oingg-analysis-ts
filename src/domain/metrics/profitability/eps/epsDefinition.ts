import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

  // 第三批遷移（profitability/cashFlow 簡單型 9 支舊架構檔案，共 10 個 metric_code）：
  // eps/bvps/revenuePerShare/dividendPayoutRatio/ocfPerShare/fcfPerShare/ocfToNetIncome/
  // accrualsRatio 都是獨立重新實作（跟 roa 同形狀），不呼叫任何 calculateXxx()。
  // ocfPerShare/fcfPerShare 由 src/domainPitMetrics/quality/cashFlowPerShare/computeCashFlowPerSharePit.ts
  // 一次查詢寫兩個 metric_code（跟 Dupont 家族同一種處理）。sgr/fcfYield 是複合指標，
  // 分別獨立重新計算 ROE TTM+配息率 TTM、每股 FCF+股價，不依賴 roe/dividendPayoutRatio/
  // ocfPerShare/fcfPerShare 這些已寫入的 metric_value，維持每條 pipeline 獨立的原則。
export const epsDefinition: MetricDefinitionSpec = {
  metricCode: 'eps',
  name: '每股盈餘',
  unit: '元',
  formulaNote:
    'Q(單季) = (本季淨利 − 近四季特別股股利÷4)*1000/流通股數；TTM = (近四季（含本季）淨利加總 − 近四季特別股股利)' +
    '*1000/流通股數，四季不齊為 null。照 IAS 33 基本每股盈餘的做法：分子只算屬於普通股的部分（特別股股利取權益變動表' +
    '宣告數；沒有權益類特別股股本就不扣），流通股數 = 已發行股數（股本歷史生效日<=本季報告日的最新一筆）− 特別股股數' +
    '（特別股股本÷面額）− 庫藏股股數（本公司及子公司持有，最近一季季末）。淨利優先採歸屬母公司口徑，缺漏退回整體口徑。' +
    '流通股數固定用「本季報告日」當下有效的股本，Q/TTM 共用同一個股數。' +
    'FY(年報) = 年報公告的基本每股盈餘，直接讀取不重算（官方用全年加權平均流通股數），座標是該年度第四季。',
  formulaLatex: '\\mathrm{EPS} = \\frac{\\mathrm{NetIncome} - \\mathrm{PreferredDividends}}{\\mathrm{OutstandingCommonShares}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%AF%8F%E8%82%A1%E7%9B%88%E9%A4%98',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司年度財務報告（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM', 'FY'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'outstandingCommonShares', 'basic_earnings_loss_per_share'],
  currentFormulaVersion: 1,
};
