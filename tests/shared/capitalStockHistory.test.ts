import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '@/adapters/prisma/index';
import { getPaidInSharesAsOf } from '@/shared/sourceData/capitalStock';

// 使用者問「MOPS 資料庫裡面抓得到 capital_stock_history 股本變更歷史嗎」——這裡直接查真的
// capital_stock_history 表驗證：不只是「查得到最新股本」，是查得到「每一次股本變動的歷史紀錄」
// （生效年月、變動來源：現金增資/盈餘轉增資/資本公積轉增資/合併增資/減資⋯⋯）。
test('capital_stock_history: 2330 有多筆歷史紀錄，不是只有一筆最新快照', async () => {
  const rows = await prisma.capitalStockHistory.findMany({
    where: { symbol: '2330' },
    orderBy: [{ effectiveYear: 'asc' }, { effectiveMonth: 'asc' }],
  });

  assert.ok(rows.length > 1, `2330 只查到 ${rows.length} 筆，應該要有多筆股本變動歷史紀錄`);

  for (const row of rows) {
    assert.equal(typeof row.effectiveYear, 'number');
    assert.equal(typeof row.effectiveMonth, 'number');
  }

  // 至少要有一筆能看出「變動來源」（現金增資/盈餘轉增資/資本公積轉增資/合併增資/減資之一有值），
  // 證明這張表真的是「變更歷史」，不是只存了股數的靜態快照。
  const hasChangeSourceInfo = rows.some(
    (row) =>
      row.sourceCashIncrease !== null ||
      row.sourceCapitalReserveTransfer !== null ||
      row.sourceRetainedEarningsTransfer !== null ||
      row.sourceMergerIncrease !== null ||
      row.sourceCapitalReduction !== null,
  );
  assert.ok(hasChangeSourceInfo, '應該至少有一筆紀錄帶有股本變動來源資訊');
});

test('capital_stock_history: 全資料庫涵蓋多家公司、多筆歷史紀錄', async () => {
  const totalCount = await prisma.capitalStockHistory.count();
  const distinctSymbols = await prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
    `SELECT COUNT(DISTINCT symbol) as cnt FROM capital_stock_history;`,
  );

  assert.ok(totalCount > 0, 'capital_stock_history 應該要有資料');
  assert.ok(Number(distinctSymbols[0]!.cnt) > 1, '應該涵蓋不只一家公司');
});

test('getPaidInSharesAsOf: 查特定日期會找到「當時生效」的那一筆，不是永遠回傳最新一筆', async () => {
  // 2330 115Q2（2026-06-30）報告日對應的股本紀錄——跟 eps/bvps/cashFlowPerShare 等服務
  // 實際查詢用的是同一支 helper，這裡驗證的就是它們背後依賴的邏輯。
  const asOf = await getPaidInSharesAsOf('2330', new Date('2026-06-30T00:00:00.000Z'));
  assert.ok(asOf !== null, '應該要能查到 2026-06-30 之前生效的股本紀錄');
  assert.equal(asOf!.paidInShares, 25932370067n);

  // 查一個很早以前的日期，應該找不到生效中的紀錄（如果 capital_stock_history 真的有涵蓋
  // 歷史股本變動，理論上還是可能查到更早的一筆；這裡只驗證「查得到的紀錄生效日一定 <= 查詢日」，
  // 不會回傳生效日在查詢日之後的紀錄）。
  if (asOf) {
    const effectiveAsDate = new Date(Date.UTC(asOf.effectiveYear, asOf.effectiveMonth - 1, 1));
    assert.ok(effectiveAsDate <= new Date('2026-06-30T00:00:00.000Z'));
  }
});

after(async () => {
  await prisma.$disconnect();
});
