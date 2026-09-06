// Point-in-time backfill 腳本共用的符號/季度範圍——第三批遷移時抽出來（原本
// backfillRoePit.ts/backfillProfitabilityFamilyPit.ts 兩份各自維護一份一樣的常數，
// 當時判斷「兩份小陣列，抽共用不划算」；第三份腳本要寫的時候這個判斷改變，抽成這裡）。
//
// 範圍（沿用第一批 ROE spike 定案的選擇，不重新挑）：
// - 2330/2887：financial_report_announcement 已驗證覆蓋，預期 knowledge_date 大多數
//   knowledgeDateIsFallback=false。
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
