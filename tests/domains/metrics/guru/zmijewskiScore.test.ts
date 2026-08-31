import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateZmijewskiScore } from '@/domains/metrics/guru/zmijewskiScore/service';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

// 對照 src/domains/metrics/guru/README.md「Zmijewski Score 計算口徑」——2330（台積電）115Q2 合併報表實測值。
// X = -4.3 - 4.5*(NI_TTM/TA) + 5.7*(TL/TA) - 0.004*(CA/CL)。
test('zmijewskiScore: 2330 115Q2 合併報表，指定季度', async () => {
  const result = await calculateZmijewskiScore({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.xScore, -3.6198);
  assert.ok(result.probabilityOfDistress !== null && result.probabilityOfDistress < 0.01, 'TSMC 財務體質極佳，財務危機機率應該極低');
  assert.equal(result.flagged, false);
  assert.deepEqual(result.fieldStatuses, {});
  assert.deepEqual(result.warnings, []);
});

test('zmijewskiScore: 2330 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateZmijewskiScore({ companyId: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateZmijewskiScore({ companyId: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.xScore, explicit.xScore);
});

test('zmijewskiScore: 自動抓最新一季應該取資產負債表/損益表都有資料的交集，不是任一張表自己的最新一季', async () => {
  const expected = await getLatestAvailableQuarter('2887', '2', '', ['balanceSheet', 'incomeStatement']);
  const auto = await calculateZmijewskiScore({ companyId: '2887', dataType: '2', subsidiaryCompanyId: '' });

  assert.ok(expected, '2887 應該至少有一季資產負債表跟損益表都有資料');
  assert.equal(auto.year, expected!.year);
  assert.equal(auto.season, expected!.season);
});

// 2887 是金控，資產負債表不按流動/非流動分類（currentAssets/currentLiabilities 結構性為 null），
// xScore 應該優雅降級成 null，不是丟例外——這是產業結構性不適用，不是資料缺漏待補。
test('zmijewskiScore: 2887（金控，流動資產/負債結構性為 null）xScore 應該優雅降級成 null', async () => {
  const result = await calculateZmijewskiScore({ companyId: '2887', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.xScore, null);
  assert.equal(result.fieldStatuses.xScore?.status, 'no_data');
});

test('zmijewskiScore: 9999（查無資料的公司）自動抓最新一季應該回傳 year/season 為 null 的優雅降級結果', async () => {
  const result = await calculateZmijewskiScore({ companyId: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.year, null);
  assert.equal(result.season, null);
  assert.equal(result.xScore, null);
  assert.ok(result.warnings.length > 0);
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
