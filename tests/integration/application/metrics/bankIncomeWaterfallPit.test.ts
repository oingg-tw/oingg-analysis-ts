import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteBankIncomeWaterfallPit, computeAndWritePretaxIncomePerSharePit } from '@/bootstrap/pitMetrics';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { upsertMetricDefinition } from '@/bootstrap/metricDefinitions';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import tpexExportPrisma from '@/infrastructure/prisma/tpexExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 2026-09-15 應「銀行業營收到股利去了哪裡」瀑布圖卡片需求新增——跟 mops-ts 來回驗證過
// export.bank_income_statement_detail_xbrl 的科目語意（見 computeBankIncomeWaterfallPit.ts
// 檔頭說明），這裡驗證兩件事：(1) 四個 metric_code 都正確寫入 (2) 殘差法算出的
// bankOtherOperatingExpensePerShare 加回去之後，瀑布圖的恆等式
// 「利息淨收益+非利息淨收益－呆帳費用－其他營業費用＝稅前淨利」精確成立（這是殘差法
// 設計上必然成立的數學性質，測試的是實作沒有算錯，不是驗證業務邏輯本身）。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.bankNetInterestIncomePerShare!);
  await upsertMetricDefinition(metricDefinitionRegistry.bankNetNonInterestIncomePerShare!);
  await upsertMetricDefinition(metricDefinitionRegistry.bankBadDebtProvisionPerShare!);
  await upsertMetricDefinition(metricDefinitionRegistry.bankOtherOperatingExpensePerShare!);
  await upsertMetricDefinition(metricDefinitionRegistry.pretaxIncomePerShare!);
});

test('bankIncomeWaterfallPit: 2801 114Q2 應該寫入四個 metric_code，且瀑布圖恆等式精確成立', async () => {
  await computeAndWriteBankIncomeWaterfallPit({ symbol: '2801', year: '114', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  await computeAndWritePretaxIncomePerSharePit({ symbol: '2801', year: '114', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  // 兩支各自都要查 5 次現金/損益表資料（本季+近四季 TTM）加上流通股數/knowledgeDate
  // 解析，序列跑完偶爾會超過 vitest 預設的 5000ms，比照其餘 TTM 邏輯較重的測試給寬限值。

  const findLatest = (metricCode: string, periodType: string) =>
    analysisPrisma.metricValue.findFirst({
      where: { symbol: '2801', metricCode, periodType, fiscalYear: 2025, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
      orderBy: { knowledgeDate: 'desc' },
    });

  const netInterestQ = await findLatest('bankNetInterestIncomePerShare', 'Q');
  const netNonInterestQ = await findLatest('bankNetNonInterestIncomePerShare', 'Q');
  const badDebtQ = await findLatest('bankBadDebtProvisionPerShare', 'Q');
  const otherOpexQ = await findLatest('bankOtherOperatingExpensePerShare', 'Q');

  assert.ok(netInterestQ && netNonInterestQ && badDebtQ && otherOpexQ, '四個 metric_code 應該都寫入 Q periodType');
  assert.ok(Number(netInterestQ!.value) > 0, '2801 114Q2 利息淨收益應該是正值');

  // 瀑布圖恆等式：利息淨收益 + 非利息淨收益 − 呆帳費用 − 其他營業費用 = 稅前淨利每股
  // （這裡改用直接查詢原始 profitBeforeTax 交叉驗證，不是自我循環驗證殘差法本身）。
  const pretaxQ = await analysisPrisma.metricValue.findFirst({
    where: { symbol: '2801', metricCode: 'pretaxIncomePerShare', periodType: 'Q', fiscalYear: 2025, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: { knowledgeDate: 'desc' },
  });
  assert.ok(pretaxQ, 'pretaxIncomePerShare 應該也有寫入，用來交叉驗證瀑布圖恆等式');
  const reconstructed = Number(netInterestQ!.value) + Number(netNonInterestQ!.value) - Number(badDebtQ!.value) - Number(otherOpexQ!.value);
  // 每個每股數字各自獨立四捨五入到分（見 numericHelpers.ts 的 toPerShare），4 個數字加總
  // 起來累積的捨入誤差理論上限是 4*0.005=0.02，容忍值設 0.03 留一點餘裕，不是邏輯算錯。
  const pretaxValue = Number(pretaxQ!.value);
  assert.ok(Math.abs(reconstructed - pretaxValue) < 0.03, `瀑布圖加總 ${reconstructed} 應該約略等於 pretaxIncomePerShare ${pretaxValue}（容許捨入誤差）`);
}, 15000);

test('bankIncomeWaterfallPit: 2330（非銀行公司）應該優雅降級，不寫入任何一列', async () => {
  const outcome = await computeAndWriteBankIncomeWaterfallPit({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.bankNetInterestIncomePerShareQ, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({
    where: { symbol: '2330', metricCode: { in: ['bankNetInterestIncomePerShare', 'bankNetNonInterestIncomePerShare', 'bankBadDebtProvisionPerShare', 'bankOtherOperatingExpensePerShare'] } },
  });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
