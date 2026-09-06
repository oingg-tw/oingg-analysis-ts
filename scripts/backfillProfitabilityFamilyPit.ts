// Point-in-time 架構第二批遷移（ROA + Dupont 拆解家族）的手動觸發 backfill——不整合進
// src/api/batch，純 CLI 腳本，殼子比照 scripts/backfillRoePit.ts（跑完斷線）。
//
// 用法：pnpm tsx scripts/backfillProfitabilityFamilyPit.ts
// 對照組公司可用環境變數覆蓋：PIT_ROE_FALLBACK_SYMBOL=2317（沿用跟 backfillRoePit.ts 同一個
// 環境變數名稱，兩支腳本刻意用同一組符號/季度範圍，不需要分開設定）。
//
// 範圍（跟 backfillRoePit.ts 完全一致，兩份各自維護一份常數陣列，不抽共用檔案——兩份都是
// 小陣列，抽共用增加的間接層不划算）：
// - 2330/2887：financial_report_announcement 已驗證覆蓋，預期 knowledge_date 大多數
//   knowledgeDateIsFallback=false。
// - 對照組 2317（預設，可用 PIT_ROE_FALLBACK_SYMBOL 覆蓋）：financial_report_announcement
//   完全零筆，保證落到 report_date_fallback；且 114Q4 損益表缺資料，115Q1/115Q2 的 TTM
//   會自然湊不齊。
// - 季度範圍：113Q3~115Q2 共 8 季/家。
// - dataType 只做 '2'（合併報表）。

import { computeAndWriteRoaPit } from '../src/pitMetrics/roa/computeRoaPit';
import { computeAndWriteDupontFamilyPit } from '../src/pitMetrics/dupont/computeDupontFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const COVERED_SYMBOLS = ['2330', '2887'];
const FALLBACK_SYMBOL = process.env.PIT_ROE_FALLBACK_SYMBOL ?? '2317';
const SYMBOLS = [...COVERED_SYMBOLS, FALLBACK_SYMBOL];

// 113Q3 ~ 115Q2（民國年/季），舊到新排列。
const QUARTERS: { year: string; season: '1' | '2' | '3' | '4' }[] = [
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
  await Promise.all([
    upsertMetricDefinition(metricDefinitionRegistry.roa!),
    upsertMetricDefinition(metricDefinitionRegistry.netProfitMargin!),
    upsertMetricDefinition(metricDefinitionRegistry.assetTurnover!),
    upsertMetricDefinition(metricDefinitionRegistry.equityMultiplier!),
    upsertMetricDefinition(metricDefinitionRegistry.dupontDecomposedRoe!),
  ]);

  for (const symbol of SYMBOLS) {
    for (const { year, season } of QUARTERS) {
      const roaOutcome = await computeAndWriteRoaPit({ symbol, year, season, dataType: '2', subsidiaryCompanyId: '' });
      console.log(`[roa-pit] ${symbol} ${year}Q${season}: q=${JSON.stringify(roaOutcome.q)} qAnn=${JSON.stringify(roaOutcome.qAnn)} ttm=${JSON.stringify(roaOutcome.ttm)}`);

      const dupontOutcome = await computeAndWriteDupontFamilyPit({ symbol, year, season, dataType: '2', subsidiaryCompanyId: '' });
      console.log(
        `[dupont-family-pit] ${symbol} ${year}Q${season}: ` +
          `netProfitMargin(Q=${JSON.stringify(dupontOutcome.netProfitMarginQ)}, TTM=${JSON.stringify(dupontOutcome.netProfitMarginTtm)}) ` +
          `assetTurnover(Q=${JSON.stringify(dupontOutcome.assetTurnoverQ)}, Q_ANN=${JSON.stringify(dupontOutcome.assetTurnoverQAnn)}, TTM=${JSON.stringify(dupontOutcome.assetTurnoverTtm)}) ` +
          `equityMultiplier=${JSON.stringify(dupontOutcome.equityMultiplier)} ` +
          `decomposedRoe(Q=${JSON.stringify(dupontOutcome.dupontDecomposedRoeQ)}, TTM=${JSON.stringify(dupontOutcome.dupontDecomposedRoeTtm)})`
      );
    }
  }
};

main()
  .catch((error) => {
    console.error('ROA + Dupont 拆解家族 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
