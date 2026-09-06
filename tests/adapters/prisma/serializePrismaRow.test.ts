import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Prisma } from '#generated/analysis-client';
import { serializePrismaRow } from '@/adapters/prisma/serializePrismaRow';

// 純邏輯測試，不連 DB——見 src/adapters/prisma/serializePrismaRow.ts 的說明，這支函式要把
// Prisma 回傳的一列資料轉成能塞進 Json 欄位的純 JSON 值，逐一驗證每種型別的轉換規則。

test('serializePrismaRow: BigInt 轉成字串', () => {
  assert.equal(serializePrismaRow(123456789012345n), '123456789012345');
});

test('serializePrismaRow: Prisma.Decimal 轉成字串', () => {
  assert.equal(serializePrismaRow(new Prisma.Decimal('12.34')), '12.34');
});

test('serializePrismaRow: Date 轉成 ISO 字串', () => {
  const date = new Date('2026-09-06T00:00:00.000Z');
  assert.equal(serializePrismaRow(date), '2026-09-06T00:00:00.000Z');
});

test('serializePrismaRow: string[] 原樣保留', () => {
  assert.deepEqual(serializePrismaRow(['warning A', 'warning B']), ['warning A', 'warning B']);
});

test('serializePrismaRow: null/undefined 都轉成 null', () => {
  assert.equal(serializePrismaRow(null), null);
  assert.equal(serializePrismaRow(undefined), null);
});

test('serializePrismaRow: string/number/boolean 原樣保留', () => {
  assert.equal(serializePrismaRow('2330'), '2330');
  assert.equal(serializePrismaRow(42), 42);
  assert.equal(serializePrismaRow(true), true);
  assert.equal(serializePrismaRow(false), false);
});

test('serializePrismaRow: 巢狀物件遞迴處理，混合 Decimal/BigInt/Date/null', () => {
  const row = {
    symbol: '2330',
    roeQuarterlyPct: new Prisma.Decimal('10.98'),
    netIncomeValue: 100000000000n,
    reportDate: new Date('2026-06-30T00:00:00.000Z'),
    warnings: ['w1'],
    subsidiaryCompanyId: null,
    isActive: true,
  };
  assert.deepEqual(serializePrismaRow(row), {
    symbol: '2330',
    roeQuarterlyPct: '10.98',
    netIncomeValue: '100000000000',
    reportDate: '2026-06-30T00:00:00.000Z',
    warnings: ['w1'],
    subsidiaryCompanyId: null,
    isActive: true,
  });
});
