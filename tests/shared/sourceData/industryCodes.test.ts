import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { loadIndustryCodes, getIndustryCodes } from '@/shared/sourceData/industryCodes';

// 2026-09-04 改用 twse-ts 的 export.industry_code view 取代 localhost:8081 + TASK_SECRET
// 的 dev-only HTTP 機制，這裡驗證新機制的基本行為。
test('loadIndustryCodes: 應該從 export.industry_code 抓到對照表並可以透過 getIndustryCodes 取得', async () => {
  await loadIndustryCodes();
  const codes = getIndustryCodes();
  assert.ok(codes !== null, '應該要抓到產業代碼對照表');
  assert.ok(Object.keys(codes!).length > 0, '對照表不應該是空的');
  assert.equal(codes!['24'], '半導體業', '兩碼代碼 24 應該對應半導體業（實測驗證過的固定值）');
});

after(async () => {
  await twseExportPrisma.$disconnect();
});
