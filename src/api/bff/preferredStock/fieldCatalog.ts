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
// formula 欄位會直接顯示給終端使用者看（前端 hover 提示），2026-09-08 使用者要求
// 用字要調整——不能出現 camelCase 變數名稱（dividendRate/issuePrice 這種）或工程用語
// （null、redeemable=true、enum 原始值），一律寫成一般投資人看得懂的白話說明。inputs
// 陣列維持技術欄位名稱不變（給前端程式對照用，不是給使用者看的文字）。
export const PREFERRED_STOCK_FIELD_CATALOG: PreferredStockFieldCatalogEntry[] = [
  {
    field: 'nominalDividendRatePct',
    label: '票面利率',
    formula: '股息 ÷ 發行價 × 100%，是發行當時訂定的固定利率，不會隨股價變動。',
    inputs: ['dividendRate', 'issuePrice'],
  },
  {
    field: 'currentYieldPct',
    label: '殖利率',
    formula: '股息 ÷ 最新收盤價 × 100%，隨股價每天變動，反映用目前市價買進的實際報酬率。',
    inputs: ['dividendRate', 'latestClosePrice'],
  },
  {
    field: 'premiumRatePct',
    label: '溢價率',
    formula:
      '(最新收盤價 − 發行價) ÷ 發行價 × 100%。只有可被公司收回的特別股才會計算——公司收回時是按發行價買回，' +
      '現價已經漲超過發行價時，代表用市價買進的投資人有被收回、只能拿回較低金額的風險。',
    inputs: ['latestClosePrice', 'issuePrice', 'redeemable'],
  },
  {
    field: 'ytcPct',
    label: '贖回殖利率（YTC）',
    formula:
      '假設這檔特別股在可被收回的時間點被公司收回，把之後領到的股息加上收回時拿回的金額，換算成年化報酬率。' +
      '只有可被公司收回、且發行價/股息/股價這幾項資料都齊全時才會計算得出來。',
    inputs: ['dividendRate', 'issuePrice', 'latestClosePrice', 'redemptionDate', 'redeemable'],
  },
  {
    field: 'ytcAssumption',
    label: '贖回殖利率的計算假設',
    formula:
      '說明計算贖回殖利率時用的是哪一種收回時間假設：已經有明確排定的收回日期；原訂收回日期雖然已過但公司' +
      '尚未真的收回，假設下一次配息後就會被收回；或條款本身沒有訂定明確的收回日期，同樣假設下一次配息後就會' +
      '被收回。後兩種都是簡化假設，不代表公司實際排定的時間表。',
    inputs: ['redemptionDate', 'redeemable'],
  },
  {
    field: 'ytwPct',
    label: '最差殖利率（YTW）',
    formula:
      '殖利率跟贖回殖利率兩者取比較低的一個，代表最保守情境下的報酬率估計。如果這檔特別股不可被收回、或資料' +
      '不足以算出贖回殖利率，就直接等於殖利率。',
    inputs: ['currentYieldPct', 'ytcPct'],
  },
];
