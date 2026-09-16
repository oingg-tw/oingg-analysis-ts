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
//
// 2026-09-08 使用者再次要求：formula 文案最長 30 個字元（前端 hover 提示空間有限，
// 完整說明放不下）——這次把原本較長的白話版本壓縮成精簡版，細節（例如溢價率為什麼只有
// 可收回股才算、YTC 假設的三種情境細節）移除，只保留「這是什麼」的核心說明；更完整的
// 解釋交給 README.md 的欄位對照，不在這裡重複塞。新增
// tests/domains/preferredStock/fieldCatalog.test.ts 自動檢查每一筆 formula 都不超過
// 30 個字元，避免之後新增/修改欄位時不小心又寫成長段落。
export const PREFERRED_STOCK_FIELD_CATALOG: PreferredStockFieldCatalogEntry[] = [
  {
    field: 'nominalDividendRatePct',
    label: '票面利率',
    formula: '股息÷發行價×100%，發行時固定，不受股價影響',
    inputs: ['dividendRate', 'issuePrice'],
  },
  {
    field: 'currentYieldPct',
    label: '殖利率',
    formula: '股息÷最新收盤價×100%，反映目前市價的報酬率',
    inputs: ['dividendRate', 'latestClosePrice'],
  },
  {
    field: 'premiumRatePct',
    label: '溢價率',
    formula: '(收盤價−發行價)÷發行價×100%，可收回股適用',
    inputs: ['latestClosePrice', 'issuePrice', 'redeemable'],
  },
  {
    field: 'ytcPct',
    label: '贖回殖利率（YTC）',
    formula: '假設被收回，股息加本金換算的年化報酬率',
    inputs: ['dividendRate', 'issuePrice', 'latestClosePrice', 'redemptionDate', 'redeemable'],
  },
  {
    field: 'ytcAssumption',
    label: '贖回殖利率的計算假設',
    formula: '說明計算YTC用的收回時間假設',
    inputs: ['redemptionDate', 'redeemable'],
  },
  {
    field: 'ytwPct',
    label: '最差殖利率（YTW）',
    formula: '殖利率與YTC取較低者，最保守報酬率估計',
    inputs: ['currentYieldPct', 'ytcPct'],
  },
];

export const FORMULA_MAX_LENGTH = 30;

// 純比對邏輯，拆出來獨立匯出方便測試（見 tests/domains/preferredStock/fieldCatalog.test.ts）
// ——用合成資料就能驗證「真的超過上限時會被抓到」，不用改動真正的
// PREFERRED_STOCK_FIELD_CATALOG 來製造違規情境。這批文案是純中文/英數/標點，不含 emoji，
// 用 formula.length（UTF-16 code unit 數）就夠準，不用 [...formula].length 那種
// code-point 展開（oxlint no-misused-spread 也會擋，emoji 之類的複雜字元反而會被拆成
// 多個 code point 而不是更準確）。
export const findOverlongFormulas = (catalog: PreferredStockFieldCatalogEntry[], maxLength: number): string[] =>
  catalog.filter((entry) => entry.formula.length > maxLength).map((entry) => `"${entry.field}" formula 文案有 ${entry.formula.length} 個字元，超過上限（${maxLength} 字元）：「${entry.formula}」`);

// Module 載入時（server 啟動、或任何 import 這個檔案的測試）就檢查，不等到真的有請求打進
// GET /preferred-stocks/field-catalog 才發現超長——formula 是純靜態資料，沒有理由延後到
// 執行期才驗證。
const overlongFormulas = findOverlongFormulas(PREFERRED_STOCK_FIELD_CATALOG, FORMULA_MAX_LENGTH);
if (overlongFormulas.length > 0) {
  throw new Error(`PREFERRED_STOCK_FIELD_CATALOG 有 ${overlongFormulas.length} 筆 formula 文案超過長度上限：\n${overlongFormulas.join('\n')}`);
}
