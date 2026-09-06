import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getPreferredStockSecurities, getLatestPreferredStockRight } from '@/shared/sourceData/preferredStock';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

// 全新的特別股功能——跟 2026-09-06 規劃時直接查 export DB 驗證過的真實資料交叉驗證。

test('getPreferredStockSecurities: 應該回傳目前上市中的特別股清單，包含 1101B 台泥乙特', async () => {
  const securities = await getPreferredStockSecurities();
  assert.ok(securities.length >= 20, `目前應該有約 28 檔上市中的特別股，實際 ${securities.length} 檔`);

  const taiCement = securities.find((s) => s.symbol === '1101B');
  assert.ok(taiCement, '應該找得到 1101B');
  assert.equal(taiCement!.name, '台泥乙特');
  assert.equal(taiCement!.marketType, '上市');
});

test('getLatestPreferredStockRight: 1101B 的發行條款應該跟實測驗證過的真實數字一致', async () => {
  const right = await getLatestPreferredStockRight('1101B');
  assert.ok(right);
  assert.equal(right!.issuePrice, 50);
  assert.equal(right!.dividendRate, 1.75);
});

test('getLatestPreferredStockRight: 2887F 有多次配息條件修訂（series_no），應該回傳最新一次（series_no=3），不是最舊的', async () => {
  // 2026-09-06 規劃時確認過：2887F series_no=1/2 的 dividend_rate 都是 1.9，series_no=3
  // 才改成 2.296——如果查詢邏輯漏了 ORDER BY series_no DESC，會拿到舊的 1.9。
  const right = await getLatestPreferredStockRight('2887F');
  assert.ok(right);
  assert.equal(right!.dividendRate, 2.296, '應該拿到最新修訂（series_no=3）的配息金額，不是舊系列的 1.9');
});

test('getLatestPreferredStockRight: 查無此 preferred_stock_code 應該回傳 null，不拋錯', async () => {
  const right = await getLatestPreferredStockRight('9999Z');
  assert.equal(right, null);
});

// callProtectionYears 是從 redemptionConditions 自由格式文字 parse 出來的贖回保護期年數
// （發行人贖回權/call 的保護期，不是投資人賣回權/put）——2026-09-06 逐一核對過目前 28 檔
// 上市中特別股的真實文字才定案的正規表示式，下面用其中幾種代表性格式交叉驗證。
test('getLatestPreferredStockRight: callProtectionYears 應該從中文「X年」條款文字正確 parse 出來（1101B=五年）', async () => {
  const right = await getLatestPreferredStockRight('1101B');
  assert.ok(right);
  assert.equal(right!.callProtectionYears, 5, `redemptionConditions="${right!.redemptionConditions}"`);
});

test('getLatestPreferredStockRight: callProtectionYears 應該支援阿拉伯數字小數年（2838A=5.5年）', async () => {
  const right = await getLatestPreferredStockRight('2838A');
  assert.ok(right);
  assert.equal(right!.callProtectionYears, 5.5, `redemptionConditions="${right!.redemptionConditions}"`);
});

test('getLatestPreferredStockRight: callProtectionYears 應該支援「X年Y個月」換算成小數年（2897B=五年六個月=5.5）', async () => {
  const right = await getLatestPreferredStockRight('2897B');
  assert.ok(right);
  assert.equal(right!.callProtectionYears, 5.5, `redemptionConditions="${right!.redemptionConditions}"`);
});

test('getLatestPreferredStockRight: callProtectionYears 應該支援中文數字「三年」（2887I=3）', async () => {
  const right = await getLatestPreferredStockRight('2887I');
  assert.ok(right);
  assert.equal(right!.callProtectionYears, 3, `redemptionConditions="${right!.redemptionConditions}"`);
});

test('getLatestPreferredStockRight: 條款文字沒有可辨識年限時（例如引用公司章程），callProtectionYears 應該是 null，不是誤判', async () => {
  const right = await getLatestPreferredStockRight('2883B');
  assert.ok(right);
  assert.equal(right!.redeemable, true, '這檔本身是可贖回的，只是條款文字沒有寫年限');
  assert.equal(right!.callProtectionYears, null, `redemptionConditions="${right!.redemptionConditions}"`);
});

test('getLatestPreferredStockRight: 不可贖回（redeemable=false，redemptionConditions 為 null）時 callProtectionYears 應該是 null', async () => {
  const right = await getLatestPreferredStockRight('1312A');
  assert.ok(right);
  assert.equal(right!.redeemable, false);
  assert.equal(right!.callProtectionYears, null);
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
  await mopsExportPrisma.$disconnect();
});
