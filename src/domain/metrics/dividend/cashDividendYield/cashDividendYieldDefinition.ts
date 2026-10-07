import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-10-08 web-nuxt 要求（他們的使用者核准）：股東總回饋率要畫成堆疊長條圖，兩段必須都是真的目錄指標、加總等於母指標
// （容差 0.01 個百分點），買回那段已有 buybackYield，缺股利那段。dividendYield 是交易所每日公告的 EOD 值、口徑不同，不能當一段。
// 這支跟 shareholderYield 共用同一支 resolveShareholderYieldInputs（同一份近四季股利、同一個報告日市值、同一個「近四季齊全」判斷），
// 只取股利那一段，所以 cashDividendYield + buybackYield = shareholderYield（各自四捨五入到 2 位，加總最多差 0.01）、歷史深度相同。
// 2026-09 評估過、因當時沒有下游用途暫緩；這次有了具體用途才做。
export const cashDividendYieldDefinition: MetricDefinitionSpec = {
  metricCode: 'cashDividendYield',
  name: '現金股利殖利率',
  nameEn: 'Cash Dividend Yield',
  unit: '%',
  formulaNote:
    '= |近四季股利發放現金加總| / 市值 * 100，市值是本季報告日的收盤價 × 流通在外普通股。分子、分母與股東總回饋率（shareholderYield）' +
    '的股利那一段完全相同，所以這支加上買回殖利率（buybackYield）等於股東總回饋率（各自四捨五入到小數 2 位，加總最多差 0.01）。' +
    '跟殖利率（dividendYield，交易所每日公告）不同：這支用現金流量表實際發放的股利、隨季報更新。股利發放現金缺漏視為 0；' +
    '近四季任一季的現金流量表或買回庫藏股（XBRL 長表）整列查無時為 insufficient_history，跟股東總回饋率同一個判斷。只有 TTM 一種 basis。',
  formulaLatex: '\\mathrm{CashDividendYield} = \\frac{|\\mathrm{DividendsPaid}|}{\\mathrm{MarketCap}} \\times 100',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E7%8F%BE%E9%87%91%E6%AE%96%E5%88%A9%E7%8E%87',
  tier: 'derived',
  sources: ['公開發行公司現金流量表（XBRL）', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['dividendsPaid', 'marketCap'],
  currentFormulaVersion: 1,
};
