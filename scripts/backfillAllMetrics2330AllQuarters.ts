// 2026-09-14 使用者要求：2330 回補所有指標——不是只有五年期成長率（見
// backfillCagr2330AllQuarters.ts），是全部 GENERAL_METRIC_CODES 涵蓋的季報型指標。
//
// 2330 的原始財報資料深度比全市場回補範圍（113Q1~115Q2）更深，實測 metric_values 最早
// 已有 109Q4（2020Q4）的紀錄，這支腳本對 2330 全部既有季度（109Q4~115Q2，共 23 季）
// 逐季呼叫 buildGeneralTasks()（跟 backfillFullHistoryFullMarketPit.ts 用的是同一份、
// 沒有 top-level 執行副作用的任務清單模組），把 109Q4~112Q4（113Q1 之前、全市場回補
// 沒有涵蓋到）這 16 季也一次補齊；113Q1 之後理論上會是 skipped_unchanged（全市場回補
// 已經跑過）。逐日型（beta/marketRatios）不接受 quarter 參數，額外呼叫一次（只算「最新
// 可用交易日」，不是每個歷史交易日都算，跟既有慣例一致）。2330 不是銀行，不用跑
// buildBankTasks。
//
// 用法：pnpm tsx scripts/backfillAllMetrics2330AllQuarters.ts

import { buildGeneralTasks, runTasks } from './backfillTaskDefinitions';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const SYMBOL = '2330';

// 109Q4 ~ 115Q2，2330 目前 metric_values 已知的全部季度範圍（跟
// backfillCagr2330AllQuarters.ts 同一份清單）。
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
  for (const quarter of QUARTERS) {
    const { failures } = await runTasks(buildGeneralTasks(SYMBOL, quarter));
    if (failures.length > 0) {
      console.error(`[${quarter.year}Q${quarter.season}] ${failures.length} 個任務失敗：`, failures.map((f) => `${f.label}: ${String(f.error)}`).join('\n'));
    } else {
      console.log(`[${quarter.year}Q${quarter.season}] 完成，無失敗。`);
    }
  }

  // 逐日型（beta/marketRatios）不接受 quarter，只算一次最新可用交易日。
  const { failures: dailyFailures } = await runTasks(buildGeneralTasks(SYMBOL).filter(([label]) => label === 'beta' || label === 'marketRatios'));
  if (dailyFailures.length > 0) {
    console.error('逐日型任務失敗：', dailyFailures.map((f) => `${f.label}: ${String(f.error)}`).join('\n'));
  } else {
    console.log('逐日型（beta/marketRatios）完成，無失敗。');
  }
};

main()
  .catch((error) => {
    console.error('2330 全指標全歷史 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
