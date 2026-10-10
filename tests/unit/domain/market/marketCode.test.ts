import { expect, test } from 'vitest';
import { marketTypeToMarketCode, toMarketCode } from '@/domain/market/marketCode';

// 2026-10-10 詞彙表：市場別官方編碼 MOPS TYPEK。興櫃在舊編碼裡是 TPEx＋isEmerging，換算時不能漏。
test('TWSE → sii、TPEx → otc、TPEx＋興櫃 → rotc；中文 marketType 照對，其他字串 null', () => {
  expect([toMarketCode('TWSE'), toMarketCode('TPEx'), toMarketCode('TPEx', true)]).toEqual(['sii', 'otc', 'rotc']);
  expect([marketTypeToMarketCode('上市'), marketTypeToMarketCode('上櫃'), marketTypeToMarketCode('興櫃'), marketTypeToMarketCode('其他')]).toEqual(['sii', 'otc', 'rotc', null]);
});
