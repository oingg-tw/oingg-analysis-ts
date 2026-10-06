import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getOutstandingCommonSharesAsOf } from '@/infrastructure/repositories/mops/capitalStock';
import { disconnectAllDbs } from '@/bootstrap/db';

// 2026-09-25 股本列「股數與實收資本對不上」的防線（見 capitalStock.ts 的說明）。案例都是真實資料；MOPS 頁面本身就是
// 這樣印的（mops-ts 重抓原始 HTML 查明），所以這些斷言不會因為上游重抓而改變——如果改變了，代表 MOPS 更正了頁面，
// 要回頭確認防線的判斷，不要直接改斷言。

// 2026-10-06 mops-ts 在 ingest 修好股數／資本對調（16 家 24 列），6546 2025-03 已是一致列，直接採用。錯位列的判斷邏輯（ratio 100 用幾何中位）
// 由 tests/unit/domain/financials/paidInSharesRow.test.ts 用假資料釘住，這裡改成驗證修好之後的真實值。
test('對調修好後：6546 2025-03 是一致列，直接採用（66,848,449 股）', async () => {
  const r = await getOutstandingCommonSharesAsOf('6546', new Date('2025-06-30'));
  assert.ok(r);
  assert.equal(r!.issuedShares, 66_848_449n);
  assert.deepEqual([r!.effectiveYear, r!.effectiveMonth], [2025, 3]);
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

// 2026-09-27 起 5512 由「核定股數判準」處理（金額換算超過核定 7.6 倍 → 用股數，見 paidInSharesRow.test.ts），不再回 null；這支 2026-10-07 才跟上。
test('5512 2024-10 唯一一筆：核定股數判準用股數，不再回 null', async () => {
  const r = await getOutstandingCommonSharesAsOf('5512', new Date('2025-06-30'));
  assert.equal(r?.issuedShares, 766_312_494n);
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

// 2026-10-07：mops-ts 已補上銀行資產負債表的特別股股本（2838 權益特別股 2,000,000 千元），不再是「有特別股、查不到股本」→ null 的情況；
// 那條 null 規則由 tests/unit/domain/financials/outstandingCommonShares.test.ts 用假資料釘住。
test('流通在外普通股：銀行扣權益特別股（2838 聯邦銀 114 年底）', async () => {
  const r = await getOutstandingCommonSharesAsOf('2838', new Date('2025-12-31'));
  assert.equal(r?.preferredCapitalThousands, 2_000_000n);
  assert.equal(r!.outstandingCommonShares, r!.issuedShares - r!.preferredShares - r!.treasuryShares);
});

afterAll(async () => {
  await disconnectAllDbs();
});
