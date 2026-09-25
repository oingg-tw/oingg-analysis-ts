import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getOutstandingCommonSharesAsOf } from '@/infrastructure/repositories/mops/capitalStock';
import { disconnectAllDbs } from '@/bootstrap/db';

// 2026-09-25 股本列「股數與實收資本對不上」的防線（見 capitalStock.ts 的說明）。案例都是真實資料；MOPS 頁面本身就是
// 這樣印的（mops-ts 重抓原始 HTML 查明），所以這些斷言不會因為上游重抓而改變——如果改變了，代表 MOPS 更正了頁面，
// 要回頭確認防線的判斷，不要直接改斷言。

test('錯位列（6546 2025-03，股數與資本對調、比例 ×100）不採用，改用前一筆一致的列（2024-12）', async () => {
  const r = await getOutstandingCommonSharesAsOf('6546', new Date('2025-06-30'));
  assert.ok(r);
  assert.equal(r!.issuedShares, 66_836_846n);
  assert.deepEqual([r!.effectiveYear, r!.effectiveMonth], [2024, 12]);
});

test('對照：一致的列照常採用（6546 2024-12 當下）', async () => {
  const r = await getOutstandingCommonSharesAsOf('6546', new Date('2024-12-31'));
  assert.equal(r!.issuedShares, 66_836_846n);
});

test('對照：小比例差距（4157 ×1.028，可能是特別股／庫藏股）不擋', async () => {
  const r = await getOutstandingCommonSharesAsOf('4157', new Date('2023-12-31'));
  assert.ok(r);
  assert.deepEqual([r!.effectiveYear, r!.effectiveMonth], [2023, 12]);
  assert.equal(r!.issuedShares, 717_844_175n);
});

test('錯位列但股數跟前一筆連貫（6841 2025-06：95,152,250 vs 97,240,250）→ 錯的是資本欄，股數照用', async () => {
  const r = await getOutstandingCommonSharesAsOf('6841', new Date('2025-06-30'));
  assert.equal(r!.issuedShares, 95_152_250n); // 錯位防線看的是已發行股數（流通在外還會再扣庫藏股）
  assert.deepEqual([r!.effectiveYear, r!.effectiveMonth], [2025, 6]);
});

test('錯位列且沒有一致的前一筆（5512 唯一一筆 2024-10）→ 判斷不了，保守回 null', async () => {
  assert.equal(await getOutstandingCommonSharesAsOf('5512', new Date('2025-06-30')), null);
});

// 2026-09-25 流通在外普通股 = 已發行 − 特別股 − 庫藏股（IAS 33）。以下是真實資料的對照。
test('流通在外普通股：金控扣特別股（2882 113 年底）', async () => {
  const r = await getOutstandingCommonSharesAsOf('2882', new Date('2024-12-31'));
  assert.equal(r!.outstandingCommonShares, 14_669_210_128n);
  assert.equal(r!.preferredShares, 1_533_300_000n);
});

test('流通在外普通股：一般業扣特別股與子公司持股（2002 中鋼 114 年底）', async () => {
  const r = await getOutstandingCommonSharesAsOf('2002', new Date('2025-12-31'));
  assert.equal(r!.preferredShares, 38_268_000n);
  assert.equal(r!.treasuryShares, 674_286_000n);
  assert.equal(r!.outstandingCommonShares, r!.issuedShares - 38_268_000n - 674_286_000n);
});

test('流通在外普通股：有特別股但銀行特別股股本沒收（2838 聯邦銀）→ null', async () => {
  assert.equal(await getOutstandingCommonSharesAsOf('2838', new Date('2025-12-31')), null);
});

afterAll(async () => {
  await disconnectAllDbs();
});
