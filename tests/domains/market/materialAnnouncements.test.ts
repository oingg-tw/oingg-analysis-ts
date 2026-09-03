import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { listMaterialAnnouncements } from '@/domainApi/market/materialAnnouncements/service';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';

test('listMaterialAnnouncements: 應該依公告日期由新到舊排序，且不超過 limit 筆', async () => {
  const result = await listMaterialAnnouncements({ limit: 20 });
  for (let i = 1; i < result.items.length; i++) {
    assert.ok(result.items[i - 1]!.announcementDate >= result.items[i]!.announcementDate, '應該由新到舊排序');
  }
  assert.ok(result.items.length <= 20);
});

test('listMaterialAnnouncements: limit 應該限制回傳筆數', async () => {
  const result = await listMaterialAnnouncements({ limit: 1 });
  assert.ok(result.items.length <= 1);
});

after(async () => {
  await twseExportPrisma.$disconnect();
});
