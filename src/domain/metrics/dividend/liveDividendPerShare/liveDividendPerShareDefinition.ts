import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-10-05 使用者拍板：持股頁「預估年度股利」改用「近 12 個月實際除息（截至今天）」。原本讀 dividendPerShare.TTM，
// 窗口截到最新財報季末，年配公司除息日只要比去年晚一點就整個掉到窗口外變 0（3231：2025-06-03 配 3.8、2026-07-08 配 5.5，
// 115Q2 那列是 0；2364 同理），前端把 0 當真值加總，預估年度股利默默少算。跟 ETF 的 trailing12MonthDistributionPerUnit 同一個口徑。
// web-nuxt 要求做成 screener 欄位（/screener/values 批次讀），所以比照 live* 存成逐日快照，不是逐檔端點。
export const liveDividendPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'liveDividendPerShare',
  name: '每股股利',
  nameSuffix: '近12個月',
  unit: '元',
  formulaNote:
    '= 除息日落在「最新交易日往前一年（不含）～最新交易日（含）」的普通股每股現金股利公告值加總（盈餘分配＋法定盈餘公積與資本公積發放），' +
    '跨過股票分割、配股或股數合併式減資的除息換算到最新交易日的股數基準。跟 dividendPerShare.TTM（窗口截到最新財報季末）是並存的兩支：' +
    '這支每個交易日都往前滾，年配公司除息日早晚不會讓它掉成 0。窗口內沒有除息為 0；股利公告資料一筆都沒有為 null。',
  formulaLatex: '\\mathrm{DividendPerShare}_{\\mathrm{T12M}} = \\sum_{\\text{近 12 個月除息}} \\mathrm{CashDividendPerCommonShare}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Dividend',
  tier: 'derived',
  sources: ['公開資訊觀測站股利分派公告', '證交所／櫃買中心每日收盤價'],
  group: 'snapshot',
  allowedSnapshotCadences: ['EOD'],
  dependsOn: ['cash_dividend_from_earnings', 'cash_dividend_from_legal_reserve_and_capital_surplus', 'ex_dividend_date', 'daily_price.close'],
  currentFormulaVersion: 1,
};
