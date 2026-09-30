// 2026-09-30 twse-ts 實查：證交所 BWIBBU 從 **2026-08-28** 起把「沒配息」的殖利率從 0.00 改成空白（twse-ts 照原樣存 null）。
// 2005～2026-08-27 整條序列 0 個 null、沒配息一律 0.00；8/27 是 0 的 233 家，8/28 起同一批變 null。改版前空白代表「沒公布」，
// 改版後兩者分不開——但改版前兩天空白是 0 筆，「沒公布」實務上極少，使用者 2026-09-30 拍板：8/28 起上市的空白殖利率當 0。
// 不當 0 的後果（都不會報錯）：上市不配息公司從 dividendYield 變 missing_input、上櫃仍是 0，兩個市場口徑不一致；殖利率時間序列
// 在 8/28 斷點；估值排行、產業平均、供給面 ERP 的母體悄悄少掉約 22% 的上市公司。只在上市這側、只在這個日期之後補——twse-ts
// 刻意不在他們那邊補（替證交所發明資料），這是消費端的決定。
export const TWSE_BLANK_DIVIDEND_YIELD_MEANS_ZERO_FROM = new Date('2026-08-28T00:00:00Z');

export const twseDividendYield = (value: number | null, tradeDate: Date): number | null =>
  value === null ? (tradeDate >= TWSE_BLANK_DIVIDEND_YIELD_MEANS_ZERO_FROM ? 0 : null) : value;
