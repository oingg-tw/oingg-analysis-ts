import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getPaidInSharesAsOf } from '@/infrastructure/repositories/mops/capitalStock';
import { disconnectAllDbs } from '@/bootstrap/db';

// 2026-09-25 股本列欄位錯位的暫時防線（見 capitalStock.ts 的說明）。案例都是 2026-09-25 的真實資料：
// mops-ts 重抓修好後，6546 2025-03 那列會變成一致的正確值，第一個斷言就會失敗——那時改成斷言新的正確股數，
// 並確認防線不再命中，不要直接刪掉這支。

test('錯位列（6546 2025-03，股數與資本對調、比例 ×100）不採用，改用前一筆一致的列（2024-12）', async () => {
  const r = await getPaidInSharesAsOf('6546', new Date('2025-06-30'));
  assert.ok(r);
  assert.equal(r!.paidInShares, 66_836_846n);
  assert.deepEqual([r!.effectiveYear, r!.effectiveMonth], [2024, 12]);
});

test('對照：一致的列照常採用（6546 2024-12 當下）', async () => {
  const r = await getPaidInSharesAsOf('6546', new Date('2024-12-31'));
  assert.equal(r!.paidInShares, 66_836_846n);
});

test('對照：小比例差距（4157 ×1.028，可能是特別股／庫藏股）不擋', async () => {
  const r = await getPaidInSharesAsOf('4157', new Date('2023-12-31'));
  assert.ok(r);
  assert.deepEqual([r!.effectiveYear, r!.effectiveMonth], [2023, 12]);
  assert.equal(r!.paidInShares, 717_844_175n);
});

test('錯位列但股數跟前一筆連貫（6841 2025-06：95,152,250 vs 97,240,250）→ 錯的是資本欄，股數照用', async () => {
  const r = await getPaidInSharesAsOf('6841', new Date('2025-06-30'));
  assert.equal(r!.paidInShares, 95_152_250n);
  assert.deepEqual([r!.effectiveYear, r!.effectiveMonth], [2025, 6]);
});

test('錯位列且沒有一致的前一筆（5512 唯一一筆 2024-10）→ 判斷不了，保守回 null', async () => {
  assert.equal(await getPaidInSharesAsOf('5512', new Date('2025-06-30')), null);
});

afterAll(async () => {
  await disconnectAllDbs();
});
