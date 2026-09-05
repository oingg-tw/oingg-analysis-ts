import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateAltmanZScore } from '@/domainMetrics/altmanZScore/service';
import { hasStockPriceCoverage } from '@/shared/sourceData/marketCap';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';

interface FinancialReportAnnouncementRow {
  announcement_date: Date;
}

// 對照 src/domainMetrics/guru.md「Altman_Z_Score 卡在哪裡」——2330（台積電）115Q2 合併報表實測值。
// X4（市值/總負債）用 daily_stock_price 的收盤價，價格每天在變，X4/zScore 不釘死確切數字，
// 只驗證合理性；X1/X2/X3/X5（純財報衍生）不受股價影響，可以釘死。
// 2026-08-28 更新：X4 股價基準日改成優先用 financial_report_announcement 的公告日，查無公告日
// 才退回財報期末日（見 shared/sourceData/reportAnnouncementDate.ts）。這張表覆蓋率會持續成長（同一天稍早
// 115Q2 還查無公告日，寫完測試沒多久就補進來了）——不寫死是 'announcement' 還是
// 'report_date_fallback'，改成直接查 financial_report_announcement 現查現算期望值，
// 這樣不管覆蓋率漲到哪裡這個測試都不會因為資料變好而變紅，見 tests/README.md 的說明。
test('altmanZScore: 2330 115Q2 合併報表，指定季度', async () => {
  const announcementRows = await mopsExportPrisma.$queryRaw<FinancialReportAnnouncementRow[]>`
    SELECT announcement_date FROM "export"."financial_report_announcement"
    WHERE symbol = '2330' AND fiscal_year = 115 AND fiscal_quarter = 2
    LIMIT 1
  `;
  const announcement = announcementRows[0];
  const result = await calculateAltmanZScore({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

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

  if (announcement) {
    assert.equal(result.marketCap.priceAnchorSource, 'announcement');
    assert.equal(result.marketCap.tradeDate, announcement.announcement_date.toISOString().slice(0, 10));
    assert.equal(result.warnings.length, 1, '有公告日資料時不應該出現 fallback 警告，只剩固定的產業適用性警告');
  } else {
    assert.equal(result.marketCap.priceAnchorSource, 'report_date_fallback');
    assert.equal(result.marketCap.tradeDate, '2026-06-30');
    assert.equal(result.warnings.length, 2, '查無公告日時應該有固定的產業適用性警告 + fallback 到期末日的警告');
    assert.match(result.warnings[1]!, /財報公告日/);
  }
  assert.match(result.warnings[0]!, /上市製造業樣本校準/);

  assert.deepEqual(result.fieldStatuses, {});
});

// 114Q2 的 financial_report_announcement 有資料（2330 公告日 2025-08-12，比期末日 2025-06-30
// 晚 43 天），驗證真的優先用了公告日，不是還在用期末日。
test('altmanZScore: 2330 114Q2 合併報表——有公告日資料，X4 股價基準應該用公告日不是期末日', async () => {
  const result = await calculateAltmanZScore({ symbol: '2330', year: '114', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(result.reportDate, '2025-06-30');
  assert.equal(result.marketCap.priceAnchorSource, 'announcement');
  assert.equal(result.marketCap.tradeDate, '2025-08-12');

  // 不應該出現 fallback 警告，只剩固定的產業適用性警告。
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0]!, /上市製造業樣本校準/);
});

test('altmanZScore: 不指定 year/season 時自動抓最新一季，結果應該跟指定最新季度一致', async () => {
  const explicit = await calculateAltmanZScore({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  const auto = await calculateAltmanZScore({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(auto.year, explicit.year);
  assert.equal(auto.season, explicit.season);
  assert.equal(auto.x1, explicit.x1);
  assert.equal(auto.x2, explicit.x2);
});

// 2026-09-04 改用保證不存在的假代號，不再挑真實公司（原本用 1101）——2026-08-30 改用
// oingg-twse daily_price 當市值資料源後覆蓋率大幅擴大，加上 mops-ts 的財報資料持續 ingest，
// 2026-09-04 實測發現 1101 現在已經有完整財報（115Q2 資產負債表/損益表都查得到）跟股價覆蓋率，
// X4 直接算出 0.626，這個測試案例的前提已經不成立。用假代號保證永遠查無任何資料，不會再因為
// 開發資料庫持續 ingest 真實資料而失敗——見 tests/shared/priceChange.test.ts 同樣用
// __NOT_A_REAL_SYMBOL__ 的作法。
test('altmanZScore: 不存在的公司代號，X1/X2/X3/X5 應該是 no_data，X4 應該是 not_applicable', async () => {
  const covered = await hasStockPriceCoverage('__NOT_A_REAL_SYMBOL__');
  const result = await calculateAltmanZScore({ symbol: '__NOT_A_REAL_SYMBOL__', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.equal(covered, false, '假代號不應該有任何股價覆蓋率');
  assert.equal(result.x4, null);
  assert.equal(result.fieldStatuses.x4?.status, 'not_applicable');
  assert.equal(result.zScore, null);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
