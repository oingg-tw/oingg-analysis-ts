// 2026-09-09 使用者要求：growth 分類加 5 支年增率指標（營收/EPS/淨利/營業利益/淨值），
// 資料不用全面，先做邏輯——第一版只回補 2330 最新一筆驗證。
//
// 2026-09-09 追加：web-nuxt 回報卡片只有 1 期資料，問是不是撞到 mops-ts 那個 2022Q1 財報
// 下限——不是，純粹是這支腳本第一版只查了「最新一期」，沒有逐季回補。改成跟
// backfillPeRatioAndPbRatioPit.ts 用同一個季度範圍（109Q4~115Q2，共 23 季）逐季回補，
// 讓兩邊卡片能顯示同樣深度的歷史。每支指標需要「去年同季」才能算成長率，越早的季度越
// 可能因為往前 5 季查無資料而寫入 null（insufficient_history），這是預期內的資料邊界，
// 不是 bug。
//
// 用法：pnpm tsx scripts/backfillGrowthPit.ts

import { computeAndWriteRevenueGrowthRatePit } from '../src/domainPitMetrics/growth/revenueGrowthRate/computeRevenueGrowthRatePit';
import { computeAndWriteEpsGrowthRatePit } from '../src/domainPitMetrics/growth/epsGrowthRate/computeEpsGrowthRatePit';
import { computeAndWriteNetIncomeGrowthRatePit } from '../src/domainPitMetrics/growth/netIncomeGrowthRate/computeNetIncomeGrowthRatePit';
import { computeAndWriteOperatingIncomeGrowthRatePit } from '../src/domainPitMetrics/growth/operatingIncomeGrowthRate/computeOperatingIncomeGrowthRatePit';
import { computeAndWriteEquityGrowthRatePit } from '../src/domainPitMetrics/growth/equityGrowthRate/computeEquityGrowthRatePit';
import { computeAndWriteBvpsGrowthRatePit } from '../src/domainPitMetrics/growth/bvpsGrowthRate/computeBvpsGrowthRatePit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const SYMBOLS = ['2330'];

// 跟 backfillPeRatioAndPbRatioPit.ts 同一個季度範圍（109Q4 ~ 115Q2），舊到新排列，
// 讓兩邊卡片顯示同樣深度的歷史。
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
  await Promise.all(
    ['revenueGrowthRate', 'epsGrowthRate', 'netIncomeGrowthRate', 'operatingIncomeGrowthRate', 'equityGrowthRate', 'bvpsGrowthRate'].map((code) =>
      upsertMetricDefinition(metricDefinitionRegistry[code]!)
    )
  );

  for (const symbol of SYMBOLS) {
    for (const { year, season } of QUARTERS) {
      const query = { symbol, year, season, dataType: '2' as const, subsidiaryCompanyId: '' };

      console.log(`[revenue-growth-rate-pit] ${symbol} ${year}Q${season}: ${JSON.stringify(await computeAndWriteRevenueGrowthRatePit(query))}`);
      console.log(`[eps-growth-rate-pit] ${symbol} ${year}Q${season}: ${JSON.stringify(await computeAndWriteEpsGrowthRatePit(query))}`);
      console.log(`[net-income-growth-rate-pit] ${symbol} ${year}Q${season}: ${JSON.stringify(await computeAndWriteNetIncomeGrowthRatePit(query))}`);
      console.log(`[operating-income-growth-rate-pit] ${symbol} ${year}Q${season}: ${JSON.stringify(await computeAndWriteOperatingIncomeGrowthRatePit(query))}`);
      console.log(`[equity-growth-rate-pit] ${symbol} ${year}Q${season}: ${JSON.stringify(await computeAndWriteEquityGrowthRatePit(query))}`);
      console.log(`[bvps-growth-rate-pit] ${symbol} ${year}Q${season}: ${JSON.stringify(await computeAndWriteBvpsGrowthRatePit(query))}`);
    }
  }
};

main()
  .catch((error) => {
    console.error('growth 五支指標 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
