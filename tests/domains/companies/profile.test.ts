import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getCompanyProfileDetail } from '@/shared/sourceData/companyProfile';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';

test('getCompanyProfileDetail: TWSE 公司（2330）應該回傳完整基本資料，市場標記正確', async () => {
  const result = await getCompanyProfileDetail('2330');
  assert.ok(result);
  assert.equal(result!.symbol, '2330');
  assert.equal(result!.market, 'TWSE');
  assert.equal(result!.shortName, '台積電');
  assert.equal(result!.industryName, '半導體業', 'TWSE 有 industry_name 欄位，應該直接透傳，不是裸代碼');
  assert.ok(result!.chairman);
  assert.ok(result!.paidInCapital && typeof result!.paidInCapital === 'string', 'paidInCapital 應該序列化成字串');
  assert.ok(result!.establishedDate?.match(/^\d{4}-\d{2}-\d{2}$/), 'establishedDate 應該是 YYYY-MM-DD 格式');
  assert.ok(
    result!.financialReportType === '1' || result!.financialReportType === '2',
    'financialReportType 目前只會有 1 或 2 兩種值',
  );
  assert.equal(
    result!.financialReportTypeName,
    result!.financialReportType === '1' ? '個別財報' : '合併財報',
    'financialReportTypeName 應該對得上代碼（跟 mops-ts 確認過：1=個別、2=合併）',
  );
});

test('getCompanyProfileDetail: TPEx 興櫃公司（2071）也查得到，不因為興櫃被排除', async () => {
  const result = await getCompanyProfileDetail('2071');
  assert.ok(result, '興櫃公司指名查詢應該查得到，這支端點不篩 market');
  assert.equal(result!.market, 'TPEx');
  assert.equal(result!.industryName, null, 'TPEx 的 export.company_profile 目前沒有 industry_name 欄位，不該亂猜對照表');
});

test('getCompanyProfileDetail: 查無此公司代號應該回傳 null，不拋錯', async () => {
  const result = await getCompanyProfileDetail('0000000');
  assert.equal(result, null);
});

test('getCompanyProfileDetail: industry 是「非產業」代碼（證券商/期貨商登記等）時，industryName 應該回 null 而不是內部附註文字', async () => {
  // 000104=臺銀證券（industry='XX'），industry_name 原始值帶著「（證券商）」這類 twse-ts
  // 自己加的工程附註，不是給終端使用者看的，2026-09-02 跟 twse-ts 確認過（見
  // src/shared/sourceData/companyProfile.ts 的 NON_INDUSTRY_CODES 說明）。
  const result = await getCompanyProfileDetail('000104');
  assert.ok(result);
  assert.equal(result!.industry, 'XX');
  assert.equal(result!.industryName, null);
});

test('getCompanyProfileDetail: industry="13"（電子工業舊分類）是真正的產業名稱，應該照樣透傳', async () => {
  const result = await getCompanyProfileDetail('3525');
  assert.ok(result);
  assert.equal(result!.industry, '13');
  assert.equal(result!.industryName, '電子工業（舊分類）');
});

// company_profile 原始 website 欄位混雜至少三種格式（純網域/含 scheme+尾斜線/尾斜線無
// scheme），2026-09-04 應 web-nuxt/conductor 要求統一在這裡清成裸網域，不讓下游各自清洗。
test('getCompanyProfileDetail: website 應該正規化成裸網域，不含 scheme/尾斜線/www. 前綴', async () => {
  const twse = await getCompanyProfileDetail('2330'); // 原始值帶 www. 前綴
  assert.ok(twse?.website);
  assert.doesNotMatch(twse!.website!, /^https?:\/\//);
  assert.doesNotMatch(twse!.website!, /\/$/);
  assert.doesNotMatch(twse!.website!, /^www\./);

  const tpex = await getCompanyProfileDetail('5609'); // 原始值是 "http://www.dimerco.com"
  assert.equal(tpex?.website, 'dimerco.com');
});

after(async () => {
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
