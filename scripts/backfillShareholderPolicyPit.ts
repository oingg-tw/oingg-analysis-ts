// 2026-09-09 使用者要求：股東政策分類再加三支指標（買回殖利率/股利保障倍數/股本變化率），
// 資料不用全面，先做邏輯——第一版只回補 2330 最新一筆驗證。
//
// 2026-09-09 追加：web-nuxt 回報 shareCountChangeRate 卡在只有 1 期（跟 growth 那批一樣
// 的根因，不是資料源缺口），改成跟 backfillPeRatioAndPbRatioPit.ts 同一個季度範圍逐季回補。
//
// 用法：pnpm tsx scripts/backfillShareholderPolicyPit.ts
import { computeAndWriteBuybackYieldPit, computeAndWriteDividendCoverageRatioPit, computeAndWriteShareCountChangeRatePit } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { disconnectAllDbs } from '../src/bootstrap/db';
import { reportAvailability } from '../src/bootstrap/scripts';

const SYMBOLS = ['2330'];

// 跟 backfillPeRatioAndPbRatioPit.ts/backfillGrowthPit.ts 同一個季度範圍（109Q4 ~ 115Q2）。
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
    ['buybackYield', 'dividendCoverageRatio', 'shareCountChangeRate'].map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!))
  );

  for (const symbol of SYMBOLS) {
    for (const { year, season } of QUARTERS) {
      const query = { symbol, year, season, dataType: await reportAvailability.resolveDataType(symbol), subsidiaryCompanyId: '' };

      const buybackOutcome = await computeAndWriteBuybackYieldPit(query);
      console.log(`[buyback-yield-pit] ${symbol} ${year}Q${season}: ${JSON.stringify(buybackOutcome)}`);

      const coverageOutcome = await computeAndWriteDividendCoverageRatioPit(query);
      console.log(`[dividend-coverage-ratio-pit] ${symbol} ${year}Q${season}: ${JSON.stringify(coverageOutcome)}`);

      const shareChangeOutcome = await computeAndWriteShareCountChangeRatePit(query);
      console.log(`[share-count-change-rate-pit] ${symbol} ${year}Q${season}: ${JSON.stringify(shareChangeOutcome)}`);
    }
  }
};

main()
  .catch((error) => {
    console.error('股東政策三支指標 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
