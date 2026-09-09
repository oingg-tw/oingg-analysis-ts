// ROE spike 的手動觸發 backfill——不整合進 src/api/batch（IndicatorJob/indicatorRegistry/
// 排程），純 CLI 腳本，殼子比照 scripts/batchComputeIndicators.ts（跑完斷線）。
//
// 用法：pnpm tsx scripts/backfillRoePit.ts
// 對照組公司可用環境變數覆蓋：PIT_ROE_FALLBACK_SYMBOL=2317
//
// 範圍（刻意限縮，不是全市場——見 plan 文件「backfill 範圍」一節）：
// - 2330/2887：financial_report_announcement 已驗證覆蓋（110Q4~115Q2，比原本估計的「只有
//   114 年度」廣，覆蓋率會持續成長），預期 knowledge_date 大多數 knowledgeDateIsFallback=false。
//   原計畫的第三家 6488 實測後發現 quarterly_income_statement 完全零資料（無論 dataType
//   '1'/'2'），改用 2317 取代。
// - 對照組 2317（預設，可用 PIT_ROE_FALLBACK_SYMBOL 覆蓋）：financial_report_announcement
//   完全零筆，保證落到 report_date_fallback；且 114Q4 損益表缺資料，115Q1/115Q2 的 TTM
//   會自然湊不齊，同時驗證 fallback 標記跟 insufficient_history 兩種真實案例。
// - 季度範圍：113Q3~115Q2 共 8 季/家。
// - dataType 只做 '2'（合併報表）。

import { computeAndWriteRoePit } from '../src/domainPitMetrics/profitability/roe/computeRoePit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';
import { PIT_BACKFILL_SYMBOLS, PIT_BACKFILL_QUARTERS } from './pitBackfillFixtures';

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.roe!);

  for (const symbol of PIT_BACKFILL_SYMBOLS) {
    for (const { year, season } of PIT_BACKFILL_QUARTERS) {
      const outcome = await computeAndWriteRoePit({ symbol, year, season, dataType: '2', subsidiaryCompanyId: '' });
      console.log(`[roe-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(outcome.q)} qAnn=${JSON.stringify(outcome.qAnn)} ttm=${JSON.stringify(outcome.ttm)}`);
    }
  }
};

main()
  .catch((error) => {
    console.error('ROE spike backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
