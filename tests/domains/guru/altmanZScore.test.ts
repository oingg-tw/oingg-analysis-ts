import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAltmanZScore } from '../../../src/domains/guru/altmanZScore/service';
import prisma from '../../../src/adapters/prisma/index';
import { analysisPrisma } from '../../../src/adapters/prisma/analysisClient';

// 對照 src/domains/guru/README.md「Altman_Z_Score 卡在哪裡」——2330（台積電）115Q2 合併報表實測值。
// X4（市值/總負債）用 daily_stock_price 的收盤價，價格每天在變，X4/zScore 不釘死確切數字，
// 只驗證合理性；X1/X2/X3/X5（純財報衍生）不受股價影響，可以釘死。
test('altmanZScore: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculateAltmanZScore({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, '115');
  assert.equal(result.season, '2');
  assert.equal(result.reportDate, '2026-06-30');

  assert.equal(result.x1, 0.2888);
  assert.equal(result.x2, 0.6454);
  assert.equal(result.x3, 0.2858);
  assert.equal(result.x5, 0.47);

  assert.ok(result.x4 !== null, 'X4 應該算得出來（2330 有股價資料）');
  assert.ok(result.x4! > 0 && result.x4! < 1000, `X4=${result.x4} 數量級異常，可能是單位換算漏了 x1000`);

  assert.ok(result.zScore !== null);
  assert.ok(result.zScore! > 0 && result.zScore! < 1000, `zScore=${result.zScore} 數量級異常`);
  assert.equal(result.zone, 'safe'); // TSMC 財務體質極佳，Z-Score 落在 Safe 區間是預期結果

  assert.deepEqual(result.fieldStatuses, {});
  assert.ok(result.warnings.length === 1, '應該只有固定的產業適用性警告，沒有其他缺資料警告');
  assert.match(result.warnings[0]!, /上市製造業樣本校準/);
});

test('altmanZScore: 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateAltmanZScore({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateAltmanZScore({ companyId: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.x1, explicit.x1);
  assert.equal(auto.x2, explicit.x2);
});

test('altmanZScore: X4 對沒有股價資料的公司回傳 not_applicable，不影響 X1/X2/X3/X5 照常計算', async () => {
  const result = await calculateAltmanZScore({ companyId: '1101', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  // 1101（台泥）在這個開發資料庫裡目前查無財報資料，X1/X2/X3/X5 應該全部因為查無資產負債表/損益表
  // 而是 no_data；X4 則是不管有沒有財報資料都會是 not_applicable（daily_stock_price 只有 2330）。
  assert.equal(result.x4, null);
  assert.equal(result.fieldStatuses.x4?.status, 'not_applicable');
  assert.equal(result.zScore, null);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
