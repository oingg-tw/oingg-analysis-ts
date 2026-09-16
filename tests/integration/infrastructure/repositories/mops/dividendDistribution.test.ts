import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getSymbolsWithDividendDistribution } from '@/infrastructure/repositories/mops/dividendDistribution';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';

// 2026-09-17 Phase 5 從 dividendDistributionCountPit 的整合測試拆出來——那支指標測試改成 cassette 回放的
// 單元測試（tests/unit/application/metrics/dividendDistributionCountPit.test.ts），這個「repository 真的查得到
// 一批公司」的契約案例留在打真實 DB 的整合測試。
test('getSymbolsWithDividendDistribution: 目前應該有一批公司有分派紀錄', async () => {
  const symbols = await getSymbolsWithDividendDistribution();
  assert.ok(symbols.length > 0, '應該至少有一家公司有股利分派紀錄');
  assert.ok(symbols.includes('2330'), '2330 應該在清單裡（mops-ts 已確認插隊回補過）');
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
});
