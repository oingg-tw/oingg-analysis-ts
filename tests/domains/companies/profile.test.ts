import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getCompanyProfileDetail } from '@/shared/sourceData/companyProfile';
import twsePrisma from '@/adapters/prisma/twseClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';

test('getCompanyProfileDetail: TWSE 公司（2330）應該回傳完整基本資料，市場標記正確', async () => {
  const result = await getCompanyProfileDetail('2330');
  assert.ok(result);
  assert.equal(result!.symbol, '2330');
  assert.equal(result!.market, 'TWSE');
  assert.equal(result!.shortName, '台積電');
  assert.ok(result!.chairman);
  assert.ok(result!.paidInCapital && typeof result!.paidInCapital === 'string', 'paidInCapital 應該序列化成字串');
  assert.ok(result!.establishedDate?.match(/^\d{4}-\d{2}-\d{2}$/), 'establishedDate 應該是 YYYY-MM-DD 格式');
});

test('getCompanyProfileDetail: TPEx 興櫃公司（2071）也查得到，不因為興櫃被排除', async () => {
  const result = await getCompanyProfileDetail('2071');
  assert.ok(result, '興櫃公司指名查詢應該查得到，這支端點不篩 market');
  assert.equal(result!.market, 'TPEx');
});

test('getCompanyProfileDetail: 查無此公司代號應該回傳 null，不拋錯', async () => {
  const result = await getCompanyProfileDetail('0000000');
  assert.equal(result, null);
});

after(async () => {
  await twsePrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
