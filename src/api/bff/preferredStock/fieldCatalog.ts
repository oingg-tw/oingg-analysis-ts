import type { PreferredStockFieldCatalogEntry } from './types';

// 2026-09-08 web-nuxt 轉達使用者需求：特別股頁面每個計算/衍生欄位都要能溯源，前端做成
// hover 提示。公式是「欄位層級」的靜態中繼資料（同一個欄位對每一列特別股都是同一條公式，
// 只有輸入值不同），逐筆資料重複帶同一段文字沒有額外資訊量，所以刻意做成獨立端點
// （GET /preferred-stocks/field-catalog），跟 GET /etf-screener/filters 那種欄位目錄
// 端點是同一種精神。
//
// 只列出「有公式、需要解釋」的衍生欄位——像 symbol/issuePrice/dividendRate 這種原始
// passthrough 欄位沒有公式可解釋（值本身就是來源），不需要出現在這裡；README.md 的
// 「逐欄位資料來源對照」已經涵蓋這些欄位的來源說明，職責不重複。
export const PREFERRED_STOCK_FIELD_CATALOG: PreferredStockFieldCatalogEntry[] = [
  {
    field: 'nominalDividendRatePct',
    label: '票面利率',
    formula: 'dividendRate / issuePrice * 100',
    inputs: ['dividendRate', 'issuePrice'],
  },
  {
    field: 'currentYieldPct',
    label: '殖利率（目前殖利率）',
    formula: 'dividendRate / latestClosePrice * 100，隨股價每天變動',
    inputs: ['dividendRate', 'latestClosePrice'],
  },
  {
    field: 'premiumRatePct',
    label: '溢價率',
    formula: '(latestClosePrice - issuePrice) / issuePrice * 100，只在 redeemable=true 時才計算',
    inputs: ['latestClosePrice', 'issuePrice', 'redeemable'],
  },
  {
    field: 'ytcPct',
    label: '贖回殖利率（Yield to Call, YTC）',
    formula:
      '對現金流現值公式用二分法求根：Σ(t=1→n) dividendRate/(1+y)^t + issuePrice/(1+y)^n = latestClosePrice。' +
      'n（期數）依 ytcAssumption 決定；只在 redeemable=true 且 issuePrice/dividendRate/latestClosePrice 都齊全時才計算',
    inputs: ['dividendRate', 'issuePrice', 'latestClosePrice', 'redemptionDate', 'redeemable'],
  },
  {
    field: 'ytcAssumption',
    label: 'YTC 期數假設',
    formula:
      '非計算欄位，是 ytcPct 期數(n)採用哪種假設的分類標記：scheduled_redemption_date（贖回日還沒到，n=無條件進位到贖回日的年數）、' +
      'past_redemption_date_assumed_next_period（有排定贖回日但已經過了，n=1，假設下一次配息後即被贖回）、' +
      'no_scheduled_redemption_date_assumed_next_period（條款本身沒有排定贖回日，n=1，同樣假設下一次配息後即被贖回）',
    inputs: ['redemptionDate', 'redeemable'],
  },
  {
    field: 'ytwPct',
    label: '最差殖利率（Yield to Worst, YTW）',
    formula: 'min(currentYieldPct, ytcPct)，ytcPct 為 null（不可贖回或缺輸入）時退回等於 currentYieldPct',
    inputs: ['currentYieldPct', 'ytcPct'],
  },
];
