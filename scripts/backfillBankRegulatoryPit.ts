// Point-in-time 架構——銀行業專屬指標（CAR/CET1/Tier1/逾放比/備抵呆帳覆蓋率）的手動觸發
// backfill——不整合進 src/api/batch，純 CLI 腳本，殼子比照 scripts/backfillGuruPit.ts。
//
// 用法：pnpm tsx scripts/backfillBankRegulatoryPit.ts
// **不沿用** pitBackfillFixtures.ts 的 PIT_BACKFILL_SYMBOLS（2330/2887/2317 都不是銀行），
// 改用這批自己的銀行股清單——2026-09-06 直接查 mops-ts export DB 驗證過都有真實資料。
// 季度範圍沿用共用的 PIT_BACKFILL_QUARTERS（113Q3~115Q2）；銀行 XBRL 資料目前只回填到
// 114Q1 左右，更早的季度會自然寫出 missing_input 的 null 列，不是錯誤，是預期的優雅降級。
import { computeAndWriteBankAssetQualityFamilyPit, computeAndWriteBankCapitalAdequacyFamilyPit } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { PIT_BACKFILL_QUARTERS } from './pitBackfillFixtures';
import { disconnectAllDbs } from '../src/bootstrap/db';

const BANK_SYMBOLS = ['2801', '2812', '2834'];

const METRIC_CODES = ['bankNplRatio', 'bankNplCoverageRatio', 'bankCarRatio', 'bankCet1Ratio', 'bankTier1Ratio'];

const main = async () => {
  await Promise.all(METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  for (const symbol of BANK_SYMBOLS) {
    for (const { year, season } of PIT_BACKFILL_QUARTERS) {
      const query = { symbol, year, season, dataType: '2' as const, subsidiaryCompanyId: '' };

      const assetQualityOutcome = await computeAndWriteBankAssetQualityFamilyPit(query);
      console.log(
        `[bank-asset-quality-pit] ${symbol} ${year}Q${season}: npl=${JSON.stringify(assetQualityOutcome.bankNplRatio)} coverage=${JSON.stringify(assetQualityOutcome.bankNplCoverageRatio)}`
      );

      const capitalAdequacyOutcome = await computeAndWriteBankCapitalAdequacyFamilyPit(query);
      console.log(
        `[bank-capital-adequacy-pit] ${symbol} ${year}Q${season}: car=${JSON.stringify(capitalAdequacyOutcome.bankCarRatio)} cet1=${JSON.stringify(capitalAdequacyOutcome.bankCet1Ratio)} tier1=${JSON.stringify(capitalAdequacyOutcome.bankTier1Ratio)}`
      );
    }
  }
};

main()
  .catch((error) => {
    console.error('銀行業專屬指標 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
