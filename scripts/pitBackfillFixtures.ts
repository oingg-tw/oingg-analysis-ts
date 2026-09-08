// Point-in-time backfill 腳本共用的符號/季度範圍——第三批遷移時抽出來（原本
// backfillRoePit.ts/backfillProfitabilityFamilyPit.ts 兩份各自維護一份一樣的常數，
// 當時判斷「兩份小陣列，抽共用不划算」；第三份腳本要寫的時候這個判斷改變，抽成這裡）。
//
// 範圍（沿用第一批 ROE spike 定案的選擇，不重新挑）：
// - 2330/2887：financial_report_announcement 已驗證覆蓋，預期 knowledge_date 大多數
//   knowledgeDateIsFallback=false。
// - 2026-09-08 評估過 mops-ts 提供的跨產業別 XBRL 種子公司（2801銀行/2867保險-人身/
//   2851保險-再保/2855證券商/2881金控），使用者拍板**先不加**：這些產業的財報科目
//   結構跟一般產業不同（revenue/operatingRevenue 這類一般產業 dependsOn 用的
//   XBRL account_code 在這些產業可能不存在或語意不同，銀行股當初就是因為這個原因
//   才另外做 bankAssetQuality/bankCapitalAdequacy 專屬指標，見 BANK_SYMBOLS），
//   直接塞進這組一般產業指標的回填清單會產生大量看起來像 bug、其實是產業結構性
//   不適用的 missing_input——先維持只有一般產業結構的 2330/2887，之後如果要幫
//   保險/證券/金控做指標，應該比照銀行股另開專屬 compute 檔案，不是塞進這裡。
// - 對照組 2317（預設，可用 PIT_ROE_FALLBACK_SYMBOL 覆蓋）：financial_report_announcement
//   完全零筆，保證落到 report_date_fallback；且 114Q4 損益表缺資料，115Q1/115Q2 的 TTM
//   會自然湊不齊。
// - 季度範圍：113Q3~115Q2 共 8 季/家。
// - dataType 只做 '2'（合併報表）。

export const PIT_BACKFILL_COVERED_SYMBOLS = ['2330', '2887'];
export const PIT_BACKFILL_FALLBACK_SYMBOL = process.env.PIT_ROE_FALLBACK_SYMBOL ?? '2317';
export const PIT_BACKFILL_SYMBOLS = [...PIT_BACKFILL_COVERED_SYMBOLS, PIT_BACKFILL_FALLBACK_SYMBOL];

// 113Q3 ~ 115Q2（民國年/季），舊到新排列。
export const PIT_BACKFILL_QUARTERS: { year: string; season: '1' | '2' | '3' | '4' }[] = [
  { year: '113', season: '3' },
  { year: '113', season: '4' },
  { year: '114', season: '1' },
  { year: '114', season: '2' },
  { year: '114', season: '3' },
  { year: '114', season: '4' },
  { year: '115', season: '1' },
  { year: '115', season: '2' },
];
