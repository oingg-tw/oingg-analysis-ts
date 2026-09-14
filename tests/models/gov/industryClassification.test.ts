import { test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { govExportPrisma } from '@/adapters/prisma/govExportClient';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { loadIndustryClassification, getIndustryNodeInfo, listIndustryChildren, listIndustryCompanies } from '@/models/gov/industryClassification';

beforeAll(async () => {
  await loadIndustryClassification();
});

// 產業階層瀏覽（純瀏覽，不做動態回退）——findPeerGroup 已於 2026-09-14 搬到
// src/models/industryChainClassification.ts（資料源換成 oingg-playwright-py
// 供應鏈分類），對應測試見 tests/models/industryChainClassification.test.ts，
// 不再放這裡。

test('getIndustryNodeInfo/listIndustryChildren: 樹根查詢回傳全部 19 個 section，companyCount 是 999', () => {
  const info = getIndustryNodeInfo(null);
  assert.equal(info?.code, null);
  assert.equal(info?.level, null);
  assert.equal(info?.companyCount, 999);

  const children = listIndustryChildren(null);
  assert.equal(children.length, 19, '實測財政部稅籍分類共 19 個 section（A~S）');
  assert.equal(children[0]!.code, 'A');
  assert.equal(children[0]!.name, '農、林、漁、牧業');
});

test('listIndustryChildren: 展開 section C（製造業），27 個 division，companyCount 加總等於 587', () => {
  const info = getIndustryNodeInfo('C');
  assert.equal(info?.level, 'section');
  assert.equal(info?.companyCount, 587, '實測 section C 底下總共 587 家公司');

  const children = listIndustryChildren('C');
  assert.equal(children.length, 27, '實測 section C 有 27 個直屬 division');
  const sum = children.reduce((acc, c) => acc + c.companyCount, 0);
  assert.equal(sum, 587, 'division 層級 companyCount 加總應該等於 section 本身的 companyCount');

  const division11 = children.find((c) => c.code === '11');
  assert.equal(division11?.name, '紡織業');
  assert.equal(division11?.companyCount, 35, '實測 division 11（紡織業）有 35 家公司');
  assert.equal(division11?.hasChildren, true);
});

test('listIndustryChildren/listIndustryCompanies: 查到 subclass 層級，children 是空陣列，companies 有實際公司', () => {
  const info = getIndustryNodeInfo('2711-00');
  assert.equal(info?.level, 'subclass');
  assert.equal(info?.name, '電腦製造');
  assert.equal(info?.companyCount, 18, '實測 subclass 2711-00 有 18 家公司');

  assert.deepEqual(listIndustryChildren('2711-00'), [], 'subclass 沒有更細的層級，children 一定是空陣列');

  const companies = listIndustryCompanies('2711-00');
  assert.equal(companies.length, 18);
  assert.ok(companies.includes('7711'));
});

test('listIndustryCompanies: 非 subclass 層級的精確匹配一律是空陣列（每家公司都分類到 subclass）', () => {
  assert.deepEqual(listIndustryCompanies('C'), []); // section
  assert.deepEqual(listIndustryCompanies('11'), []); // division
  assert.deepEqual(listIndustryCompanies('2711'), []); // class，即使底下唯一的 subclass 2711-00 有 18 家公司
});

test('getIndustryNodeInfo: 查詢不存在的 code 回傳 null，children/companies 都是空陣列', () => {
  assert.equal(getIndustryNodeInfo('ZZZZ-NOPE'), null);
  assert.deepEqual(listIndustryChildren('ZZZZ-NOPE'), []);
  assert.deepEqual(listIndustryCompanies('ZZZZ-NOPE'), []);
});

afterAll(async () => {
  await govExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
