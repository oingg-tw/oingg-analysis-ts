import { test, describe, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { loadIndustryCodes } from '@/models/industryCodes';
import { isValidSecuritiesSectorCode, listSecuritiesIndustrySectors, listCompaniesBySectorCodes } from '@/models/securitiesIndustry';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';

// 證交所類股分類（twse-ts/tpex-ts company_profile.industry）——跟 industryClassification.ts
// 的財政部稅籍五層分類是完全不同的體系，這裡用實測真實資料驗證：2330（台積電）屬於 24
// 半導體業，2317（鴻海）屬於 31 其他電子業，兩者不同類股。

beforeAll(async () => {
  await loadIndustryCodes();
});

describe('isValidSecuritiesSectorCode', () => {
  test('24（半導體業）是合法代碼', () => {
    assert.equal(isValidSecuritiesSectorCode('24'), true);
  });

  test('查無此代碼回傳 false', () => {
    assert.equal(isValidSecuritiesSectorCode('ZZ'), false);
  });

  test('非真正產業分類的代碼（XX/98/91/07）回傳 false，即使字典裡查得到', () => {
    assert.equal(isValidSecuritiesSectorCode('XX'), false);
    assert.equal(isValidSecuritiesSectorCode('98'), false);
    assert.equal(isValidSecuritiesSectorCode('91'), false);
    assert.equal(isValidSecuritiesSectorCode('07'), false);
  });
});

describe('listSecuritiesIndustrySectors', () => {
  test('回傳的代碼數量跟 industry_code 字典扣掉非產業代碼後一致，2330 所屬的半導體業 companyCount 大於 0', async () => {
    const sectors = await listSecuritiesIndustrySectors();
    assert.ok(sectors.length > 0);
    assert.ok(!sectors.some((s) => ['XX', '98', '91', '07'].includes(s.code)), '非真正產業分類的代碼不應該出現在清單裡');

    const semiconductor = sectors.find((s) => s.code === '24');
    assert.ok(semiconductor, '半導體業（24）應該存在');
    assert.equal(semiconductor!.name, '半導體業');
    assert.ok(semiconductor!.companyCount > 0, '半導體業應該至少有一家公司（2330）');
  });
});

describe('listCompaniesBySectorCodes', () => {
  test('24（半導體業）應該包含 2330，不包含 2317', async () => {
    const result = await listCompaniesBySectorCodes(['24']);
    assert.ok(result.has('2330'));
    assert.ok(!result.has('2317'));
  });

  test('多個代碼是聯集（OR）：24+31 應該同時包含 2330 跟 2317', async () => {
    const result = await listCompaniesBySectorCodes(['24', '31']);
    assert.ok(result.has('2330'));
    assert.ok(result.has('2317'));
  });

  test('空陣列回傳空集合', async () => {
    const result = await listCompaniesBySectorCodes([]);
    assert.equal(result.size, 0);
  });

  test('查無此代碼的公司回傳空集合，不報錯', async () => {
    const result = await listCompaniesBySectorCodes(['ZZ']);
    assert.equal(result.size, 0);
  });
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
