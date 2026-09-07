// 2026-09-07 使用者要「五年的三率」（毛利率/營業利益率/淨利率）。netProfitMargin 已經
// 隨 roe/roa/dupont 那批擴充到 109Q4~115Q2（見 backfillRoeRoaDupont5YearPit.ts），但
// grossMargin/operatingMargin 這兩個只 backfill 到 113Q3~115Q2（8 季/2年，原本
// backfillMarginsAndTurnoverPit.ts 的範圍）——這支腳本把 2330 的 grossMargin/
// operatingMargin 也補到同樣的 23 季範圍，讓「三率」三個指標涵蓋範圍一致。只做 2330
// （使用者這次沒有要求擴大到其他股票），不動 2887/2317 這兩個既有對照組。
//
// 用法：pnpm tsx scripts/backfillMargins5YearPit.ts

import { computeAndWriteMarginsFamilyPit } from '../src/pitMetrics/margins/computeMarginsFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const SYMBOLS = ['2330'];

// 109Q4 ~ 115Q2（民國年/季），跟 backfillRoeRoaDupont5YearPit.ts 同一個範圍，舊到新排列。
const QUARTERS: { year: string; season: '1' | '2' | '3' | '4' }[] = [
  { year: '109', season: '4' },
  { year: '110', season: '1' },
  { year: '110', season: '2' },
  { year: '110', season: '3' },
  { year: '110', season: '4' },
  { year: '111', season: '1' },
  { year: '111', season: '2' },
  { year: '111', season: '3' },
  { year: '111', season: '4' },
  { year: '112', season: '1' },
  { year: '112', season: '2' },
  { year: '112', season: '3' },
  { year: '112', season: '4' },
  { year: '113', season: '1' },
  { year: '113', season: '2' },
  { year: '113', season: '3' },
  { year: '113', season: '4' },
  { year: '114', season: '1' },
  { year: '114', season: '2' },
  { year: '114', season: '3' },
  { year: '114', season: '4' },
  { year: '115', season: '1' },
  { year: '115', season: '2' },
];

const main = async () => {
  await Promise.all(['grossMargin', 'operatingMargin'].map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  for (const symbol of SYMBOLS) {
    for (const { year, season } of QUARTERS) {
      const query = { symbol, year, season, dataType: '2' as const, subsidiaryCompanyId: '' };
      const outcome = await computeAndWriteMarginsFamilyPit(query);
      console.log(
        `[margins-family-pit] ${symbol} ${year}Q${season}: gross(Q=${JSON.stringify(outcome.grossMarginQ)}, TTM=${JSON.stringify(outcome.grossMarginTtm)}) operating(Q=${JSON.stringify(outcome.operatingMarginQ)}, TTM=${JSON.stringify(outcome.operatingMarginTtm)})`
      );
    }
  }
};

main()
  .catch((error) => {
    console.error('margins 五年擴充 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
