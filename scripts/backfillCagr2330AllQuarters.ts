// 2026-09-14 使用者要求：2330 補上五年指標——既有 backfillCagrFamiliesPit.ts 只回填「最新
// 一筆」，這裡改成對 2330 全部既有季度（109Q4~115Q2，共 23 季）逐一重算 revenueCagr/
// epsCagr/dividendGrowthRate 三個家族（各自 3/5/8 年），確認早期季度（例如 2024Q1~Q3
// 曾經是 insufficient_history）在全歷史資料都已回補完成後是否能算出真值。
//
// 用法：pnpm tsx scripts/backfillCagr2330AllQuarters.ts

import { computeAndWriteRevenueCagrFamilyPit } from '../src/domainPitMetrics/growth/revenueCagr/computeRevenueCagrFamilyPit';
import { computeAndWriteEpsCagrFamilyPit } from '../src/domainPitMetrics/growth/epsCagr/computeEpsCagrFamilyPit';
import { computeAndWriteDividendGrowthRateFamilyPit } from '../src/domainPitMetrics/dividend/dividendGrowthRate/computeDividendGrowthRateFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const SYMBOL = '2330';

// 109Q4 ~ 115Q2，2330 目前 metric_values 已知的全部季度範圍。
const QUARTERS: { year: string; season: '1' | '2' | '3' | '4' }[] = [
  { year: '109', season: '4' },
  { year: '110', season: '1' }, { year: '110', season: '2' }, { year: '110', season: '3' }, { year: '110', season: '4' },
  { year: '111', season: '1' }, { year: '111', season: '2' }, { year: '111', season: '3' }, { year: '111', season: '4' },
  { year: '112', season: '1' }, { year: '112', season: '2' }, { year: '112', season: '3' }, { year: '112', season: '4' },
  { year: '113', season: '1' }, { year: '113', season: '2' }, { year: '113', season: '3' }, { year: '113', season: '4' },
  { year: '114', season: '1' }, { year: '114', season: '2' }, { year: '114', season: '3' }, { year: '114', season: '4' },
  { year: '115', season: '1' }, { year: '115', season: '2' },
];

const main = async () => {
  await Promise.all(
    ['revenueCagr3y', 'revenueCagr5y', 'revenueCagr8y', 'epsCagr3y', 'epsCagr5y', 'epsCagr8y', 'dividendGrowthRate3y', 'dividendGrowthRate5y', 'dividendGrowthRate8y'].map(
      (code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)
    )
  );

  for (const { year, season } of QUARTERS) {
    const query = { symbol: SYMBOL, year, season, dataType: '2' as const, subsidiaryCompanyId: '' };
    const revenue = await computeAndWriteRevenueCagrFamilyPit(query);
    const eps = await computeAndWriteEpsCagrFamilyPit(query);
    const dividend = await computeAndWriteDividendGrowthRateFamilyPit(query);
    console.log(`[${year}Q${season}] revenue=${JSON.stringify(revenue.results)}`);
    console.log(`[${year}Q${season}] eps=${JSON.stringify(eps.results)}`);
    console.log(`[${year}Q${season}] dividend=${JSON.stringify(dividend.results)}`);
  }
};

main()
  .catch((error) => {
    console.error('2330 五年指標全歷史 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
