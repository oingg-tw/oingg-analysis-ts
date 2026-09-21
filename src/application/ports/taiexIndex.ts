// 大盤加權指數逐日收盤（export.daily_taiex_index）——GET /market/taiex-daily-price 用；指標核心的 beta 走
// MarketDataPort.listTaiexClosesSince（同一張表、不同形狀），刻意分開讓 tests/fakes/pit 不用實作這支。
// 實作在 infrastructure/repositories/twse/taiexIndex.ts。
export interface RawTaiexDailyPriceRow {
  trade_date: Date;
  close: unknown; // Decimal 物件，Number() 在呼叫端做
}

// 2026-09-21 web-nuxt 要畫 1999 年起的利率循環對照圖：2000 筆日頻上限只回到 2018-07，但畫 25 年不需要日頻，
// 所以加彙總粒度（每週/每月取最後一個交易日的收盤）而不是放大上限。
export type TaiexInterval = 'daily' | 'weekly' | 'monthly';

export interface TaiexIndexPort {
  // 由新到舊取 limit 筆；weekly/monthly 是每個區間最後一個交易日那筆（trade_date 仍是實際交易日）。
  listLatestTaiexDailyPrices(limit: number, interval: TaiexInterval): Promise<RawTaiexDailyPriceRow[]>;
}
