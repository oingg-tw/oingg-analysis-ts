// 大盤加權指數逐日收盤（export.daily_taiex_index）——GET /market/taiex-daily-price 用；指標核心的 beta 走
// MarketDataPort.listTaiexClosesSince（同一張表、不同形狀），刻意分開讓 tests/fakes/pit 不用實作這支。
// 實作在 infrastructure/repositories/twse/taiexIndex.ts。
export interface RawTaiexDailyPriceRow {
  trade_date: Date;
  close: unknown; // Decimal 物件，Number() 在呼叫端做
}

export interface TaiexIndexPort {
  // 由新到舊取 limit 筆。
  listLatestTaiexDailyPrices(limit: number): Promise<RawTaiexDailyPriceRow[]>;
}
