// 2026-10-10 全生態系詞彙表（UBIQUITOUS_LANGUAGE.md 第二之一節）：市場別官方編碼是 MOPS TYPEK——
// sii 上市、otc 上櫃、rotc 興櫃（唯一兩個交易所共用的官方代碼）。
// 舊的 market（'TWSE'／'TPEx'）＋ isEmerging 分兩步退場：先新增 marketCode（舊欄位並存 14 天），再把 marketCode 改名回 market。
export type MarketCode = 'sii' | 'otc' | 'rotc';
export const MARKET_CODES = ['sii', 'otc', 'rotc'] as const;

export const toMarketCode = (market: 'TWSE' | 'TPEx', isEmerging = false): MarketCode => (market === 'TWSE' ? 'sii' : isEmerging ? 'rotc' : 'otc');

// 特別股清單的 marketType 是 isin 資料的中文「上市」／「上櫃」／「興櫃」；其他字串（不在這三種）回 null，不猜。
const MARKET_TYPE_CODES: Record<string, MarketCode> = { 上市: 'sii', 上櫃: 'otc', 興櫃: 'rotc' };
export const marketTypeToMarketCode = (marketType: string): MarketCode | null => MARKET_TYPE_CODES[marketType] ?? null;
